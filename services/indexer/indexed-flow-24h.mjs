// Gross physical escrow movements from FINALIZED indexed events only.
// No RPC, archive lookups or browser-supplied timestamps.
import {keccak256} from "../../apps/web/keccak.js";
import {priceEscrow} from "./tvl-verifier.mjs";
const UINT=/^(0|[1-9][0-9]*)$/;
const norm=v=>String(v??"").toLowerCase();
export function indexedGrossFlow24h({descriptor,rows,coverage,price,now=Date.now()}){
 const unavailable=reason=>({status:"unavailable",reason});
 if(descriptor?.status!=="ready"||!Array.isArray(rows)||coverage?.complete!==true)
  return unavailable("indexed-flow-coverage-incomplete");
 const start=now-86400000,routeMap=new Map(descriptor.escrowRoutes.map(r=>[r.source+":"+norm(r.routeId),r]));
 let incoming=0n,outgoing=0n,inflowCount=0,outflowCount=0;
 const seen=new Set(),proof=[];
 for(const row of rows){
  if(row.asset!==descriptor.asset||norm(row.asset_id)!==norm(descriptor.assetId)||
    !UINT.test(String(row.amount_raw??""))||BigInt(row.amount_raw)<=0n||
    !/^0x[0-9a-f]{64}$/i.test(row.message_id||""))
   return unavailable("invalid-indexed-operation");
  const identity=row.source_chain+":"+norm(row.message_id);
  if(seen.has(identity))return unavailable("duplicate-indexed-operation");
  seen.add(identity);
  const route=routeMap.get(row.source_chain+":"+norm(row.route_id));
  if(!route||row.destination_chain!==route.destination||norm(row.gateway)!==norm(route.gateway))
   return unavailable("unknown-escrow-route");
  const inTime=Date.parse(row.source_block_at),outTime=Date.parse(row.escrow_outflow_observed_at);
  if(route.source===descriptor.chain){
   // Historical backfills without a canonical timestamp are not included.
   if(!Number.isFinite(inTime))continue;
   if(inTime>=start&&inTime<=now){incoming+=BigInt(row.amount_raw);inflowCount++;proof.push("in:"+identity+":"+row.amount_raw+":"+row.source_block_hash);}
  }else if(route.destination===descriptor.chain){
   if(row.delivered!==true||!Number.isFinite(outTime))continue;
   if(outTime>=start&&outTime<=now){outgoing+=BigInt(row.amount_raw);outflowCount++;proof.push("out:"+identity+":"+row.amount_raw+":"+row.source_block_hash);}
  }else return unavailable("not-a-physical-escrow-route");
 }
 const raw=incoming+outgoing;
 const value=priceEscrow({status:"verified",netLockedRaw:raw.toString(),decimals:descriptor.decimals},price,{now});
 if(value.status!=="verified")return unavailable(value.reason||"price-unavailable");
 return {status:"verified",kind:"escrow-gross-24h",assetId:descriptor.assetId,
   windowStart:new Date(start).toISOString(),windowEnd:new Date(now).toISOString(),
   inflowRaw:incoming.toString(),outflowRaw:outgoing.toString(),
   inflowCount,outflowCount,movedUsd:value.lockedUsd,
   proofDigest:keccak256(JSON.stringify(proof.sort()))};
}
