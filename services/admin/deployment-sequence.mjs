// XITA v3.1.5 chain bootstrapping (first launch: Base + XGRChain).
// This is a *read-only* dependency graph, not a transaction constructor.
// Every step must independently pass artifact, BLS and RPC verification
// before a wallet deployment executor can mark it executable.
const CHAINS=new Set(["base","xgrchain"]);
const COMPONENTS=["blsVerifier","validatorRegistry","ism","factory","sourceRegistry"];
const distinct=xs=>[...new Set(xs)];
const step=(chain,component,title,kind,status,blockers,details={})=>({
 id:chain+":"+component,chain,component,title,kind,status,
 blockers:distinct(blockers),...details
});
function contractStatus(infra,component){
 return infra.components.find(x=>x.key===component)?.status==="documented"?"documented":"not-deployed";
}
export function buildFirstChainDeploymentPlan(inventory,infrastructure,bootstrap){
 const chainByName=new Map(inventory.chains.map(c=>[c.name,c]));
 const infraByName=new Map(infrastructure.map(c=>[c.name,c]));
 const bootstrapByName=new Map(bootstrap.map(b=>[b.chain,b]));
 const chainPlans=[];
 for(const name of ["base","xgrchain"]){
  const chain=chainByName.get(name),infra=infraByName.get(name),plan=bootstrapByName.get(name);
  if(!chain||!infra||!plan||!CHAINS.has(name))
   throw Error("Base/XGRChain is missing from the GitHub main inventory");
  if((name==="xgrchain")!==(chain.chainId===1643&&chain.domainId===1643))
   throw Error("Invalid XGRChain-only topology");
  const missingBase=plan.missing||[];
  const readyBootstrap=plan.ready===true;
  const sourceFee=plan.proposedFeeWei;
  const known=new Map();
  const steps=[];
  const add=(component,title,kind,prereqs=[],extra=[])=>{
   const deployed=component!=="nativeVerifier"&&contractStatus(infra,component)==="documented";
   const deps=prereqs.filter(p=>!known.get(p));
   const blockers=deployed?[]:[...extra,...deps.map(d=>"Vorheriger Schritt fehlt: "+d)];
   if(!deployed && kind!=="verify")blockers.push("Commitgebundenes Contract-Artefakt und geprüfter Wallet-Executor fehlen");
   const status=deployed?"documented":kind==="verify"?"verification-required":"blocked";
   const item=step(name,component,title,kind,status,blockers,{dependsOn:prereqs,chainId:chain.chainId});
   steps.push(item);
   known.set(component,deployed);
  };
  // XGRChain uses a native compressed verifier; never deploy a new
  // Solidity EIP-2537 verifier as a substitute for the native precompile.
  if(name==="xgrchain")
   add("nativeVerifier","Nativer BLS-Verifier 0x2040 prüfen","verify",[],[
    "Positive UND negative komprimierte BLS-Testvektoren auf XGRChain erforderlich"
   ]);
  else add("blsVerifier","EIP-2537-BLS-Verifier deployen","deploy",[],[
   "Positive und negative EIP-2537-Precompile-Testvektoren auf Base fehlen"
  ]);
  add("validatorRegistry","Drei initiale Validatoren registrieren","deploy",
   [name==="xgrchain"?"nativeVerifier":"blsVerifier"],[
    ...(!readyBootstrap?missingBase:[]),
    "Finalisierten XGR-PoS-Snapshot, echte PoPs und Reservewerte on-chain prüfen"
   ]);
  add("ism","Interchain Security Module bereitstellen","deploy",["validatorRegistry"]);
  add("factory","Permissionless Factory mit initialer Source-Fee deployen",
   "deploy",["validatorRegistry","ism"],[
    sourceFee===null?"Initiale native Source-Chain-Gebühr in GitHub main fehlt":
     "Initialgebühr "+sourceFee+" Wei als unveränderlichen Konstruktorparameter nachweisen"
   ]);
  add("sourceRegistry","Factory-eigene Source-Registry erzeugen","factory-call",["factory"],[
    "Fee Nonce 0 und korrekte Factory-Bindung nachweisen"
   ]);
  const finished=steps.filter(s=>s.status==="documented").length;
  chainPlans.push({name,chainId:chain.chainId,domainId:chain.domainId,
   initialValidators:plan.initialValidators,
   initialFeeWei:sourceFee,bootstrapReady:readyBootstrap,
   bootstrapMissing:[...missingBase],verifiedComponents:finished,totalSteps:steps.length,
   chainStatus:finished===steps.length?"documented":finished?"partial":"not-deployed",steps});
 }
 // The first asset must pass BOTH hub directions' authenticated route safety
 // before bridges, wrapped tokens and funds are released.
 const xgr=inventory.assets.XGR;
 if(!xgr)throw Error("XGR first asset is not approved in main");
 const directRoutes=xgr.routes.filter(r=>(r.source==="base"&&r.destination==="xgrchain")||
   (r.source==="xgrchain"&&r.destination==="base"));
 if(directRoutes.length!==2)throw Error("First XGR/Base pair must contain exactly two hub-directed routes");
 return {schemaVersion:1,mode:"preflight-only",chains:chainPlans,asset:{
  key:"XGR",assetId:xgr.assetId,routeIds:directRoutes.map(r=>r.name),
  status:"blocked",reason:"Both source chains require independently verified reciprocal routes and BLS safety"
 },warning:"No wallet transaction is authorized by this read-only plan."};
}
