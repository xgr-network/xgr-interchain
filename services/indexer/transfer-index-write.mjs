// Pure SQL projection: all economic/source facts arrive pre-verified from the
// XGR Node read-index adapter. No EVM RPC transport, no key and no settlement.
// Existing tax/paid-event provenance INSERT and SQL constraints are preserved.
const normalize=x=>String(x||"").toLowerCase();
export async function storeVerifiedOperation(db,{route,event,record}){
   if(!record||normalize(record.messageId)!==normalize(event.messageId)||
     normalize(record.sourceTxHash)!==normalize(event.txHash)||
     normalize(record.routeId)!==normalize(route.routeId)||
     normalize(record.gateway)!==normalize(route.gateway)||
     normalize(record.account)===""||
     record.sourceChain!==route.sourceChain||record.destinationChain!==route.destinationChain)
    throw Error("Canonical source event and validated operation do not match");
   if(record.onwardRouteId!==null&&record.onwardRouteId!==undefined){
    if(!/^0x[0-9a-f]{64}$/i.test(record.onwardRouteId)||
      record.sourceChain===record.finalDestinationChain||
      record.destinationChain!=="xgrchain"||
      !/^0x[0-9a-f]{40}$/i.test(record.executionAdapter||"")||
      !/^0x[0-9a-f]{40}$/i.test(record.finalRecipient||"")||
      !/^[1-9][0-9]*$/.test(String(record.interchainFeeWei||"")))
      throw Error("Inconsistent adapter-backed onward journey");
   }
   if(record.parentMessageId){
    if(record.sourceChain!=="xgrchain"||record.onwardRouteId||
      !/^0x[0-9a-f]{64}$/i.test(record.parentMessageId)||
      !/^0x[0-9a-f]{40}$/i.test(record.executionAdapter||"")||
      record.interchainFeeWei!=null||
      !/^[1-9][0-9]*$/.test(String(record.amountRaw||"")))
     throw Error("Invalid cryptographically linked onward event");
   }
   const params=[
    record.sourceChain,record.messageId,record.sourceTxHash,event.blockNumber,
    event.blockHash,event.logIndex,record.account,record.asset,record.assetId,
    record.routeName,record.routeId,record.gateway,record.destinationChain,
    record.destinationMailbox,record.amountRaw,record.validatorFeeWei,
    null,record.executionAdapter??null,record.interchainFeeWei??null,
    record.finalDestinationChain??null,record.finalRecipient??null,
    record.onwardRouteId??null,record.parentMessageId??null,
    event.sourceBlockAt??null,record.quoteNonce??null
   ];
   const row=await db.query({text:`INSERT INTO xita_transfer_operations(
    source_chain,message_id,source_tx_hash,source_block_number,source_block_hash,source_log_index,
    account,asset,asset_id,route_name,route_id,gateway,destination_chain,
    destination_mailbox,amount_raw,validator_fee_wei,delivered,delivery_checked_at,
    execution_adapter,interchain_fee_wei,final_destination_chain,final_recipient,onward_route_id,parent_message_id,source_block_at,escrow_outflow_observed_at,quote_nonce)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
      CASE WHEN $17::boolean IS NULL THEN NULL ELSE NOW() END,
      $18,$19,$20,$21,$22,$23,$24,
      NULL,$25)
    ON CONFLICT(source_chain,message_id) DO UPDATE SET
      delivered=xita_transfer_operations.delivered,
      delivery_checked_at=CASE WHEN EXCLUDED.delivered IS NULL
       THEN xita_transfer_operations.delivery_checked_at ELSE NOW() END,
      execution_adapter=EXCLUDED.execution_adapter,
      interchain_fee_wei=EXCLUDED.interchain_fee_wei,
      quote_nonce=COALESCE(xita_transfer_operations.quote_nonce,EXCLUDED.quote_nonce),
      final_destination_chain=EXCLUDED.final_destination_chain,
      final_recipient=EXCLUDED.final_recipient,
      onward_route_id=EXCLUDED.onward_route_id,
      parent_message_id=EXCLUDED.parent_message_id,
      source_block_at=COALESCE(xita_transfer_operations.source_block_at,EXCLUDED.source_block_at),
      escrow_outflow_observed_at=xita_transfer_operations.escrow_outflow_observed_at
    WHERE xita_transfer_operations.parent_message_id IS NOT DISTINCT FROM EXCLUDED.parent_message_id
      AND xita_transfer_operations.execution_adapter IS NOT DISTINCT FROM EXCLUDED.execution_adapter
      AND xita_transfer_operations.interchain_fee_wei IS NOT DISTINCT FROM EXCLUDED.interchain_fee_wei
      AND (xita_transfer_operations.quote_nonce IS NULL OR
           xita_transfer_operations.quote_nonce IS NOT DISTINCT FROM EXCLUDED.quote_nonce)
      AND xita_transfer_operations.final_destination_chain IS NOT DISTINCT FROM EXCLUDED.final_destination_chain
      AND xita_transfer_operations.final_recipient IS NOT DISTINCT FROM EXCLUDED.final_recipient
      AND xita_transfer_operations.onward_route_id IS NOT DISTINCT FROM EXCLUDED.onward_route_id
      AND xita_transfer_operations.source_tx_hash=EXCLUDED.source_tx_hash AND
      xita_transfer_operations.source_block_hash=EXCLUDED.source_block_hash AND
      xita_transfer_operations.account=EXCLUDED.account AND
      xita_transfer_operations.route_id=EXCLUDED.route_id AND
      xita_transfer_operations.asset_id=EXCLUDED.asset_id
    RETURNING message_id`,values:params});
   if(row.rows.length!==1)throw Error("Conflicting immutable message provenance");
   if(record.interchainFeeWei!==null&&record.interchainFeeWei!==undefined){
    if(!/^[1-9][0-9]*$/.test(String(record.quoteNonce||"")))
     throw Error("Verified initial paid event missing quote nonce");
    await db.query({text:`INSERT INTO xita_tax_charged_fees (
      source_chain,message_id,source_tx_hash,source_block_number,source_block_hash,
      payer,execution_adapter,quote_nonce,service_fee_wei,client_ip,
      ip_country_code,ip_country_source,ip_country_db_revision,
      native_coin_id,native_eur_price,gross_fee_eur,eur_price_source,eur_price_at,evidence_status)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,q.client_ip,
       q.ip_country_code,q.ip_country_source,q.ip_country_db_revision,
       q.native_coin_id,q.native_eur_price,q.gross_fee_eur,q.eur_price_source,
       q.eur_price_at,CASE WHEN q.quote_nonce IS NULL THEN 'missing_quote' WHEN q.ip_country_code IS NULL OR q.native_eur_price IS NULL OR q.gross_fee_eur IS NULL THEN 'partial' ELSE 'matched' END
      FROM (SELECT 1) x LEFT JOIN xita_tax_quote_evidence q
       ON q.source_chain=$1 AND q.execution_adapter=$7 AND q.payer=$6
         AND q.quote_nonce=$8 AND q.quoted_fee_wei=$9
      ON CONFLICT(source_chain,message_id) DO NOTHING`,values:[
      record.sourceChain,record.messageId,record.sourceTxHash,event.blockNumber,
      event.blockHash,record.account,record.executionAdapter,record.quoteNonce,
      record.interchainFeeWei]});
   }
}
