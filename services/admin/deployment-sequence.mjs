// Configuration-derived, read-only deployment graph. No chain name, order or
// verifier address is embedded in the executor. XGRChain is merely the hub
// defined by the approved asset route graph.
const distinct=xs=>[...new Set(xs)];
function isDeployed(infra,key){return infra.components.some(c=>c.key===key&&c.status==="documented")}
export function buildDeploymentPlan(inventory,infrastructure,bootstrap){
 const infraByName=new Map(infrastructure.map(x=>[x.name,x]));
 const bootByName=new Map(bootstrap.map(x=>[x.chain,x]));
 const chains=inventory.chains.map(chain=>{
  const infra=infraByName.get(chain.name),b=bootByName.get(chain.name);
  if(!infra||!b||infra.chainId!==chain.chainId||infra.domainId!==chain.domainId)
   throw Error("Missing matching main-approved deployment configuration: "+chain.name);
  if(!["compressed","eip2537"].includes(chain.blsVerifierFormat))
   throw Error("Unsupported configured BLS verifier format: "+chain.name);
  const native=chain.blsVerifierFormat==="compressed";
  if(native&&!b.verifierAddress)throw Error("Missing configured native verifier address: "+chain.name);
  const steps=[];
  const add=(component,title,kind,dependsOn=[],extra=[])=>{
   const documented=kind!=="verify"&&isDeployed(infra,component);
   const blockers=documented?[]:distinct([
    ...extra,
    ...dependsOn.filter(k=>!steps.some(s=>s.component===k&&s.status==="documented")).map(k=>"Vorheriger Schritt fehlt: "+k),
    ...(kind==="verify"?[]:["Commitgebundenes Contract-Artefakt und geprüfter Wallet-Executor fehlen"])
   ]);
   steps.push({id:chain.name+":"+component,chain:chain.name,chainId:chain.chainId,
    component,title,kind,status:documented?"documented":kind==="verify"?"verification-required":"blocked",
    dependsOn,blockers});
  };
  const verifierComponent=native?"nativeVerifier":"blsVerifier";
  add(verifierComponent,native?"Konfigurierten nativen BLS-Verifier prüfen":"EIP-2537-Verifier bereitstellen",
   native?"verify":"deploy",[],["Positive und negative BLS-Testvektoren erforderlich"]);
  add("validatorRegistry","Initiale ValidatorRegistry", "deploy",[verifierComponent],
   [...b.missing,"Finalisierten PoS-Snapshot und chain-gebundene BLS-PoPs verifizieren"]);
  add("ism","Interchain Security Module","deploy",["validatorRegistry"]);
  add("factory","Permissionless Factory mit Initialgebühr","deploy",["validatorRegistry","ism"],
   [b.proposedFeeWei===null?"Source-Chain-Initialgebühr in GitHub main fehlt":"Konstruktor-Gebühr "+b.proposedFeeWei+" Wei prüfen"]);
  add("sourceRegistry","Factory-eigene Source-Registry","factory-call",["factory"],["Fee Nonce 0 und Factory-Bindung nachweisen"]);
  const verifiedComponents=steps.filter(s=>s.status==="documented").length;
  return {name:chain.name,chainId:chain.chainId,domainId:chain.domainId,
   verifierFormat:chain.blsVerifierFormat,verifierAddress:b.verifierAddress,
   nativeCurrency:chain.nativeCurrency,initialFeeWei:b.proposedFeeWei,
   initialValidators:b.initialValidators,bootstrapReady:b.ready,bootstrapMissing:b.missing,
   verifiedComponents,totalSteps:steps.length,steps};
 });
 const assets=Object.values(inventory.assets).map(a=>({
  key:a.key,assetId:a.assetId,routes:a.routes.map(r=>({
   name:r.name,source:r.source,destination:r.destination,status:r.status
  }))
 }));
 return {schemaVersion:1,mode:"preflight-only",chains,assets,
  warning:"No wallet transaction is authorized by this read-only configuration-derived plan."};
}
// Backwards-compatible alias for callers, not a fixed Base/XGR plan.
export const buildFirstChainDeploymentPlan=buildDeploymentPlan;
