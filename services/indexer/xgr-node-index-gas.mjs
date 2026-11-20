// Optional statistics-only projection. Every gas unit comes from a
// finalized XGR Node index entry; no foreign eth_getLogs, receipt or block RPC.
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {transferGasProfile} from "../../apps/web/transfer-gas-profile.js";
import {nodeChainName} from "../../tools/verify-node-index-parity.mjs";

const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const low=s=>String(s||"").toLowerCase();
export function indexedGasProfile(catalog,row){
 const routes=deployedRoutes(catalog).filter(r=>
   r.source===row.source_chain&&r.destination===row.destination_chain&&
   low(r.routeId)===low(row.route_id));
 if(routes.length!==1)return null;
 return transferGasProfile(catalog,routes[0],
  row.parent_message_id?"final-delivery":"first-delivery");
}
export function checkIndexedGas({row,profile,evidence,catalog}){
 if(!profile||profile.chain!==row.destination_chain||
   evidence?.version!==1||evidence.evidenceStatus!=="FINALIZED_GAS_READ_MODEL_NOT_BLS_EVIDENCE"||
   evidence.destinationChainId!==catalog.chains?.[row.destination_chain]?.chainId||
   low(evidence.messageId)!==low(row.message_id)||
   !HASH.test(evidence.transactionHash||"")||!HASH.test(evidence.blockHash||"")||
   !ADDRESS.test(evidence.mailbox||"")||
   low(evidence.mailbox)!==low(row.destination_mailbox)||
   !Number.isSafeInteger(evidence.blockNumber)||evidence.blockNumber<1||
   evidence.blockNumber>Number(row.destination_checked_block)||
   !Number.isSafeInteger(evidence.gasUsed)||
   evidence.gasUsed<21000||evidence.gasUsed>5000000)
  throw Error("Unverified or route-mismatched indexed ProcessId gas");
 return {profile:profile.key,chain:row.destination_chain,
  txHash:low(evidence.transactionHash),block:evidence.blockNumber,
  hash:low(evidence.blockHash),gas:evidence.gasUsed};
}
export async function tickNodeIndexedGas({catalog,pool,rpc,limit=16}={}){
 if(!catalog||!pool||typeof rpc!=="function"||
    !Number.isInteger(limit)||limit<1||limit>100)
  throw Error("Invalid Node gas projection");
 // Durable low-frequency retry. A missing optional sample may not block or
 // modify delivery, SQL operation rows, source cursors or user recovery.
 await pool.query({text:`INSERT INTO xita_node_gas_jobs(source_chain,message_id)
  SELECT source_chain,message_id FROM xita_transfer_operations o
  WHERE delivered IS TRUE
    AND destination_checked_block IS NOT NULL
    AND destination_checked_hash IS NOT NULL
  ON CONFLICT(source_chain,message_id) DO NOTHING`});
 const due=await pool.query({text:`SELECT j.source_chain,j.message_id,o.route_id,
   o.destination_chain,o.destination_mailbox,o.destination_checked_block,
   o.parent_message_id
  FROM xita_node_gas_jobs j JOIN xita_transfer_operations o
    ON o.source_chain=j.source_chain AND o.message_id=j.message_id
  WHERE j.completed_at IS NULL AND j.next_attempt_at<=NOW()
    AND o.delivered IS TRUE
  ORDER BY j.next_attempt_at,j.source_chain,j.message_id LIMIT $1`,
  values:[limit]});
 let recorded=0,unknown=0;
 for(const row of due.rows){
  try{
   const profile=indexedGasProfile(catalog,row);
   if(!profile)throw Error("No documented gas profile");
   const evidence=await rpc("xgr_getILNIndexedGas",[
    nodeChainName(row.source_chain),row.message_id]);
   const checked=checkIndexedGas({row,profile,evidence,catalog});
   await pool.query({text:"SELECT public.xita_record_gas_observation($1,$2,$3,$4,$5,$6)",
    values:[checked.profile,checked.chain,checked.txHash,checked.block,
     checked.hash,checked.gas]});
   await pool.query({text:`UPDATE xita_node_gas_jobs SET completed_at=NOW()
    WHERE source_chain=$1 AND message_id=$2 AND completed_at IS NULL`,
    values:[row.source_chain,row.message_id]});
   recorded++;
  }catch{
   unknown++;
   await pool.query({text:`UPDATE xita_node_gas_jobs SET
    next_attempt_at=NOW()+INTERVAL '5 minutes'
    WHERE source_chain=$1 AND message_id=$2 AND completed_at IS NULL`,
    values:[row.source_chain,row.message_id]}).catch(()=>{});
  }
 }
 return {recorded,unknown};
}

