// Independently compute the exact last 24h TVL change from already indexed
// canonical lock/unlock events and the verified current indexed position.
// This does not depend on the 30-day historical chart reconstruction.
// Historical/current USD values both use the SAME current reference price.
const fail=reason=>({status:"unavailable",reason});
export function indexedTvlChange24h(assets,positions,{now=Date.now(),required}={}){
 if(!Array.isArray(assets)||!Array.isArray(positions)||assets.length===0||
    assets.length!==required||positions.length!==required)
  return fail("asset-coverage-incomplete");
 let current=0,opening=0;
 for(let i=0;i<assets.length;i++){
  const asset=assets[i],position=positions[i];
  if(!asset||!["verified","partial"].includes(asset.status)||
     asset.unknown24h!==0||position?.status!=="verified"||
     typeof position.lockedUsd!=="number"||!Number.isFinite(position.lockedUsd)||
     position.lockedUsd<0||!Number.isSafeInteger(asset.decimals)||
     !Number.isFinite(asset.priceUsd)||asset.priceUsd<=0||
     typeof asset.openingRaw!=="bigint"||asset.openingRaw<0n)
   return fail("24h-canonical-history-incomplete");
  const baseline=Number(asset.openingRaw)/10**asset.decimals*asset.priceUsd;
  if(!Number.isFinite(baseline)||baseline<0)return fail("historical-valuation-invalid");
  // Guard consistency between reconstructed current position and independently
  // verified indexed collateral; a mismatched base must not yield a percent.
  const delta=asset.events.reduce((sum,event)=>sum+Number(event.raw)/10**asset.decimals*asset.priceUsd,0);
  if(!Number.isFinite(delta)||
     Math.abs(baseline+delta-position.lockedUsd)>Math.max(0.02,position.lockedUsd*.00001))
   return fail("indexed-position-history-mismatch");
  opening+=baseline;current+=position.lockedUsd;
 }
 if(opening<=0)return fail("24h-opening-collateral-zero");
 const percent=100*(current-opening)/opening;
 if(!Number.isFinite(percent))return fail("24h-percentage-out-of-range");
 return {status:"verified",kind:"indexed-tvl-change-24h-v1",
  asOf:new Date(now).toISOString(),pricing:"current-reference-price",
  openingUsd:opening,currentUsd:current,percent};
}
