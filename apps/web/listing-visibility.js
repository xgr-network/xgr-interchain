// XITA visibility derives from verified deployment records plus an indexer snapshot.
// No listing.json, manual publication switches, or inferred bridge activation.
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const RECEIPT=/^deployments\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/;
const match=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const bound=(item)=>ADDRESS.test(item?.address||"")&&HASH.test(item?.runtimeCodeKeccak256||"")&&RECEIPT.test(item?.receiptPath||"");
const componentFor=role=>({native:"nativeRouter",collateral:"collateralRouter",synthetic:"syntheticRouter"})[role]||null;

export function isDeployedAsset(entry){
 const asset=entry?.metadata,deployment=entry?.deployment,routes=entry?.routes?.routes;
 if(!asset||!deployment||deployment.present!==true||
   !HASH.test(asset.assetId||"")||!match(asset.assetId,deployment.assetId)||
   asset.asset!==deployment.asset||!Array.isArray(asset.representations)||
   asset.representations.length<2||!Array.isArray(routes)||routes.length<2||
   !Array.isArray(deployment.representations)||!Array.isArray(deployment.routeDeployments)||
   !Array.isArray(deployment.receiptPaths))return false;
 const references=new Set(deployment.receiptPaths);
 const repChains=new Set();
 for(const rep of asset.representations){
  if(!rep?.chain||repChains.has(rep.chain))return false;
  repChains.add(rep.chain);
  const component=componentFor(rep.representation);
  const matched=deployment.representations.filter(r=>r.chain===rep.chain&&r.component===component);
  if(!component||matched.length!==1||!bound(matched[0])||!references.has(matched[0].receiptPath))return false;
 }
 const routeNames=new Set();
 for(const route of routes){
  if(!route?.name||routeNames.has(route.name)||!repChains.has(route.sourceChain)||
    !repChains.has(route.destinationChain)||route.sourceChain===route.destinationChain||
    (route.sourceChain!=="xgrchain"&&route.destinationChain!=="xgrchain"))return false;
  routeNames.add(route.name);
  const records=deployment.routeDeployments.filter(r=>r.routeName===route.name&&
   r.sourceChain===route.sourceChain&&r.destinationChain===route.destinationChain);
  if(records.length!==1)return false;
  const record=records[0];
  if(!HASH.test(record.routeId||"")||!bound(record.components?.gateway)||
    !bound(record.components?.feeVault)||
    ![record.components.gateway.receiptPath,record.components.feeVault.receiptPath].every(p=>references.has(p)))return false;
 }
 return true;
}
export function listingStatus(entry,visibilityRow){
 if(!isDeployedAsset(entry))return "prospect";
 if(visibilityRow?.status==="public")return "public";
 if(visibilityRow?.status==="accepted")return "accepted";
 return "unknown";
}
export function isPublicAsset(id,entry,visibility){
 const row=visibility?.schemaVersion===1&&visibility?.kind==="xita-visibility-v1"?
  visibility.assets?.[id]:null;
 return isDeployedAsset(entry)&&row?.status==="public"&&match(row.assetId,entry.metadata.assetId);
}
export function publicDirectoryCatalog(catalog,visibility){
 return {...catalog,assets:Object.fromEntries(
  Object.entries(catalog?.assets||{}).filter(([id,entry])=>isPublicAsset(id,entry,visibility))
 )};
}
