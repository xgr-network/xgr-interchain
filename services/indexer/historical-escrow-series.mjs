// Reconstruct escrow TVL and gross movement from the SAME finalized SQL rows
// already fetched by the TVL worker. No historical RPC or extra SQL reads.
// USD is a PRESENT-PRICE reference, never a claim about historical FX prices.
import {priceEscrow} from "./tvl-verifier.mjs";

const WORD=/^0x[0-9a-f]{64}$/i;
const UINT=/^(0|[1-9][0-9]*)$/;
const lower=v=>String(v??"").toLowerCase();
const stamp=v=>v==null?NaN:Date.parse(v);
const DAY=86400000;
const fail=reason=>({status:"unavailable",reason});
const value=(raw,descriptor,price,now)=>{
 const p=priceEscrow({status:"verified",netLockedRaw:String(raw),decimals:descriptor.decimals},
  price,{now});
 return p.status==="verified"?p.lockedUsd:null;
};

// A single asset's canonical lock/unlock activity. An unknown old event time
// may be EXCLUDED only when its first verification predates our entire window.
export function indexedEscrowDeltas({descriptor,rows,coverage,position,price,now=Date.now(),days=30}){
 if(descriptor?.status!=="ready"||!Array.isArray(rows)||coverage?.complete!==true||
  position?.status!=="verified"||!UINT.test(position.netLockedRaw||""))
  return fail("indexed-coverage-incomplete");
 const windowStart=now-days*DAY;
 const routes=new Map(descriptor.escrowRoutes.map(r=>[r.source+":"+lower(r.routeId),r]));
 const seen=new Set(),events=[];
 let unknownTime=0,unknown24h=0;
 for(const r of rows){
  if(r.asset!==descriptor.asset||lower(r.asset_id)!==lower(descriptor.assetId)||
    !WORD.test(r.message_id||"")||!WORD.test(r.source_block_hash||"")||
    !UINT.test(String(r.amount_raw??""))||BigInt(r.amount_raw)===0n)
   return fail("invalid-indexed-event");
  const identity=r.source_chain+":"+lower(r.message_id);
  if(seen.has(identity))return fail("duplicate-indexed-event");
  seen.add(identity);
  const route=routes.get(r.source_chain+":"+lower(r.route_id));
  if(!route||route.destination!==r.destination_chain||lower(route.gateway)!==lower(r.gateway))
   return fail("unknown-escrow-route");
  const add=(time,olderBound,sign)=>{
   const at=stamp(time),bound=stamp(olderBound);
   // An observed canonical timestamp cannot be ahead of this index snapshot.
   if(Number.isFinite(at)&&at>now+30000)return false;
   if(!Number.isFinite(at)){
    // Source indexing follows the source block; delivery check follows delivery.
    if(!Number.isFinite(bound)||bound>=windowStart){
     unknownTime++;
     if(!Number.isFinite(bound)||bound>=now-DAY)unknown24h++;
    }
    return true;
   }
   if(at>=windowStart&&at<=now)events.push({at,raw:BigInt(r.amount_raw)*BigInt(sign)});
   return true;
  };
  if(route.source===descriptor.chain){
   if(!add(r.source_block_at,r.source_indexed_at,1))return fail("future-event");
  }else if(route.destination===descriptor.chain&&r.delivered===true){
   if(!add(r.escrow_outflow_observed_at,r.delivery_checked_at,-1))return fail("future-event");
  }
 }
 events.sort((a,b)=>a.at-b.at);
 const net=BigInt(position.netLockedRaw);
 const delta=events.reduce((n,e)=>n+e.raw,0n);
 const opening=net-delta;
 if(opening<0n)return fail("historical-escrow-underflow");
 const testPrice=value(net,descriptor,price,now);
 if(testPrice===null)return fail("price-unavailable");
 return {status:unknownTime?"partial":"verified",unknownTime,unknown24h,events,openingRaw:opening,
  asset:descriptor.asset,decimals:descriptor.decimals,
  // Fix current price for the entire reconstructed series; no FX interpolation.
  priceUsd:price.priceUsd,asOf:new Date(now).toISOString()};
}

// Hourly steps use only confirmed canonical time-stamped events.
// Their current-price USD estimates do NOT replace saved, timestamped true TVL.
export function combineEscrowHistory(assets,{now=Date.now(),days=30}={}){
 if(!Array.isArray(assets)||!assets.length||assets.some(a=>!["verified","partial"].includes(a.status)))
  return fail("asset-history-incomplete");
 const start=now-days*DAY, hour=3600000, sorted=[];
 let unknownTime=0,unknown24h=0;
 for(const a of assets){
  unknownTime+=a.unknownTime;
  unknown24h+=a.unknown24h||0;
  const factor=a.priceUsd/10**a.decimals;
  if(!Number.isFinite(factor)||factor<=0)return fail("price-unavailable");
  const baseline=Number(a.openingRaw)*factor;
  if(!Number.isFinite(baseline)||baseline<0)return fail("opening-valuation-invalid");
  sorted.push({at:start,tvlDelta:baseline,movedDelta:0,initial:true});
  for(const e of a.events){
   const delta=Number(e.raw)*factor;
   if(!Number.isFinite(delta))return fail("delta-out-of-range");
   sorted.push({at:e.at,tvlDelta:delta,movedDelta:Math.abs(delta)});
  }
 }
 sorted.sort((a,b)=>a.at-b.at);
 // Hour buckets preserve step changes (not invented daily prices).
 const points=[],bins=Math.ceil(days*24);
 let i=0,tvl=0,moved=0;
 for(let j=0;j<=bins;j++){
  const at=j===bins?now:Math.min(now,start+j*hour);
  while(i<sorted.length&&sorted[i].at<=at){
   tvl+=sorted[i].tvlDelta;moved+=sorted[i].movedDelta;i++;
  }
  if(tvl<-.000001)return fail("historical-tvl-underflow");
  points.push({asOf:new Date(at).toISOString(),lockedUsd:Math.max(0,tvl),
   movedWindowUsd:moved});
 }
 return {status:unknownTime?"partial":"verified",kind:"indexed-escrow-reconstruction-v1",
  pricing:"current-reference-price",unknownTime,unknown24h,asOf:new Date(now).toISOString(),
  points};
}
