// Public availability is derived ONLY from GitHub-generated deployment receipts.
// No separate manual activation or "verified" approval bit is required.
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const RECEIPT=/^deployments\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/;
const match=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const valid=item=>ADDRESS.test(item?.address||"")&&HASH.test(item?.runtimeCodeKeccak256||"")&&
 RECEIPT.test(item?.receiptPath||"");
const requiredCore=["factory","sourceRegistry","mailbox","ism","validatorRegistry"];
export function isDeployedChain(catalog,key){
 const chain=catalog?.chains?.[key],infra=catalog?.infrastructure?.[key];
 if(!chain||infra?.present!==true||!Number.isSafeInteger(chain.chainId)||
   chain.chainId!==infra.chainId)return false;
 const core=infra.xitaV315;
 if(!core||!Array.isArray(core.receiptPaths))return false;
 const receipts=new Set(core.receiptPaths);
 return requiredCore.every(name=>valid(core.components?.[name])&&receipts.has(core.components[name].receiptPath));
}
export function deployedRouteRecord(catalog,asset,route){
 const entry=catalog?.assets?.[asset];
 if(!entry||entry.deployment?.present!==true||!route)return null;
 const {sourceChain:src,destinationChain:dst}=route;
 if(src===dst||(src!=="xgrchain"&&dst!=="xgrchain")||
   !isDeployedChain(catalog,src)||!isDeployedChain(catalog,dst))return null;
 const dep=entry.deployment,refs=new Set(dep.receiptPaths||[]);
 const matchingReps=(chain)=>(dep.representations||[]).filter(r=>r.chain===chain&&
   ["nativeRouter","syntheticRouter","collateralRouter"].includes(r.component)&&
   valid(r)&&refs.has(r.receiptPath));
 const sourceReps=matchingReps(src),destinationReps=matchingReps(dst);
 if(sourceReps.length!==1||destinationReps.length!==1||
   !HASH.test(dep.assetId||"")||!match(dep.assetId,entry.metadata?.assetId))return null;
 // The Gateway's warpToken() is an ORIGINAL underlying ERC-20 for a
 // collateral router, but is the router address itself for a synthetic token.
 // Never ask users to approve the collateral router instead of their token.
 const metadataReps=entry.metadata?.representations||[];
 const matchingMetadata=(chain,component)=>{
  const role={nativeRouter:"native",collateralRouter:"collateral",
   syntheticRouter:"synthetic"}[component];
  const matches=metadataReps.filter(r=>r.chain===chain&&r.representation===role);
  return matches.length===1?matches[0]:null;
 };
 const sourceMeta=matchingMetadata(src,sourceReps[0].component),
  destMeta=matchingMetadata(dst,destinationReps[0].component);
 if(!sourceMeta||!destMeta)return null;
 const sourceType=sourceReps[0].component;
 const token=sourceType==="nativeRouter"?null:
  sourceType==="collateralRouter"?sourceMeta.assetAddress:sourceReps[0].address;
 if(sourceType==="collateralRouter"&&!ADDRESS.test(token||""))return null;
 const instances=(dep.routeDeployments||[]).filter(r=>
   r.routeName===route.name&&r.sourceChain===src&&r.destinationChain===dst&&
   HASH.test(r.routeId||"")&&valid(r.components?.gateway)&&valid(r.components?.feeVault)&&
   [r.components.gateway.receiptPath,r.components.feeVault.receiptPath].every(ref=>refs.has(ref)));
 if(instances.length!==1)return null; // Never silently choose an ambiguous route instance.
 return {asset,assetId:dep.assetId,name:route.name,source:src,destination:dst,
  routeId:instances[0].routeId,
  gateway:instances[0].components.gateway.address,
  feeVault:instances[0].components.feeVault.address,
  sourceRouter:sourceReps[0].address,
  destinationRouter:destinationReps[0].address,
  sourceToken:token};
}
export function deployedRoutes(catalog){
 const result=[];
 for(const [asset,entry] of Object.entries(catalog?.assets||{})){
  for(const route of entry?.routes?.routes||[]){
   const record=deployedRouteRecord(catalog,asset,route);
   if(record)result.push(record);
  }
 }
 return result;
}
// The optional GmbH Execution Gateway is separate from a historical
// permissionless ILN Gateway. Only verified, GitHub-receipted adapters
// activate a chain in the new commercial Transfer Tokens workflow.
export function documentedExecutionGateway(catalog,chain){
 const core=catalog?.infrastructure?.[chain]?.xitaV315;
 const gateway=core?.components?.executionGateway;
 return valid(gateway)&&Array.isArray(core?.receiptPaths)&&
  core.receiptPaths.includes(gateway.receiptPath)?gateway.address.toLowerCase():null;
}
export function executableTransferRoutes(catalog){
 // Both participating chains must have the chain-specific Execution Gateway:
 // partial deployment never advertises an available network or token route.
 return deployedRoutes(catalog).filter(route=>
  documentedExecutionGateway(catalog,route.source)!==null&&
  documentedExecutionGateway(catalog,route.destination)!==null);
}
export function supportedRouteChains(catalog,asset=null){
 const names=new Set(deployedRoutes(catalog).filter(r=>!asset||r.asset===asset)
   .flatMap(r=>[r.source,r.destination]));
 return Object.keys(catalog?.chains||{}).filter(key=>names.has(key));
}
