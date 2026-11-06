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
 check(JSON.stringify(plan?.solanaPrograms)===JSON.stringify(PROGRAMS)&&
  JSON.stringify(plan?.xgrChainContracts)===JSON.stringify(XGR_CONTRACTS),
  "Solana programs / XGR-side contracts are incomplete");
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
  programs:PROGRAMS.map(name=>({name,status:"not-deployed"})),
  xgrContracts:XGR_CONTRACTS.map(name=>({name,status:"not-deployed"})),
  note:"Solana program and XGR-side adapters must be implemented/audited; RPC checks do not permit deployment."};
}
