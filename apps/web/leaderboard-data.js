// XITA verified asset metrics projection. Never infer collateral from wrapped supply.
// Snapshot schema: xita-asset-metrics-v1, data only from verified finalised ledger facts.
// Missing or incomplete metrics remain null, not zero.
const finite=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const safeDecimal=v=>typeof v==="string"&&/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(v);
const amount=v=>safeDecimal(v)?Number(v):null;
export function verifiedMetrics(snapshot,assetId){
 const row=snapshot?.schemaVersion===1&&snapshot?.kind==="xita-asset-metrics-v1"&&snapshot.assets?.[assetId];
 if(!row||row.assetId!==assetId)return null;
 const ledgerVerified=row.verified===true;
 const valuation=row.market||{},custody=row.custody||{},movement=row.movement||{};
 const price=valuation.status==="verified"&&finite(valuation.priceUsd)?valuation.priceUsd:null;
 const circulating=valuation.status==="verified"&&safeDecimal(valuation.circulatingRaw)&&Number.isInteger(valuation.decimals)&&valuation.decimals>=0&&valuation.decimals<=36?Number(valuation.circulatingRaw)/10**valuation.decimals:null;
 const marketCap=valuation.status==="verified"&&finite(valuation.marketCapUsd)&&price!==null&&circulating!==null?valuation.marketCapUsd:
  valuation.status==="market-data"&&valuation.source==="coingecko"&&finite(valuation.marketCapUsd)&&
  finite(valuation.priceUsd)&&valuation.priceUsd>0&&finite(valuation.circulating)&&valuation.circulating>0
    ?valuation.marketCapUsd:null;
 // Custody must be attested from verified balances with withdrawals and unrelated
 // incoming transfers excluded, independently per route's physical escrow.
 const locked= ledgerVerified&&custody.status==="verified"&&custody.complete===true&&finite(custody.lockedUsd)&&
 Array.isArray(custody.vaults)&&custody.vaults.length>0&&
 custody.vaults.every(x=>x.verified===true&&typeof x.chain==="string"&&typeof x.router==="string"&&safeDecimal(x.netLockedRaw)&&finite(x.valueUsd))&&
 new Set(custody.vaults.map(x=>x.chain.toLowerCase()+":"+x.router.toLowerCase())).size===custody.vaults.length
  ?Math.abs(custody.vaults.reduce((n,x)=>n+x.valueUsd,0)-custody.lockedUsd)<=Math.max(.000001,custody.lockedUsd*.00000001)?custody.lockedUsd:null:null;
 // One journey ID = one end-user transfer across XGR (not twice for two hops).
 const moved=ledgerVerified&&movement.status==="verified"&&movement.complete===true&&finite(movement.movedUsd)&&
 Array.isArray(movement.journeys)&&
 movement.journeys.every(x=>typeof x.id==="string"&&x.id.length>0&&x.verified===true&&x.viaHub===true&&finite(x.valueUsd)&&Array.isArray(x.hops)&&x.hops.length>=1&&x.hops.length<=2&&x.hops.every(h=>h.includes("xgrchain")))&&
 new Set(movement.journeys.map(x=>x.id)).size===movement.journeys.length&&
 Math.abs(movement.journeys.reduce((n,x)=>n+x.valueUsd,0)-movement.movedUsd)<=Math.max(.000001,movement.movedUsd*.00000001)
  ?movement.movedUsd:null;
 return {marketCapUsd:marketCap,lockedUsd:locked,movedUsd:moved,asOf:row.asOf||null};
}
export function rankAssets(rows,key="lockedUsd",direction="desc"){
 const multiplier=direction==="asc"?1:-1;
 return [...rows].sort((a,b)=>{
  const av=a[key],bv=b[key];
  const va=finite(av),vb=finite(bv);
  if(va!==vb)return va?-1:1;
  if(!va)return a.name.localeCompare(b.name);
  return (av-bv)*multiplier||a.name.localeCompare(b.name);
 });
}
export const formatUsd=(v)=>finite(v)?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:v<1?6:2}).format(v):"—";
export function buildLeaderboardRows(catalog,snapshot){
 return Object.entries(catalog?.assets||{}).map(([id,asset])=>{
  const facts=verifiedMetrics(snapshot,id);
  return {id,name:asset.profile?.name||asset.metadata?.name||id,
   slug:asset.profile?.slug||id.toLowerCase(),
   logo:asset.profile?.branding?.logoUrl||null,
   marketCapUsd:facts?.marketCapUsd??null,
   lockedUsd:facts?.lockedUsd??null,movedUsd:facts?.movedUsd??null,
   asOf:facts?.asOf||null,
   configuredRoutes:asset.routes?.routes?.length||0};
 });
}
