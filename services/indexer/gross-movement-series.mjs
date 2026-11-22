// Historical gross escrow volume is intentionally independent of the TVL
// balance reconstruction: an unavailable opening balance must never erase
// time-stamped, finalized lock/unlock history. No additional SQL or RPC reads.
const HEX64=/^0x[0-9a-f]{64}$/i, UINT=/^[1-9][0-9]*$/;
const lowercase=v=>String(v??"").toLowerCase();
const asTime=v=>v==null?NaN:Date.parse(v);
const fail=reason=>({status:"unavailable",reason});
const DAY=86400000;
export function indexedGrossMovementEvents({descriptor,rows,coverage,price,now=Date.now(),days=30}){
 if(descriptor?.status!=="ready"||!Array.isArray(rows)||coverage?.complete!==true||
  !(Number.isFinite(price?.priceUsd)&&price.priceUsd>0)||
  !(Number.isSafeInteger(descriptor.decimals)&&descriptor.decimals>=0&&descriptor.decimals<=36))
  return fail("volume-coverage-or-price-incomplete");
 const routes=new Map(descriptor.escrowRoutes.map(r=>[r.source+":"+lowercase(r.routeId),r]));
 const identities=new Set(),events=[];let unknownTime=0;
 const min=now-days*DAY;
 for(const row of rows){
  if(row.asset!==descriptor.asset||lowercase(row.asset_id)!==lowercase(descriptor.assetId)||
   !HEX64.test(row.message_id||"")||!HEX64.test(row.source_block_hash||"")||
   !UINT.test(String(row.amount_raw??"")))return fail("invalid-canonical-operation");
  const key=row.source_chain+":"+lowercase(row.message_id);
  if(identities.has(key))return fail("duplicate-canonical-operation");
  identities.add(key);
  const route=routes.get(row.source_chain+":"+lowercase(row.route_id));
  if(!route||route.destination!==row.destination_chain||
     lowercase(route.gateway)!==lowercase(row.gateway))return fail("unknown-canonical-route");
  let when=null,bound=null;
  if(route.source===descriptor.chain){
   when=row.source_block_at;bound=row.source_indexed_at;
  }else if(route.destination===descriptor.chain && row.delivered===true){
   when=row.escrow_outflow_observed_at;bound=row.delivery_checked_at;
  }else continue;
  const at=asTime(when),observedAt=asTime(bound);
  if(Number.isFinite(at)&&at>now+30000)return fail("future-canonical-event");
  if(!Number.isFinite(at)){
   // An old observation can safely be excluded from the 30d chart.
   // Otherwise its amount remains part of the lifetime figure but its
   // historical location is unknown: never invent a block timestamp.
   if(!Number.isFinite(observedAt)||observedAt>=min)unknownTime++;
   continue;
  }
  if(at<min||at>now)continue;
  const amount=Number(BigInt(row.amount_raw))/10**descriptor.decimals*price.priceUsd;
  if(!Number.isFinite(amount)||amount<=0)return fail("invalid-movement-valuation");
  events.push({at,usd:amount});
 }
 return {status:unknownTime?"partial":"verified",asset:descriptor.asset,
  priceBasis:"current-reference-price",unknownTime,events};
}

export function combineGrossMovementEvents(assets,{now=Date.now(),days=30}={}){
 if(!Array.isArray(assets)||!assets.length||assets.some(a=>!["verified","partial"].includes(a.status)))
  return fail("gross-history-incomplete");
 const start=now-days*DAY,events=assets.flatMap(a=>a.events).sort((a,b)=>a.at-b.at);
 let accumulated=0,i=0;
 const points=[];
 for(let n=0;n<=days*24;n++){
  const at=n===days*24?now:start+n*3600000;
  while(i<events.length&&events[i].at<=at){accumulated+=events[i].usd;i++;}
  points.push({asOf:new Date(at).toISOString(),movedWindowUsd:accumulated});
 }
 const missing=assets.reduce((n,a)=>n+a.unknownTime,0);
 return {kind:"indexed-gross-movement-history-v1",
  status:missing?"partial":"verified",unknownTime:missing,
  asOf:new Date(now).toISOString(),pricing:"current-reference-price",points};
}
