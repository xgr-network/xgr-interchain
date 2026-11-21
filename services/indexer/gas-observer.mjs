// Bounded finality-qualified gas learner. Receipts, never sponsor grants, are
// the source of measurements; every chain's Mailbox ProcessId event is eligible.
import {PROCESS_ID_TOPIC} from "./transfer-index.mjs";
export {PROCESS_ID_TOPIC};
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {transferGasProfile} from "../../apps/web/transfer-gas-profile.js";
import {readNativeFinalityHead} from "../../apps/web/chain-finality.js";
const HASH=/^0x[0-9a-f]{64}$/i;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const num=x=>{
 const n=typeof x==="number"?x:typeof x==="string"&&/^0x[0-9a-f]+$/i.test(x)?Number(BigInt(x)):NaN;
 if(!Number.isSafeInteger(n)||n<0)throw Error("Invalid observed RPC quantity");
 return n;
};
const hex=n=>"0x"+BigInt(n).toString(16);
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
// Read only finalized ProcessId locators persisted by the transfer scanner.
export async function observeDeliveryGas({catalog,pool,rpc,limit=20}){
 const due=await pool.query({text:`
  SELECT e.*,o.source_chain,o.route_id,o.parent_message_id
  FROM public.xita_indexed_mailbox_events e
  JOIN public.xita_transfer_operations o ON o.destination_chain=e.chain_name
   AND o.destination_mailbox=e.mailbox AND o.message_id=e.message_id
  WHERE e.gas_due_at<=NOW() AND o.delivered IS TRUE
   AND NOT EXISTS (
    SELECT 1 FROM public.xita_transfer_operations other
    WHERE other.destination_chain=e.chain_name AND other.destination_mailbox=e.mailbox
      AND other.message_id=e.message_id AND other.source_chain<>o.source_chain
   )
  ORDER BY e.gas_due_at,e.chain_name,e.mailbox,e.message_id LIMIT $1`,values:[limit]});
 const receipts=new Map();
 let measured=0;
 for(const row of due.rows){
  const profile=gasObservationProfile(catalog,row.source_chain,row.route_id,
   row.parent_message_id?"final-delivery":"first-delivery");
  const cfg=catalog.chains?.[row.chain_name];
  let done=!profile||profile.chain!==row.chain_name||!cfg;
  try{
   if(!done){
    const existing=await pool.query({text:`
     SELECT 1 FROM public.xita_gas_observations
     WHERE profile_key=$1 AND chain_name=$2 AND tx_hash=$3 AND block_number=$4 AND block_hash=$5`,
     values:[profile.key,row.chain_name,row.tx_hash,row.block_number,row.block_hash]});
    done=existing.rows.length>0;
    if(!done){
     const key=row.chain_name+":"+row.tx_hash;
     if(!receipts.has(key))receipts.set(key,rpc(cfg,"eth_getTransactionReceipt",[row.tx_hash]));
     const receipt=await receipts.get(key);
     const height=num(receipt?.blockNumber),gas=num(receipt?.gasUsed);
     // Finality and canonical block identity were checked by the shared scan.
     if(receipt.status==="0x1"&&eq(receipt.transactionHash,row.tx_hash)&&
        height===Number(row.block_number)&&eq(receipt.blockHash,row.block_hash)&&
        gas>=21000&&gas<=5000000&&receipt.logs?.some(log=>
         eq(log.address,row.mailbox)&&log.removed!==true&&log.topics?.length===2&&
         eq(log.topics[0],PROCESS_ID_TOPIC)&&eq(log.topics[1],row.message_id))){
      await pool.query({text:"SELECT public.xita_record_gas_observation($1,$2,$3,$4,$5,$6)",
       values:[profile.key,row.chain_name,row.tx_hash,height,row.block_hash,gas]});
      done=true;
      measured++;
     }
    }
   }
  }catch{/* Retry this sample without blocking the transfer cursor. */}
  await pool.query({text:`
   UPDATE public.xita_indexed_mailbox_events
   SET gas_due_at=CASE WHEN $4::boolean THEN NULL ELSE NOW()+INTERVAL '5 minutes' END
   WHERE chain_name=$1 AND mailbox=$2 AND message_id=$3 AND gas_due_at IS NOT NULL`,
   values:[row.chain_name,row.mailbox,row.message_id,done]});
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
