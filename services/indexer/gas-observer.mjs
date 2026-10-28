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
// Recheck a small set of canonical child-transaction receipts every tick.
// This captures TX3 burn/forward independently of how its gas was funded.
export async function observeOnwardGas({catalog,pool,rpc,limit=20}){
 const rows=await pool.query({text:`SELECT source_chain,route_id,source_tx_hash,
 source_block_number,source_block_hash FROM xita_transfer_operations
 WHERE parent_message_id IS NOT NULL
 ORDER BY source_indexed_at DESC LIMIT $1`,values:[limit]});
 let measured=0;
 for(const row of rows.rows){
  try{
   const profile=gasObservationProfile(catalog,row.source_chain,row.route_id,"hub-onward");
   if(!profile)continue;
   if(await recordVerifiedGas({pool,rpc,chain:row.source_chain,
    chainConfig:catalog.chains[row.source_chain],txHash:row.source_tx_hash,
    profile,expectedBlock:Number(row.source_block_number),
    expectedBlockHash:row.source_block_hash}))measured++;
  }catch{/* Other routes continue; a failed RPC never produces a sample. */}
 }
 return measured;
}
// Scan each deployed destination Mailbox only once per safe block window.
// Contract addresses and chains come exclusively from verified catalog receipts.
export async function observeDeliveryGas({catalog,pool,rpc,limit=80}){
 const routes=deployedRoutes(catalog),groups=new Map();
 for(const route of routes){
  const chain=route.destination,mailbox=catalog.infrastructure?.[chain]?.xitaV315?.components?.mailbox;
  if(!ADDR.test(mailbox?.address||"")||!Number.isSafeInteger(catalog.chains?.[chain]?.chainId))
   continue;
  const key=chain+":"+mailbox.address.toLowerCase();
  if(!groups.has(key))groups.set(key,{chain,mailbox:mailbox.address.toLowerCase(),routes:[]});
  groups.get(key).routes.push(route);
 }
 let measured=0;
 for(const group of groups.values()){
  const cfg=catalog.chains[group.chain];
  try{
   const safe=await readNativeFinalityHead((m,args)=>rpc(cfg,m,args),cfg.chainId);
   const previous=await pool.query({text:`SELECT scanned_to,scanned_hash FROM
    xita_gas_observation_cursors WHERE chain_name=$1 AND mailbox=$2`,
    values:[group.chain,group.mailbox]});
   if(previous.rows.length>1)continue;
   let from=previous.rows.length?Number(previous.rows[0].scanned_to)+1:
    Math.max(1,safe.number-limit+1);
   if(previous.rows.length){
    const height=Number(previous.rows[0].scanned_to);
    const old=await rpc(cfg,"eth_getBlockByNumber",[hex(height),false]);
    if(!old||!eq(old.hash,previous.rows[0].scanned_hash))continue;
   }
   if(from>safe.number)continue;
   const to=Math.min(safe.number,from+limit-1);
   const logs=await rpc(cfg,"eth_getLogs",[{
    address:group.mailbox,topics:[PROCESS_ID_TOPIC],
    fromBlock:hex(from),toBlock:hex(to)
   }]);
   if(!Array.isArray(logs)||logs.length>1000)continue;
   let incomplete=false;
   for(const log of logs){
    if(!eq(log.address,group.mailbox)||!HASH.test(log.transactionHash||"")||
      !HASH.test(log.topics?.[1]||"")||log.removed===true)continue;
    const operation=await pool.query({text:`SELECT source_chain,route_id,
     destination_mailbox FROM xita_transfer_operations
     WHERE destination_chain=$1 AND message_id=$2 AND delivered=TRUE
     LIMIT 2`,values:[group.chain,log.topics[1].toLowerCase()]});
    if(operation.rows.length!==1){incomplete=true;continue;}
    if(!eq(operation.rows[0].destination_mailbox,group.mailbox))continue;
    const row=operation.rows[0];
    const route=group.routes.filter(r=>r.source===row.source_chain&&eq(r.routeId,row.route_id));
    if(route.length!==1){incomplete=true;continue;}
    const profile=transferGasProfile(catalog,route[0],"first-delivery");
    if(!profile){incomplete=true;continue;}
    if(await recordVerifiedGas({pool,rpc,chain:group.chain,chainConfig:cfg,
     txHash:log.transactionHash,profile,expectedBlock:num(log.blockNumber),
     expectedBlockHash:log.blockHash}))measured++;
    else incomplete=true;
   }
   if(incomplete)continue;
   const end=await rpc(cfg,"eth_getBlockByNumber",[hex(to),false]);
   if(!end||!HASH.test(end.hash||"")||num(end.number)!==to)continue;
   await pool.query({text:`INSERT INTO xita_gas_observation_cursors
    (chain_name,mailbox,scanned_to,scanned_hash)
    VALUES($1,$2,$3,$4) ON CONFLICT(chain_name,mailbox)
    DO UPDATE SET scanned_to=EXCLUDED.scanned_to,
     scanned_hash=EXCLUDED.scanned_hash,updated_at=NOW()
    WHERE xita_gas_observation_cursors.scanned_to<EXCLUDED.scanned_to`,
    values:[group.chain,group.mailbox,to,end.hash.toLowerCase()]});
  }catch{/* Fail closed for this chain and do not advance its cursor. */}
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