// Hub onward TX3 receipts live on the locally committed XGRChain. Reuse
// the existing statistical cursor without any external-chain RPC requests.
export async function tickNodeIndexedOnwardGas({catalog,pool,rpc,limit=20}={}){
 if(!catalog||!pool||typeof rpc!=="function"||
    !Number.isInteger(limit)||limit<1||limit>100)
  throw Error("Invalid indexed onward gas dependencies");
 const result=await pool.query({text:`SELECT indexed_at,source_tx_hash
  FROM xita_gas_onward_cursors WHERE singleton=TRUE`});
 const since=result.rows[0]||{indexed_at:"1970-01-01T00:00:00Z",
  source_tx_hash:"0x"+"0".repeat(64)};
 const rows=await pool.query({text:`SELECT source_chain,route_id,source_tx_hash,
    source_block_number,source_block_hash,source_indexed_at
   FROM xita_transfer_operations
   WHERE parent_message_id IS NOT NULL AND source_chain='xgrchain'
    AND (source_indexed_at,source_tx_hash)>($1::timestamptz,$2::char(66))
   ORDER BY source_indexed_at ASC,source_tx_hash ASC LIMIT $3`,
   values:[since.indexed_at,since.source_tx_hash,limit]});
 let recorded=0;
 for(const row of rows.rows){
  try{
   const route=deployedRoutes(catalog).filter(r=>
    r.source==="xgrchain"&&low(r.routeId)===low(row.route_id));
   if(route.length!==1)throw Error("Missing canonical onward route");
   const profile=transferGasProfile(catalog,route[0],"hub-onward");
   if(profile){
    const receipt=await rpc("eth_getTransactionReceipt",[row.source_tx_hash]);
    const block=await rpc("eth_getBlockByNumber",[
     "0x"+BigInt(row.source_block_number).toString(16),false]);
    const gas=Number(BigInt(receipt?.gasUsed||"0x0"));
    if(receipt?.status!=="0x1"||
      low(receipt?.transactionHash)!==low(row.source_tx_hash)||
      low(receipt?.blockHash)!==low(row.source_block_hash)||
      low(block?.hash)!==low(row.source_block_hash)||
      gas<21000||gas>5000000)throw Error("Invalid native onward gas receipt");
    await pool.query({text:"SELECT public.xita_record_gas_observation($1,$2,$3,$4,$5,$6)",
      values:[profile.key,"xgrchain",low(row.source_tx_hash),
       Number(row.source_block_number),low(row.source_block_hash),gas]});
    recorded++;
   }
   await pool.query({text:`INSERT INTO xita_gas_onward_cursors
     (singleton,indexed_at,source_tx_hash) VALUES(TRUE,$1,$2)
     ON CONFLICT(singleton) DO UPDATE SET
      indexed_at=EXCLUDED.indexed_at,source_tx_hash=EXCLUDED.source_tx_hash
     WHERE (xita_gas_onward_cursors.indexed_at,xita_gas_onward_cursors.source_tx_hash)<
       (EXCLUDED.indexed_at,EXCLUDED.source_tx_hash)`,
    values:[row.source_indexed_at,row.source_tx_hash]});
  }catch{break;} // no forward cursor progress on any ambiguous native receipt
 }
 return {recorded};
}
