// Solana is a separate SVM admission/deployment path. Read-only planning
// MUST NOT be mistaken for main-approved EVM executable infrastructure.
import {readFileSync} from "node:fs";
import {join} from "node:path";

export const SOLANA_DOMAIN=1399811149;
export const SOLANA_GENESIS="5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const SOLANA_PLAN_PATH="config/chains/solana/integration.json";
const PROGRAMS=["mailbox","validatorRegistry","directBlsVerifier","sourceRegistry",
 "factory","feeVault","collateralRouter","syntheticRouter"];
const XGR_CONTRACTS=["solanaFactory","solanaRouteRegistry","solanaRouter","solanaDirectBlsIsm"];
// Exact functional invariants from EVM v3.1.5. Solana may use one Rust program
// with multiple PDA accounts, but must not invent a second protocol/governance.
export const EVM_PARITY={
 baseline:"XITA-v3.1.5-direct-bls",
 routing:"xgrchain-1643-mandatory-two-hop",
 assetIdentity:"one-canonical-asset-id-per-origin",
 routerCreation:"permissionless-creator-owned-router",
 routeRegistration:"permissionless-append-only-active-on-registration",
 feeBootstrap:"factory-constructor-source-native",
 feeUpdates:"current-validator-set-bls-quorum",
 feeAccounting:"route-feevault-validator-set-epoch-pull-claims",
 validatorMembership:"current-set-bls-quorum-with-possession-proof",
 messageAuthorization:"direct-bls-current-destination-set",
 sourceEvidence:"independent-finalized-source-lock-burn-fee-and-route",
 execution:"user-signed-replaceable-executor",
 optionalService:"separate-commercial-execution-gateway",
 destination:"proof-gated-mint-unlock-and-replay-protection",
 existingRoutes:"evm-contracts-and-wire-unchanged"
};

export function validateSolanaPlan(plan){
 const errors=[],check=(ok,message)=>{if(!ok)errors.push(message)};
 check(plan?.schemaVersion===1&&plan.kind==="xita-chain-integration-plan"&&
  plan.name==="solana"&&plan.protocol==="sealevel"&&plan.network==="mainnet-beta",
  "invalid Solana integration identity");
 check(plan?.networkIdentity?.kind==="solana-genesis-hash"&&
  plan.networkIdentity.value===SOLANA_GENESIS&&plan.domainId===SOLANA_DOMAIN,
  "invalid Solana genesis/domain");
 check(plan?.hub?.name==="xgrchain"&&plan.hub.domainId===1643,
  "Solana routes must use the XGRChain hub");
 check(plan?.status==="development"&&plan.deploymentEnabled===false&&
  plan.protocolAdmissionEnabled===false,
  "Solana integration must remain inactive before security review");
 const policy=plan?.authorityPolicy;
 check(policy?.programUpgradeAuthority==="none-before-route-activation"&&
  policy?.programCloseAuthority==="none-before-route-activation"&&
  policy?.wrappedMintAuthority==="immutable-route-program-pda"&&
  policy?.wrappedFreezeAuthority==="none"&&
  policy?.tokenVaultAuthority==="immutable-route-program-pda"&&
  policy?.factoryRegistration==="permissionless"&&
  policy?.serviceOperatorAdmin==="optional-service-gateway-only"&&
  policy?.privilegedPause==="none"&&
  policy?.forcedRouteMigration==="forbidden"&&
  policy?.signedValidatorGovernance==="verified-xgr-bls-quorum",
  "Solana permissionless authority policy must forbid unilateral admin control");
 check(plan?.evmParity&&Object.keys(EVM_PARITY).length===Object.keys(plan.evmParity).length&&
  Object.entries(EVM_PARITY).every(([name,value])=>plan.evmParity[name]===value),
  "Solana must retain all EVM XITA protocol invariants");
 check(JSON.stringify(plan?.solanaPrograms)===JSON.stringify(PROGRAMS)&&
  JSON.stringify(plan?.xgrChainContracts)===JSON.stringify(XGR_CONTRACTS),
  "Solana programs / XGR-side contracts are incomplete");
 check(plan?.solanaDeploymentModel==="single-immutable-svm-executable-multiple-modules-and-pdas",
  "Solana executable must be one immutable program with multiple Rust modules");
 const seenURLs=new Set(),seenOperators=new Set();
 check(Array.isArray(plan?.rpcWitnesses)&&plan.rpcWitnesses.length>=2,
  "Solana requires independent RPC witnesses");
 for(const ep of plan?.rpcWitnesses||[]){
  let valid=false;
  try{
   const url=new URL(ep.url);
   valid=url.protocol==="https:"&&Boolean(url.hostname)&&!url.username&&!url.password&&
    url.pathname==="/"&&!url.search&&!url.hash;
  }catch{}
  check(valid,"Solana RPC must be a plain HTTPS origin");
  check(typeof ep.operatorId==="string"&&/^[a-z0-9][a-z0-9-]{1,39}$/.test(ep.operatorId)&&
   !seenOperators.has(ep.operatorId),
   "duplicate or invalid Solana RPC operator");
  check(!seenURLs.has(ep.url),"duplicate Solana RPC URL");
  seenOperators.add(ep.operatorId);seenURLs.add(ep.url);
 }
 return errors;
}
export function readSolanaPlan(root){
 const plan=JSON.parse(readFileSync(join(root,SOLANA_PLAN_PATH),"utf8"));
 const errors=validateSolanaPlan(plan);
 if(errors.length)throw Error(errors.join("; "));
 return plan;
}

