// Gross 24h physical ESCROW flows, NOT 2-hop user journeys or net balance change.
// Count each canonical lock when its finalized SOURCE block occurred and each
// canonical unlock when its destination Mailbox actually processed the message.
// Synthetic mint/burn hops and pending destination burns do not count.
// Read-only RPC; source index is finality-verified separately by the TVL worker.
import {selector,keccak256} from "../../apps/web/keccak.js";
import {priceEscrow} from "./tvl-verifier.mjs";
const HASH=/^0x[0-9a-f]{64}$/i, ADDRESS=/^0x[0-9a-f]{40}$/i;
const HEX=/^0x[0-9a-f]+$/i, UINT=/^(0|[1-9][0-9]*)$/;
const PROCESS_TOPIC=keccak256("ProcessId(bytes32)");
const fail=reason=>({status:"unavailable",reason});
const norm=x=>String(x??"").toLowerCase();
const dec=x=>UINT.test(String(x??""))?BigInt(x):null;
const quantity=x=>HEX.test(x||"")?BigInt(x):null;
const hex=x=>"0x"+BigInt(x).toString(16);
const MAX_OPERATION_ROWS=10000;
export const ESCROW_FLOW_WINDOW_MS=86400000;

function checkedBlock(block,expectedHeight=null,expectedHash=null){
 const height=quantity(block?.number),timestamp=quantity(block?.timestamp);
 if(height===null||height>BigInt(Number.MAX_SAFE_INTEGER)||
    timestamp===null||timestamp>BigInt(Number.MAX_SAFE_INTEGER/1000)||
    !HASH.test(block?.hash||"")||
    expectedHeight!==null&&height!==BigInt(expectedHeight)||
    expectedHash!==null&&norm(block.hash)!==norm(expectedHash))
  throw Error("Unverified canonical block or timestamp");
 return {height:Number(height),timestamp:Number(timestamp)*1000,hash:norm(block.hash)};
}

