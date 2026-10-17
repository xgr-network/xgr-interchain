// Pure, main-derived next-step planner for a wallet-confirmed batch.
// Call again AFTER each immutable receipt is published and the checkout syncs.
export function nextChainDeployment(queue,chainName){
 const chain=queue?.inventory?.chains?.find(c=>c.name===chainName);
 const infra=queue?.infrastructure?.find(c=>c.name===chainName);
 if(!chain||!infra)throw Error("Unknown GitHub-approved chain");
 // The normal "finish chain" operation NEVER deploys paid GmbH services.
 const part=infra.components.find(c=>!c.optional&&c.status!=="documented");
 return part?{kind:"chain",chain:chainName,component:part.key,id:chainName+":"+part.key}:null;
}
export function nextAssetDeployment(queue,tasks,assetKey){
 const asset=queue?.inventory?.assets?.[assetKey];
 if(!asset)throw Error("Unknown approved canonical asset");
 const needed=(tasks||[]).filter(t=>t.asset===assetKey);
 if(!needed.length)return null;
 // Routers are created once, then each directed route creates its own
 // Gateway/FeeVault atomically; never redeploy an existing representation.
 const ready=needed.find(t=>Array.isArray(t.blockers)&&t.blockers.length===0&&
   t.status==="ready-for-independent-validation");
 if(ready)return {...ready,kind:"asset",taskKind:ready.kind};
 const unmet=needed[0];
 return {kind:"blocked",id:unmet.id,chain:unmet.chain,
  blockers:unmet.blockers||["Route-Status noch nicht unabhängig verifiziert"]};
}
export function chainDeploymentParameters(component,readiness){
 const values=readiness?.values||{};
 if(component==="validatorRegistry"){
  if(!readiness?.evidenceVerified||!readiness.verifiedValidatorCount)
   throw Error("Validator-Set nicht verifiziert: "+(readiness?.evidenceError||"fehlende Genesis-BLS-Nachweise"));
  return {minimumWei:values.minimumReserveWei,
   maxExecutorReimbursementWei:values.maxExecutorReimbursementWei,
   perValidatorWei:values.perValidatorReserveWei};
 }
 if(component==="factory")return {sourceFeeWei:values.sourceFeeWei};
 return {};
}
