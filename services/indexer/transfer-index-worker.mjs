// Standalone finalized-chain event ingestion for the EXISTING XITA indexer DB.
// It writes ONLY the derived xita_transfer_* read-model tables, no live assets.
// Canonical RPC observations are revalidated on reorg and every delivery scan.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";
import {indexedRoutes,readRouteWindow,verifiedTransfer,checkedDelivery,canonicalRpc} from "./transfer-index.mjs";
import {transferWriterPool} from "./transfer-index-store.mjs";
import {OPERATION_TOPIC} from "../../apps/web/wallet-transfers.js";
const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const normalize=x=>String(x||"").toLowerCase();
export async function loadCursor(pool,route){
 const result=await pool.query({text:`SELECT source_chain,route_name,gateway,route_id,
 deployment_block,scanned_to,scanned_hash,finalized_head
 FROM xita_transfer_index_cursors WHERE source_chain=$1 AND route_id=$2`,
  values:[route.sourceChain,route.routeId]});
 if(result.rows.length>1)throw Error("Ambiguous transfer cursor");
 const c=result.rows[0];
 if(!c)return null;
 if(normalize(c.gateway)!==normalize(route.gateway)||normalize(c.route_id)!==normalize(route.routeId)||
   Number(c.deployment_block)!==route.deploymentBlock)return {stale:true};
 const scannedTo=Number(c.scanned_to);
 if(!Number.isSafeInteger(scannedTo)||scannedTo<route.deploymentBlock-1)
  throw Error("Invalid persisted transfer cursor");
 return {scannedTo,scannedHash:c.scanned_hash};
}
async function withTransaction(pool,fn){
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const value=await fn(client);
  await client.query("COMMIT");
  return value;
 }catch(error){
  await client.query("ROLLBACK").catch(()=>{});
  throw error;
 }finally{client.release();}
}
export async function resetIndexedRoute({pool,route}){
 await withTransaction(pool,async db=>{
  await db.query({text:"DELETE FROM xita_transfer_operations WHERE source_chain=$1 AND route_id=$2",
   values:[route.sourceChain,route.routeId]});
  await db.query({text:"DELETE FROM xita_transfer_index_cursors WHERE source_chain=$1 AND route_id=$2",
   values:[route.sourceChain,route.routeId]});
 });
}
// Same immutable provenance checks for historical eth_getLogs and the
// accelerated TX-hash path. Neither mode may write an unverified operation.
async function storeVerifiedOperation(db,{route,event,record}){
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
    record.delivered,record.executionAdapter??null,record.interchainFeeWei??null,
    record.finalDestinationChain??null,record.finalRecipient??null,
    record.onwardRouteId??null,record.parentMessageId??null
   ];
   const row=await db.query({text:`INSERT INTO xita_transfer_operations(
    source_chain,message_id,source_tx_hash,source_block_number,source_block_hash,source_log_index,
    account,asset,asset_id,route_name,route_id,gateway,destination_chain,
    destination_mailbox,amount_raw,validator_fee_wei,delivered,delivery_checked_at,
    execution_adapter,interchain_fee_wei,final_destination_chain,final_recipient,onward_route_id,parent_message_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
      CASE WHEN $17::boolean IS NULL THEN NULL ELSE NOW() END,
      $18,$19,$20,$21,$22,$23)
    ON CONFLICT(source_chain,message_id) DO UPDATE SET
      delivered=CASE WHEN xita_transfer_operations.delivered IS TRUE THEN TRUE
       ELSE EXCLUDED.delivered END,
      delivery_checked_at=CASE WHEN EXCLUDED.delivered IS NULL
       THEN xita_transfer_operations.delivery_checked_at ELSE NOW() END,
      execution_adapter=EXCLUDED.execution_adapter,
      interchain_fee_wei=EXCLUDED.interchain_fee_wei,
      final_destination_chain=EXCLUDED.final_destination_chain,
      final_recipient=EXCLUDED.final_recipient,
      onward_route_id=EXCLUDED.onward_route_id,
      parent_message_id=EXCLUDED.parent_message_id
    WHERE xita_transfer_operations.parent_message_id IS NOT DISTINCT FROM EXCLUDED.parent_message_id
      AND xita_transfer_operations.execution_adapter IS NOT DISTINCT FROM EXCLUDED.execution_adapter
      AND xita_transfer_operations.interchain_fee_wei IS NOT DISTINCT FROM EXCLUDED.interchain_fee_wei
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
}
export async function commitWindow({pool,route,window,records}){
 if(!Array.isArray(records)||records.length!==window.events.length||
   (window.to>=window.from&&!/^0x[0-9a-f]{64}$/i.test(window.hash||"")))
  throw Error("Index window is incomplete");
 return withTransaction(pool,async db=>{
  // Lock the route cursor so overlapping workers cannot commit stale windows.
  const cursorResult=await db.query({text:`SELECT scanned_to,scanned_hash FROM
   xita_transfer_index_cursors WHERE source_chain=$1 AND route_id=$2 FOR UPDATE`,
   values:[route.sourceChain,route.routeId]});
  const previous=cursorResult.rows[0],last=previous?Number(previous.scanned_to):route.deploymentBlock-1;
  if(last!==window.from-1)throw Error("Conflicting transfer index cursor; retry from chain");
  for(let i=0;i<window.events.length;i++){
   const event=window.events[i],record=records[i];
   await storeVerifiedOperation(db,{route,event,record});
  }
  const scannedTo=window.to<window.from?window.from-1:window.to;
  const scannedHash=window.hash||previous?.scanned_hash||null;
  await db.query({text:`INSERT INTO xita_transfer_index_cursors(
   source_chain,route_name,gateway,route_id,deployment_block,
   scanned_to,scanned_hash,finalized_head,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())
   ON CONFLICT(source_chain,route_id) DO UPDATE SET
   gateway=EXCLUDED.gateway,route_id=EXCLUDED.route_id,
   deployment_block=EXCLUDED.deployment_block,scanned_to=EXCLUDED.scanned_to,
   scanned_hash=EXCLUDED.scanned_hash,finalized_head=EXCLUDED.finalized_head,
   updated_at=NOW()`,
   values:[route.sourceChain,route.routeName,route.gateway,route.routeId,
    route.deploymentBlock,scannedTo,scannedHash,window.finalizedHead]});
  return {indexed:records.length,scannedTo,finalizedHead:window.finalizedHead};
 });
}
export async function scanIndexedRoute({catalog,route,pool,rpc,limit=150}){
 let cursor=await loadCursor(pool,route);
 if(cursor?.stale){await resetIndexedRoute({pool,route});cursor=null;}
 let window=await readRouteWindow({route,cursor,rpc,limit});
 if(window.reorg){
  await resetIndexedRoute({pool,route});
  window=await readRouteWindow({route,cursor:null,rpc,limit});
  if(window.reorg)throw Error("Reorg reset failed");
 }
 const records=[];
 for(const log of window.events){
  const item=await verifiedTransfer({catalog,route,
   transactionHash:log.txHash,rpc});
  if(normalize(item.messageId)!==log.messageId)
   throw Error("Verified source receipt does not contain the indexed message");
  records.push(item);
 }
 return commitWindow({pool,route,window,records});
}
export async function refreshPendingDeliveries({pool,routes,rpc,limit=40}){
 const all=new Map(routes.map(r=>[r.sourceChain+":"+r.routeId,r]));
 const pending=await pool.query({text:`SELECT source_chain,route_id,message_id FROM
 xita_transfer_operations WHERE delivered IS DISTINCT FROM TRUE
 ORDER BY delivery_attempted_at ASC NULLS FIRST,source_indexed_at ASC LIMIT $1`,values:[limit]});
 let checked=0,delivered=0,unknown=0;
 for(const row of pending.rows){
  const route=all.get(row.source_chain+":"+row.route_id);
  if(!route){unknown++;continue;}
  try{
   const result=await checkedDelivery({route,messageId:row.message_id,rpc});
   if(result.delivered===null){unknown++;continue;}
   await pool.query({text:`UPDATE xita_transfer_operations SET
    delivered=$3,delivery_checked_at=NOW()
    WHERE source_chain=$1 AND message_id=$2
      AND delivered IS DISTINCT FROM TRUE`,
    values:[row.source_chain,row.message_id,result.delivered]});
   checked++;if(result.delivered)delivered++;
  }catch{unknown++;}
  finally{
   // Scheduling metadata only: an RPC timeout does NOT assert delivery status.
   await pool.query({text:`UPDATE xita_transfer_operations SET
    delivery_attempted_at=NOW()
    WHERE source_chain=$1 AND message_id=$2 AND delivered IS DISTINCT FROM TRUE`,
    values:[row.source_chain,row.message_id]}).catch(()=>{});
  }
 }
 return {checked,delivered,unknown};
}

// Staging announcements are *not* blockchain data. Only a real canonical
// eth_getTransactionByHash + receipt + Gateway/Mailbox events can publish an
// operation into xita_transfer_operations. A wallet string submitted over HTTP
// is never sufficient for confirmation or for a delivery signature.
const TX=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const quantity=x=>typeof x==="string"&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(x);
const asNumber=x=>quantity(x)&&BigInt(x)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(x)):null;
const validBlock=x=>TX.test(x||"");
const nowPlus=(attempts)=>Math.min(900,15*2**Math.min(6,Math.max(0,attempts)));

// A failed, replaced or unknown transaction does not become a source lock.
// Retry backoff is finite; canonical route scans remain the historical source
// of truth even if no one ever submits an announcement.
export async function setAnnouncementState(pool,hint,state,{now=Date.now(),retry=true,proof=null}={}){
 const attempts=Math.min(999,Number(hint.attempts||0)+1);
 const ttl=now-new Date(hint.first_reported_at).getTime()>48*3600000;
 const final=ttl&&state!=="indexed"?"rejected":state;
 const next=retry&&final!=="rejected"&&final!=="indexed"?
  new Date(now+nowPlus(attempts)*1000):new Date(now+30*86400000);
 await pool.query({text:`UPDATE xita_transfer_announcements SET
   state=$3,attempts=$4,last_attempt_at=NOW(),next_attempt_at=$5,
   verified_block_number=COALESCE($6,verified_block_number),
   verified_block_hash=COALESCE($7,verified_block_hash),
   verified_message_id=COALESCE($8,verified_message_id)
   WHERE source_chain=$1 AND source_tx_hash=$2 AND account=$9`,
  values:[hint.source_chain,hint.source_tx_hash,final,attempts,next,
   proof?.blockNumber??null,proof?.blockHash??null,proof?.messageId??null,hint.account]});
 return final;
}
// This accelerated path reads ONE transaction hash, never scans a user
// selected block range or lets the browser supply a Gateway address.
export async function inspectAnnouncedTx({catalog,routes,rpc,pool,hint,now=Date.now()}){
 const related=routes.filter(rt=>rt.sourceChain===hint.source_chain);
 if(!related.length||!ADDRESS.test(hint.account||"")||!TX.test(hint.source_tx_hash||"")){
  await setAnnouncementState(pool,hint,"rejected",{now,retry:false});return {status:"rejected"};
 }
 const chain=related[0].sourceConfig;
 const tx=await rpc(chain,"eth_getTransactionByHash",[hint.source_tx_hash]);
 if(!tx){
  await setAnnouncementState(pool,hint,"reported",{now});return {status:"reported"};
 }
 const matchingTarget=related.some(rt=>
  normalize(tx.to)===normalize(rt.gateway)||
  rt.executionAdapter&&normalize(tx.to)===normalize(rt.executionAdapter));
 if(normalize(tx.from)!==normalize(hint.account)||!matchingTarget||
   normalize(tx.hash)!==normalize(hint.source_tx_hash)){
  await setAnnouncementState(pool,hint,"rejected",{now,retry:false});return {status:"rejected"};
 }
 const receipt=await rpc(chain,"eth_getTransactionReceipt",[hint.source_tx_hash]);
 if(!receipt){
  await setAnnouncementState(pool,hint,"observed",{now});return {status:"observed"};
 }
 if(normalize(receipt.transactionHash)!==normalize(hint.source_tx_hash)||
   normalize(receipt.from)!==normalize(hint.account)||
   normalize(receipt.to)!==normalize(tx.to)||
   receipt.status!=="0x1"||!Array.isArray(receipt.logs)){
  await setAnnouncementState(pool,hint,"rejected",{now,retry:false});return {status:"rejected"};
 }
 const blockNumber=asNumber(receipt.blockNumber);
 if(blockNumber===null||!validBlock(receipt.blockHash)){
  await setAnnouncementState(pool,hint,"observed",{now});return {status:"observed"};
 }
 const id=await rpc(chain,"eth_chainId",[]);
 if(!quantity(id)||BigInt(id)!==BigInt(chain.chainId))
  throw Error("Announced TX RPC chain identity mismatch");
 const head=asNumber(await rpc(chain,"eth_blockNumber",[]));
 if(head===null)throw Error("Announced TX source head invalid");
 const depth=Math.max(1,Number(chain.confirmations||1));
 if(blockNumber+depth>head){
  await setAnnouncementState(pool,hint,"observed",{now});return {status:"observed"};
 }
 const block=await rpc(chain,"eth_getBlockByNumber",["0x"+blockNumber.toString(16),false]);
 if(!block||normalize(block.hash)!==normalize(receipt.blockHash)){
  await setAnnouncementState(pool,hint,"reported",{now});return {status:"reported"};
 }
 // Canonical log identity is obtained from the verified receipt itself.
 // A multi-Gateway/ambiguous transaction fails closed; it cannot fabricate
 // a separate transfer by reporting the same hash repeatedly.
 const matches=[];
 for(const route of related){
  if(blockNumber<route.deploymentBlock)continue;
  for(const log of receipt.logs){
   if(log.removed===true||normalize(log.transactionHash)!==normalize(hint.source_tx_hash)||
     normalize(log.address)!==normalize(route.gateway)||
     normalize(log.topics?.[0])!==normalize(OPERATION_TOPIC)||
     normalize(log.topics?.[1])!==normalize(route.routeId)||
     !TX.test(log.topics?.[2]||"")||
     normalize(log.blockHash)!==normalize(receipt.blockHash)||
     asNumber(log.blockNumber)!==blockNumber||
     asNumber(log.logIndex)===null)continue;
   matches.push({route,event:{txHash:normalize(hint.source_tx_hash),
    messageId:normalize(log.topics[2]),blockNumber,blockHash:normalize(receipt.blockHash),
    logIndex:asNumber(log.logIndex)}});
  }
 }
 if(matches.length!==1){
  await setAnnouncementState(pool,hint,"rejected",{now,retry:false});return {status:"rejected"};
 }
 const {route,event}=matches[0];
 const record=await verifiedTransfer({catalog,route,transactionHash:hint.source_tx_hash,rpc});
 if(normalize(record.account)!==normalize(hint.account)||
    normalize(record.messageId)!==event.messageId||
    normalize(record.routeId)!==normalize(route.routeId))
  throw Error("Accelerated verification does not match immutable Gateway event");
 // A direct hint may reach a newer finalized block than the normal route cursor.
 // It does NOT advance the historical cursor. Reorg revalidation runs each tick.
 await withTransaction(pool,async db=>{
  await storeVerifiedOperation(db,{route,event,record});
  await db.query({text:`UPDATE xita_transfer_announcements SET state='indexed',
    attempts=attempts+1,last_attempt_at=NOW(),
    next_attempt_at=NOW()+INTERVAL '30 days',
    verified_block_number=$4,verified_block_hash=$5,
    verified_message_id=$6 WHERE source_chain=$1 AND source_tx_hash=$2
    AND account=$3`,values:[hint.source_chain,hint.source_tx_hash,hint.account,
    blockNumber,event.blockHash,event.messageId]});
 });
 return {status:"indexed",messageId:event.messageId,sourceTxHash:hint.source_tx_hash};
}
export async function processTransferAnnouncements({catalog,routes,pool,rpc,limit=12,now=Date.now()}){
 if(!Number.isInteger(limit)||limit<1||limit>25)throw Error("Unsafe hint batch size");
 const selected=await pool.query({text:`SELECT source_chain,source_tx_hash,account,
   attempts,first_reported_at FROM xita_transfer_announcements
   WHERE state IN ('reported','observed') AND next_attempt_at<=NOW()
   ORDER BY next_attempt_at,first_reported_at LIMIT $1`,values:[limit]});
 let indexed=0,observed=0,rejected=0,deferred=0;
 for(const hint of selected.rows){
  try{
   const result=await inspectAnnouncedTx({catalog,routes,pool,rpc,hint,now});
   if(result.status==="indexed")indexed++;
   else if(result.status==="observed")observed++;
   else if(result.status==="rejected")rejected++;
   else deferred++;
  }catch(error){
   // Failed archive/RPC must not overwrite a verified result or claim a zero.
   await setAnnouncementState(pool,hint,"reported",{now}).catch(()=>{});
   deferred++;
  }
 }
 return {selected:selected.rows.length,indexed,observed,rejected,deferred};
}
// Re-check fast-path blocks until the complete historical route scan covers
// them. If a source block reorged, retract ONLY its derived operation and retry.
export async function reconcileAnnouncedBlocks({pool,routes,rpc,limit=12}){
 const indexed=await pool.query({text:`SELECT a.source_chain,a.source_tx_hash,a.account,
  a.verified_block_number,a.verified_block_hash,a.verified_message_id,
  o.route_id,c.scanned_to FROM xita_transfer_announcements a
  LEFT JOIN xita_transfer_operations o ON o.source_chain=a.source_chain
    AND o.source_tx_hash=a.source_tx_hash
    AND o.message_id=a.verified_message_id
  LEFT JOIN xita_transfer_index_cursors c ON c.source_chain=o.source_chain
    AND c.route_id=o.route_id
  WHERE a.state='indexed' AND
    (a.last_attempt_at IS NULL OR a.last_attempt_at<NOW()-INTERVAL '2 minutes')
    AND (o.message_id IS NULL OR c.scanned_to IS NULL
    OR c.scanned_to<a.verified_block_number)
  ORDER BY a.last_attempt_at NULLS FIRST LIMIT $1`,values:[limit]});
 let checked=0,retracted=0;
 for(const row of indexed.rows){
  const route=routes.find(r=>r.sourceChain===row.source_chain&&
    normalize(r.routeId)===normalize(row.route_id));
  if(!route||!Number.isSafeInteger(Number(row.verified_block_number))){
   // A missing canonical row or changed manifest must be reconciled by the
   // normal scanner. Do not leave an uncheckable 'indexed' hint forever.
   await pool.query({text:`UPDATE xita_transfer_announcements SET
     state='reported',next_attempt_at=NOW(),
     verified_block_number=NULL,verified_block_hash=NULL,
     verified_message_id=NULL WHERE source_chain=$1 AND source_tx_hash=$2
     AND account=$3 AND state='indexed'`,
    values:[row.source_chain,row.source_tx_hash,row.account]});
   continue;
  }
  try{
   const block=await rpc(route.sourceConfig,"eth_getBlockByNumber",[
    "0x"+BigInt(row.verified_block_number).toString(16),false]);
   if(normalize(block?.hash)===normalize(row.verified_block_hash)){
    checked++;
    await pool.query({text:`UPDATE xita_transfer_announcements SET
      last_attempt_at=NOW() WHERE source_chain=$1 AND source_tx_hash=$2
      AND account=$3 AND state='indexed'`,
     values:[row.source_chain,row.source_tx_hash,row.account]});
    continue;
   }
   await withTransaction(pool,async db=>{
    await db.query({text:`DELETE FROM xita_transfer_operations
      WHERE source_chain=$1 AND source_tx_hash=$2 AND message_id=$3
      AND source_block_hash=$4`,values:[row.source_chain,row.source_tx_hash,
      row.verified_message_id,row.verified_block_hash]});
    await db.query({text:`UPDATE xita_transfer_announcements SET
      state='reported',next_attempt_at=NOW(),
      verified_block_number=NULL,verified_block_hash=NULL,
      verified_message_id=NULL WHERE source_chain=$1 AND source_tx_hash=$2
      AND account=$3 AND state='indexed'`,values:[row.source_chain,row.source_tx_hash,row.account]});
   });retracted++;
  }catch{ /* RPC uncertainty never retracts a confirmed source event. */ }
 }
 return {checked,retracted};
}

// Durable bounded backfill: each small window commits its own cursor.
export async function catchUpRoute({route,scan,batches=4}){
 if(!Number.isSafeInteger(batches)||batches<1||batches>8)throw Error("Unsafe catch-up budget");
 let indexed=0,scannedTo=null,finalizedHead=null;
 for(let i=0;i<batches;i++){
  const value=await scan();
  indexed+=value.indexed;scannedTo=value.scannedTo;finalizedHead=value.finalizedHead;
  if(scannedTo>=finalizedHead)break;
 }
 return {route:route.routeName,indexed,scannedTo,finalizedHead};
}
export async function tickTransferIndex({catalog,pool,rpc=canonicalRpc(),blockFor,limit=150,batches=4}){
 const routes=indexedRoutes(catalog,{blockFor});
 let accelerated={status:"not-installed"};
 try{accelerated=await processTransferAnnouncements({catalog,routes,pool,rpc});}
 catch(error){accelerated={error:String(error.message||error).slice(0,200)};}
 let hintsRechecked={status:"not-installed"};
 try{hintsRechecked=await reconcileAnnouncedBlocks({pool,routes,rpc});}
 catch(error){hintsRechecked={error:String(error.message||error).slice(0,200)};}
 const progress=[];
 for(const route of routes){
  try{progress.push(await catchUpRoute({route,batches,
   scan:()=>scanIndexedRoute({catalog,route,pool,rpc,limit})}));}
  catch(error){progress.push({route:route.routeName,error:String(error.message||error).slice(0,250)})}
 }
 const destinations=await refreshPendingDeliveries({pool,routes,rpc}).catch(error=>({error:String(error.message||error)}));
 return {routes:progress,destinations,accelerated,hintsRechecked};
}
export async function runTransferIndexWorker({intervalMs=12000}={}){
 const pool=await transferWriterPool();
 const rpc=canonicalRpc();
 let running=true;
 process.once("SIGTERM",()=>{running=false;});
 process.once("SIGINT",()=>{running=false;});
 while(running){
  const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
  const start=Date.now();
  const result=await tickTransferIndex({catalog,pool,rpc});
  if(result.accelerated?.error)console.error("[xita-transfer-hints]",result.accelerated.error);
  if(result.accelerated?.indexed)console.log("[xita-transfer-hints] verified",result.accelerated.indexed);
  if(result.hintsRechecked?.retracted)console.warn("[xita-transfer-hints] reorg retracted",result.hintsRechecked.retracted);
  for(const route of result.routes)if(route.error)
   console.error("[xita-transfer-index]",route.route,route.error);
  else if(route.indexed)console.log("[xita-transfer-index]",route.route,"indexed",route.indexed);
  const wait=Math.max(500,intervalMs-(Date.now()-start));
  if(running)await new Promise(resolve=>setTimeout(resolve,wait));
 }
 await pool.end();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runTransferIndexWorker().catch(error=>{
  console.error("XITA transfer index worker failed:",String(error.message||error));
  process.exitCode=1;
 });
}
