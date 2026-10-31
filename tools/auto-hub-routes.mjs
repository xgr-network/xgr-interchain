// Automatically extend already-approved hub assets to newly documented EVM spokes.
// An infrastructure manifest is deployment evidence ONLY with every expected
// immutable component receipt. This function derives DESIRED routes, not live
// routers, gateways or transfer authorization. No wallet action occurs here.
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const RECEIPT=/^deployments\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/;
function ready(catalog,name){
 const chain=catalog.chains?.[name],infra=catalog.infrastructure?.[name];
 if(!chain||!infra||infra.present!==true||chain.chainId!==infra.chainId||
    chain.domainId!==infra.domainId)return false;
 const bundle=infra.xitaV315;
 if(!Array.isArray(bundle?.receiptPaths))return false;
 const receipts=new Set(bundle.receiptPaths);
 const required=[
  "validatorRegistry","ism","transportBundle","mailbox","dispatchHook",
  "requiredHook","nativeRouterDeployer","syntheticRouterDeployer",
  "collateralRouterDeployer","factory","sourceRegistry","executionGateway",
  ...(chain.blsVerifierFormat==="eip2537"?["blsVerifier"]:[])
 ];
 return required.every(component=>{
  const part=bundle.components?.[component];
  return ADDRESS.test(part?.address||"")&&!/^0x0{40}$/i.test(part.address)&&
   HASH.test(part.runtimeCodeKeccak256||"")&&RECEIPT.test(part.receiptPath||"")&&
   part.receiptPath.startsWith("deployments/receipts/"+name+"/")&&
   receipts.has(part.receiptPath);
 });
}
export function deriveMissingHubRoutes(catalog){
 if(!catalog?.chains?.xgrchain||!catalog.assets||!catalog.infrastructure)
  throw Error("Canonical XGRChain hub inventory missing");
 if(!ready(catalog,"xgrchain"))return new Map();
 const targets=Object.keys(catalog.chains).filter(name=>name!=="xgrchain"&&ready(catalog,name)).sort();
 const updates=new Map();
 for(const [key,entry] of Object.entries(catalog.assets)){
  const meta=entry.metadata,routes=entry.routes;
  if(!meta||!routes||!Array.isArray(meta.representations)||!Array.isArray(routes.routes))
   throw Error("Invalid canonical asset route inventory: "+key);
  if(!meta.representations.some(rep=>rep.chain==="xgrchain"))continue;
  const nextMeta=structuredClone(meta),nextRoutes=structuredClone(routes);
  let changed=false;
  for(const name of targets){
   const present=nextMeta.representations.filter(rep=>rep.chain===name);
   if(present.length>1)throw Error("Duplicate representation on "+name+" for "+key);
   if(!present.length){
    if(meta.canonical?.chain===name)
     throw Error("Cannot invent canonical collateral on "+name+" for "+key);
    nextMeta.representations.push({chain:name,representation:"synthetic",
     symbol:"w"+meta.symbol,assetAddress:null});
    changed=true;
   }
   const paths=[
    ["xgrchain",name,"xgr_to_"+name],
    [name,"xgrchain",name+"_to_xgr"]
   ];
   for(const [source,destination,routeName] of paths){
    const byPair=nextRoutes.routes.filter(rt=>
     rt.sourceChain===source&&rt.destinationChain===destination);
    const byName=nextRoutes.routes.find(rt=>rt.name===routeName);
    if(byPair.length>1||(byName&&
       (byName.sourceChain!==source||byName.destinationChain!==destination)))
     throw Error("Conflicting asset route identity: "+key+" / "+routeName);
    if(!byPair.length){
     nextRoutes.routes.push({name:routeName,sourceChain:source,destinationChain:destination});
     changed=true;
    }
   }
  }
  if(changed)updates.set(key,{metadata:nextMeta,routes:nextRoutes});
 }
 return updates;
}