// Same chain inventory shape as EVM. This is NOT protocol admission or a
// real deployed SVM program. Never invent an EVM chainId for Solana.
export function solanaInfrastructurePlan(plan){
 const errors=validateSolanaPlan(plan);
 if(errors.length)throw Error(errors.join("; "));
 const components=[
  // One independently deployed SVM executable with Solidity-parity Rust
  // modules. Router, route, validator and fee vault data are separate PDAs,
  // NOT separate executable Program IDs.
  {key:"xitaProtocol",network:"solana",runtime:"svm",kind:"program",
   modules:[...plan.solanaPrograms],status:"not-deployed",
   address:null,optional:false,deployable:false},
  ...plan.xgrChainContracts.map(key=>({key,network:"xgrchain",runtime:"evm",
   status:"not-deployed",address:null,optional:false,deployable:false}))
 ];
 return {name:"solana",displayName:plan.displayName,runtime:"svm",network:plan.network,
  chainId:null,domainId:plan.domainId,genesisHash:plan.networkIdentity.value,
  nativeCurrency:{name:"Solana",symbol:"SOL",decimals:9},
  rpcUrls:plan.rpcWitnesses.map(e=>e.url),
  status:"not-deployed",phase:"development",deployable:false,
  documented:0,required:components.length,components,
  hyperlane:{mailbox:null,dispatchHook:null,requiredHook:null,transportBundle:null}};
}
export function solanaInfrastructureObservation(plan,probe){
 const c=solanaInfrastructurePlan(plan);
 if(!probe||probe.chain!=="solana"||probe.deploymentEnabled!==false)
  throw Error("Invalid Solana preflight");
 return {name:c.name,chainId:null,domainId:c.domainId,runtime:"svm",
  rpc:probe.rpcPreflightOK,core:false,status:"not-deployed",
  components:c.components.map(x=>({...x,live:false})),
  rpcPreflightOK:probe.rpcPreflightOK,
  independentWitnesses:probe.independentWitnesses,
  rpcWitnessCount:plan.rpcWitnesses.length,rpcWitnesses:probe.rpc};
}

async function rpcCall(fetcher,endpoint,method,params){
 const response=await fetcher(endpoint,{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
  signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw Error("Solana RPC HTTP "+response.status);
 const raw=await response.text();
 if(raw.length>16384)throw Error("Solana RPC response too large");
 const result=JSON.parse(raw);
 if(result?.jsonrpc!=="2.0"||result.id!==1||result.error||
  result.result===null||result.result===undefined)
  throw Error("Solana RPC returned invalid response");
 return result.result;
}

// Diagnostic only: RPC availability is NEVER authority to enable program
// deployment, attest an XITA message, or publish a chain as usable.
export async function probeSolanaPlan(plan,{fetcher=globalThis.fetch}={}){
 const errors=validateSolanaPlan(plan);
 if(errors.length)throw Error(errors.join("; "));
 const rpc=await Promise.all(plan.rpcWitnesses.map(async ep=>{
  try{
   const genesis=await rpcCall(fetcher,ep.url,"getGenesisHash",[]);
   if(genesis!==SOLANA_GENESIS)throw Error("Genesis hash mismatch");
   const slot=await rpcCall(fetcher,ep.url,"getSlot",[{commitment:"finalized"}]);
   if(!Number.isSafeInteger(slot)||slot<=0)throw Error("No finalized Solana slot");
   return {operatorId:ep.operatorId,healthy:true,finalizedSlot:slot};
  }catch(error){
   return {operatorId:ep.operatorId,healthy:false,error:String(error.message||error).slice(0,140)};
  }
 }));
 return {chain:"solana",phase:"development",deploymentEnabled:false,
  independentWitnesses:rpc.filter(r=>r.healthy).length,
  rpcPreflightOK:rpc.filter(r=>r.healthy).length>=2,rpc,
  programs:[{name:"xitaProtocol",modules:PROGRAMS,status:"not-deployed"}],
  xgrContracts:XGR_CONTRACTS.map(name=>({name,status:"not-deployed"})),
  note:"Solana program and XGR-side adapters must be implemented/audited; RPC checks do not permit deployment."};
}