export async function verifyGrossEscrowFlows24h({
 descriptor,operations,read,price,now=Date.now(),maxOperations=MAX_OPERATION_ROWS
}){
 if(descriptor?.status!=="ready"||!Array.isArray(operations)||typeof read!=="function")
  return fail("24h-source-evidence-missing");
 if(operations.length>maxOperations)return fail("24h-index-capacity-exceeded");
 const start=now-ESCROW_FLOW_WINDOW_MS;
 const {asset,assetId,chain,chainConfig,decimals,escrowRoutes}=descriptor;
 const routeMap=new Map(escrowRoutes.map(r=>[r.source+":"+norm(r.routeId),r]));
 const seen=new Set();
 let inRaw=0n,outRaw=0n,inCount=0,outCount=0;
 const receipts=[];
 const cachedBlocks=new Map();
 async function readBlock(cfg,height,expectedHash=null){
  const key=cfg.chainId+":"+height;
  let block=cachedBlocks.get(key);
  if(!block){
   block=checkedBlock(await read(cfg,"eth_getBlockByNumber",[hex(height),false]),height);
   cachedBlocks.set(key,block);
  }
  if(expectedHash!==null&&norm(expectedHash)!==block.hash)
   throw Error("Canonical block hash mismatch");
  return block;
 }
 for(const row of operations){
  if(row.asset!==asset||!HASH.test(row.message_id||"")||
    !HASH.test(row.source_block_hash||"")||!HASH.test(row.asset_id||"")||
    norm(row.asset_id)!==norm(assetId)||
    !ADDRESS.test(row.gateway||"")||
    !UINT.test(String(row.amount_raw??""))||BigInt(row.amount_raw)<=0n)
   return fail("unverifiable-24h-source-operation");
  const id=row.source_chain+":"+norm(row.message_id);
  if(seen.has(id))return fail("duplicate-24h-source-operation");
  seen.add(id);
  const route=routeMap.get(row.source_chain+":"+norm(row.route_id));
  if(!route||row.destination_chain!==route.destination||
     norm(row.gateway)!==norm(route.gateway))
   return fail("unrecognized-24h-route");
  const raw=BigInt(row.amount_raw);
  if(route.source===chain){
   const height=dec(row.source_block_number);
   if(height===null||height>BigInt(Number.MAX_SAFE_INTEGER))
    return fail("invalid-source-height");
   const sourceBlock=await readBlock(chainConfig,height,row.source_block_hash);
   if(sourceBlock.timestamp>now+30000)return fail("future-source-block-time");
   if(sourceBlock.timestamp>=start&&sourceBlock.timestamp<=now){
    inRaw+=raw;inCount++;
    receipts.push("in:"+id+":"+raw+":"+sourceBlock.height+":"+sourceBlock.hash);
   }
  }else if(route.destination===chain){
   const mailbox=row.destination_mailbox;
   if(!ADDRESS.test(mailbox||"")||!ADDRESS.test(route.destinationMailbox||"")||
      norm(mailbox)!==norm(route.destinationMailbox))
    return fail("unverified-destination-mailbox");
   // Mailbox ProcessId logs establish the actual delivery time. No inferred
   // timestamp from the SQL delivery_checked_at or client-submitted hash.
   const head=quantity(await read(chainConfig,"eth_blockNumber",[]));
   const depth=Math.max(1,chainConfig.confirmations||1);
   if(head===null||head<BigInt(depth))return fail("destination-head-unavailable");
   const finalized=head-BigInt(depth);
   // The last 24h is located via canonical block timestamps, not an assumed
   // block rate. A bounded binary search avoids an expensive genesis scan.
   let lo=0n,hi=finalized;
   while(lo<hi){
    const mid=(lo+hi)/2n;
    const block=await readBlock(chainConfig,mid);
    if(block.timestamp<start)lo=mid+1n;else hi=mid;
   }
   const logs=[];
   for(let from=lo;from<=finalized;from+=750n){
    const to=from+749n<finalized?from+749n:finalized;
    const chunk=await read(chainConfig,"eth_getLogs",[{
      address:mailbox,topics:[PROCESS_TOPIC,row.message_id],
      fromBlock:hex(from),toBlock:hex(to)
    }]);
    if(!Array.isArray(chunk)||chunk.length>1)return fail("ambiguous-destination-process-event");
    logs.push(...chunk);
    if(logs.length>1)return fail("duplicate-destination-process-event");
   }
   if(!logs.length){
    if(row.delivered===true){
     // A message can have been delivered *before* the 24h window.
     // Verify current mailbox delivered state; it then counts as historical.
     const current=await read(chainConfig,"eth_call",[
      {to:mailbox,data:selector("delivered(bytes32)")+row.message_id.slice(2)},"latest"]);
     if(quantity(current)!==1n)return fail("indexed-delivery-disagrees-with-mailbox");
    }
    continue;
   }
   const log=logs[0],blockHeight=quantity(log.blockNumber);
   if(blockHeight===null||blockHeight>finalized||
     norm(log.address)!==norm(mailbox)||
     norm(log.topics?.[0])!==norm(PROCESS_TOPIC)||
     norm(log.topics?.[1])!==norm(row.message_id)||log.removed===true)
    return fail("unverified-destination-process-event");
   const deliveryBlock=await readBlock(chainConfig,blockHeight,log.blockHash);
   if(deliveryBlock.timestamp<start||deliveryBlock.timestamp>now)continue;
   outRaw+=raw;outCount++;
   receipts.push("out:"+id+":"+raw+":"+deliveryBlock.height+":"+deliveryBlock.hash);
  }else return fail("non-escrow-route-in-volume");
 }
 // Exactly ONE side of each physical escrow movement, not synthetic minting.
 // Value is the 24h GROSS turnover at the latest FRESH CoinGecko USD price.
 const grossRaw=inRaw+outRaw;
 const usd=priceEscrow({status:"verified",netLockedRaw:grossRaw.toString(),decimals},price,{now});
 if(usd.status!=="verified")return fail(usd.reason||"volume-valuation-unavailable");
 return {status:"verified",kind:"escrow-gross-24h",
  windowStart:new Date(start).toISOString(),windowEnd:new Date(now).toISOString(),
  asOf:new Date(now).toISOString(),priceAsOf:price.asOf,
  priceUsd:price.priceUsd,assetId,chain,
  inflowRaw:inRaw.toString(),outflowRaw:outRaw.toString(),
  grossRaw:grossRaw.toString(),inflowCount:inCount,outflowCount:outCount,
  movedUsd:usd.lockedUsd,movedUsdExact:usd.lockedUsdExact,
  proofDigest:keccak256(JSON.stringify(receipts.sort()))};
}
