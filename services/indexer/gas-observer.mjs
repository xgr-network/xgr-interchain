// Bounded finality-qualified gas learner. Receipts, never sponsor grants, are
// the source of measurements; every chain's Mailbox ProcessId event is eligible.
import {keccak256} from "ethers";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {transferGasProfile} from "../../apps/web/transfer-gas-profile.js";
import {readNativeFinalityHead} from "../../apps/web/chain-finality.js";
const HASH=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const num=x=>{
 const n=typeof x==="number"?x:typeof x==="string"&&/^0x[0-9a-f]+$/i.test(x)?Number(BigInt(x)):NaN;
 if(!Number.isSafeInteger(n)||n<0)throw Error("Invalid observed RPC quantity");
 return n;
};
const hex=n=>"0x"+BigInt(n).toString(16);
export const PROCESS_ID_TOPIC=keccak256(Buffer.from("ProcessId(bytes32)"));
export function gasObservationProfile(catalog,sourceChain,routeId,stage){
 const matched=deployedRoutes(catalog).filter(r=>r.source===sourceChain&&
  eq(r.routeId,routeId));
 return matched.length===1?transferGasProfile(catalog,matched[0],stage):null;
}
export async function recordVerifiedGas({pool,rpc,chain,chainConfig,txHash,
 profile,expectedBlock=null,expectedBlockHash=null}){
 if(!profile||profile.chain!==chain||!HASH.test(txHash||"")||
  !Number.isSafeInteger(chainConfig?.chainId))return false;
 const receipt=await rpc(chainConfig,"eth_getTransactionReceipt",[txHash]);
 if(!receipt||receipt.status!=="0x1"||!eq(receipt.transactionHash,txHash)||
  !HASH.test(receipt.blockHash||""))return false;
 const height=num(receipt.blockNumber),gas=num(receipt.gasUsed);
 if(height<1||gas<21000||gas>5000000||
    expectedBlock!==null&&height!==expectedBlock||
    expectedBlockHash!==null&&!eq(receipt.blockHash,expectedBlockHash))return false;
 const safe=await readNativeFinalityHead((method,args)=>rpc(chainConfig,method,args),
  chainConfig.chainId);
 if(height>safe.number)return false;
 const block=await rpc(chainConfig,"eth_getBlockByNumber",[hex(height),false]);
 if(!block||num(block.number)!==height||!eq(block.hash,receipt.blockHash))return false;
 await pool.query({text:"SELECT public.xita_record_gas_observation($1,$2,$3,$4,$5,$6)",
  values:[profile.key,chain,txHash.toLowerCase(),height,receipt.blockHash.toLowerCase(),gas]});
 return true;
}
// Advance only the monotone statistical cursor; it is not a transfer
// discovery or principal settlement cursor.
async function advanceOnwardGasCursor(pool,row){
 await pool.query({text:`INSERT INTO xita_gas_onward_cursors
    (singleton,indexed_at,source_tx_hash) VALUES(TRUE,$1,$2)
    ON CONFLICT(singleton) DO UPDATE SET
    indexed_at=EXCLUDED.indexed_at,source_tx_hash=EXCLUDED.source_tx_hash
    WHERE (xita_gas_onward_cursors.indexed_at,xita_gas_onward_cursors.source_tx_hash)<
      (EXCLUDED.indexed_at,EXCLUDED.source_tx_hash)`,
    values:[row.source_indexed_at,row.source_tx_hash]});
}
// Recheck a small set of canonical child-transaction receipts every tick.
// This captures TX3 burn/forward independently of how its gas was funded.
export async function observeOnwardGas({catalog,pool,rpc,limit=20}){
 const cursor=await pool.query({text:"SELECT indexed_at,source_tx_hash"+
  " FROM xita_gas_onward_cursors WHERE singleton=TRUE"});
 const last=cursor.rows[0]||{indexed_at:"1970-01-01T00:00:00Z",
  source_tx_hash:"0x"+"0".repeat(64)};
 const rows=await pool.query({text:`SELECT source_chain,route_id,source_tx_hash,
 source_block_number,source_block_hash,source_indexed_at
 FROM xita_transfer_operations
 WHERE parent_message_id IS NOT NULL
 AND (source_indexed_at,source_tx_hash) > ($1::timestamptz,$2::char(66))
 ORDER BY source_indexed_at ASC,source_tx_hash ASC LIMIT $3`,
 values:[last.indexed_at,last.source_tx_hash,limit]});
 let measured=0;
 for(const row of rows.rows){
  const profile=gasObservationProfile(catalog,row.source_chain,row.route_id,"hub-onward");
  if(!profile){
   // F-35: an unprofiled child operation is not a trusted gas sample,
   // but it must not permanently block later independently verified rows.
   await advanceOnwardGasCursor(pool,row);
   continue;
  }
  try{
   const ok=await recordVerifiedGas({pool,rpc,chain:row.source_chain,
    chainConfig:catalog.chains[row.source_chain],txHash:row.source_tx_hash,
    profile,expectedBlock:Number(row.source_block_number),
    expectedBlockHash:row.source_block_hash});
   if(!ok)break;
   measured++;
   await advanceOnwardGasCursor(pool,row);
  }catch{break}
 }
 return measured;
}
// Delivery gas work is enqueued atomically after a FINALITY-VERIFIED Mailbox
// delivered=true check in the canonical transfer indexer. Jobs contain only
// identities and previously confirmed destination block bounds, never proof
// of delivery or authorization to pay or sign. No idle eth_getLogs calls.
export async function enqueueDeliveryGasJob({pool,row,route,finalizedHead}){
 if(!HASH.test(row.message_id||"")||!ADDR.test(route?.destinationMailbox||"")||
    !Number.isSafeInteger(finalizedHead)||finalizedHead<1)
  throw Error("Invalid finalized gas job");
 await pool.query({text:`INSERT INTO public.xita_gas_delivery_jobs
   (source_chain,message_id,destination_chain,mailbox,scan_min_block,scan_next_to)
   VALUES($1,$2,$3,$4,1,$5)
   ON CONFLICT(source_chain,message_id) DO NOTHING`,
  values:[row.source_chain,row.message_id,route.destinationChain,
   route.destinationMailbox.toLowerCase(),finalizedHead]});
}
const MAX_DELIVERY_GAS_JOBS_PER_TICK=4;
const GAS_SCAN_WINDOW=150;
// The exact source_chain/message_id pair is unique; unrelated Mailbox ProcessId
// logs never cause receipt reads. Backward windows cannot skip an event mined
// before the first completed finality-qualified delivery check.
export async function observeDeliveryGas({catalog,pool,rpc,limit=MAX_DELIVERY_GAS_JOBS_PER_TICK}){
 if(!Number.isInteger(limit)||limit<1||limit>16)throw Error("Invalid gas job limit");
 const jobs=await pool.query({text:`SELECT source_chain,message_id,destination_chain,
   mailbox,scan_min_block,scan_next_to,attempts
   FROM public.xita_gas_delivery_jobs
   WHERE completed_at IS NULL AND next_attempt_at<=NOW()
   ORDER BY next_attempt_at,created_at LIMIT $1`,values:[limit]});
 const routes=deployedRoutes(catalog);
 let measured=0;
 for(const job of jobs.rows){
  try{
   const group=routes.filter(route=>route.source===job.source_chain&&
    route.destination===job.destination_chain&&
    eq(route.destinationMailbox,job.mailbox));
   // Legacy route metadata must never authorize an ambiguous gas profile.
   const op=await pool.query({text:`SELECT route_id,parent_message_id,delivered,
     destination_checked_block,destination_checked_hash
     FROM xita_transfer_operations WHERE source_chain=$1 AND message_id=$2
     AND destination_chain=$3 AND destination_mailbox=$4 LIMIT 2`,
    values:[job.source_chain,job.message_id,job.destination_chain,job.mailbox]});
   if(op.rows.length!==1||op.rows[0].delivered!==true||
      !HASH.test(op.rows[0].destination_checked_hash||""))
    throw Error("Gas job has no verified completed destination evidence");
   const selected=group.filter(route=>eq(route.routeId,op.rows[0].route_id));
   if(selected.length!==1)throw Error("Unknown canonical gas route");
   const profile=transferGasProfile(catalog,selected[0],
    op.rows[0].parent_message_id?"final-delivery":"first-delivery");
   if(!profile)throw Error("No canonical gas profile");
   const cfg=catalog.chains[job.destination_chain];
   if(!cfg||!Number.isSafeInteger(cfg.chainId))throw Error("No gas destination chain");
   const last=Number(job.scan_next_to),min=Number(job.scan_min_block);
   if(!Number.isSafeInteger(last)||!Number.isSafeInteger(min)||min<1||
      last<min-1||last>Number(op.rows[0].destination_checked_block))
    throw Error("Invalid persisted delivery gas scan bound");
   if(last<min){
    await pool.query({text:`UPDATE xita_gas_delivery_jobs SET
      completed_at=NOW(),result='not-found'
      WHERE source_chain=$1 AND message_id=$2 AND completed_at IS NULL`,
     values:[job.source_chain,job.message_id]});
    continue;
   }
   const from=Math.max(min,last-GAS_SCAN_WINDOW+1);
   const logs=await rpc(cfg,"eth_getLogs",[{
    address:job.mailbox,topics:[PROCESS_ID_TOPIC,job.message_id],
    fromBlock:hex(from),toBlock:hex(last)
   }]);
   if(!Array.isArray(logs)||logs.length>4)throw Error("Ambiguous ProcessId history");
   const found=logs.filter(log=>eq(log.address,job.mailbox)&&
      eq(log.topics?.[0],PROCESS_ID_TOPIC)&&eq(log.topics?.[1],job.message_id)&&
      HASH.test(log.transactionHash||"")&&!log.removed&&
      num(log.blockNumber)>=from&&num(log.blockNumber)<=last);
   if(found.length>1)throw Error("Ambiguous ProcessId receipt");
   if(found.length===1){
    const log=found[0];
    const ok=await recordVerifiedGas({pool,rpc,chain:job.destination_chain,
      chainConfig:cfg,txHash:log.transactionHash,profile,
      expectedBlock:num(log.blockNumber),expectedBlockHash:log.blockHash});
    if(!ok)throw Error("Incomplete canonical gas receipt");
    measured++;
    await pool.query({text:`UPDATE xita_gas_delivery_jobs SET
      completed_at=NOW(),result='observed' WHERE source_chain=$1 AND
      message_id=$2 AND completed_at IS NULL`,
     values:[job.source_chain,job.message_id]});
   }else{
    await pool.query({text:`UPDATE xita_gas_delivery_jobs SET
      scan_next_to=$3,next_attempt_at=NOW()+INTERVAL '60 seconds'
      WHERE source_chain=$1 AND message_id=$2 AND completed_at IS NULL`,
     values:[job.source_chain,job.message_id,from-1]});
   }
  }catch{
   // An incomplete/malicious RPC response can never advance the optional gas
   // cursor. Delay uniformly even if the underlying provider is unavailable.
   await pool.query({text:`UPDATE xita_gas_delivery_jobs SET
    attempts=LEAST(attempts+1,1000),
    next_attempt_at=NOW()+INTERVAL '5 minutes'
    WHERE source_chain=$1 AND message_id=$2 AND completed_at IS NULL`,
    values:[job.source_chain,job.message_id]}).catch(()=>{});
  }
 }
 return measured;
}
export async function tickGasObserver({catalog,pool,rpc}){
 const [onward,delivery]=await Promise.all([
  observeOnwardGas({catalog,pool,rpc}),
  observeDeliveryGas({catalog,pool,rpc})
 ]);
 return {onward,delivery};
}
