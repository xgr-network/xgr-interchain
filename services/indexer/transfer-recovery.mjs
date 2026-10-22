// Source-of-truth is the chain: this endpoint only prepares permissionless,
 // UNSIGNED destination Mailbox.process calldata from canonical on-chain proof.
 // Never persists wallet state, accepts RPC URLs from users, or holds a signer.
import {execFile} from "node:child_process";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {selector} from "../../apps/web/keccak.js";
import {rpc as readPublicRpc} from "../../tools/probe-base-rpc.mjs";
import {rpcCandidates} from "./transfer-index.mjs";
const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const processSelector=selector("process(bytes,bytes)");
// The XGR node discovers RouteAdded events from the source ILN Registry and
// registers each route under iln_<sourceDomain>_<destinationDomain>_<routeId>.
// Do not require any per-token route ENV or a manually deployed route alias.
export function ilnValidatorRouteName(sourceDomain,destinationDomain,routeId){
 if(!Number.isSafeInteger(sourceDomain)||sourceDomain<=0||sourceDomain>0xffffffff||
    !Number.isSafeInteger(destinationDomain)||destinationDomain<=0||destinationDomain>0xffffffff||
    !HASH.test(routeId||"")||/^0x0{64}$/i.test(routeId))
  throw Error("Invalid canonical ILN route identity");
 return "iln_"+sourceDomain+"_"+destinationDomain+"_"+routeId.slice(2).toLowerCase();
}
export function resolveRecoveryRoute(catalog,routeName,messageId,asset,sourceTxHash=null){
 if(!HASH.test(messageId||"")||!/^[-a-z0-9_]{1,72}$/.test(routeName||"")||
    !/^[a-zA-Z0-9_-]{1,48}$/.test(asset||""))
  throw Error("Invalid message ID or direction");
 if(sourceTxHash!==null&&!HASH.test(sourceTxHash))
  throw Error("Invalid source transaction hash");
 const routes=deployedRoutes(catalog).filter(r=>r.asset===asset&&r.name===routeName);
 if(routes.length!==1)throw Error("No unique deployed route for this message");
 const route=routes[0],src=catalog.chains[route.source],dst=catalog.chains[route.destination];
 const srcCore=catalog.infrastructure[route.source].xitaV315.components,
  dstCore=catalog.infrastructure[route.destination].xitaV315.components;
 const values={
  ORIGIN_RPC_URL:src.rpcUrls?.[0],
  ORIGIN_CHAIN_ID:String(src.chainId),
  ORIGIN_DOMAIN:String(src.domainId),
  ORIGIN_MAILBOX:srcCore.mailbox?.address,
  ORIGIN_MERKLE_TREE_HOOK:srcCore.merkleTreeHook?.address,
  ORIGIN_ILN_REGISTRY:srcCore.sourceRegistry?.address,
  ORIGIN_ILN_GATEWAY:route.gateway,
  ORIGIN_WARP_ROUTER:route.sourceRouter,
  ORIGIN_CONFIRMATIONS:String(Math.max(1,src.confirmations||1)),
  ORIGIN_LOG_CHUNK:"750",
  ...(sourceTxHash?{SOURCE_TX_HASH:sourceTxHash.toLowerCase()}:{}),
  ATTESTATION_RPC_URL:catalog.chains.xgrchain.rpcUrls?.[0],
  ROUTE_ID:route.routeId,
  ATTESTATION_ROUTE:ilnValidatorRouteName(src.domainId,dst.domainId,route.routeId),
  DESTINATION_RPC_URL:dst.rpcUrls?.[0],
  DESTINATION_CHAIN_ID:String(dst.chainId),
  DESTINATION_DOMAIN:String(dst.domainId),
  DESTINATION_MAILBOX:dstCore.mailbox?.address,
  DESTINATION_WARP_ROUTER:route.destinationRouter,
  DESTINATION_ILN_ISM:dstCore.ism?.address,
  DESTINATION_AGGREGATION_MODULE_COUNT:"0",
  DESTINATION_AGGREGATION_INNER_INDEX:"0",
  DESTINATION_AGGREGATION_EMPTY_INDEXES:""
 };
 if(!Object.entries(values).every(([key,value])=>
  key.endsWith("_RPC_URL")?typeof value==="string"&&value.startsWith("https://"):
  /_MAILBOX$|_GATEWAY$|_REGISTRY$|_HOOK$|_ROUTER$|_ISM$/.test(key)?
    ADDRESS.test(value||""):typeof value==="string"))
  throw Error("Route missing safe canonical chain/RPC bindings");
 if(!HASH.test(route.routeId))throw Error("Invalid deployed route ID");
 return {route,messageId:messageId.toLowerCase(),destinationMailbox:dstCore.mailbox.address,
  destinationChainId:dst.chainId,env:values,
  baseRpcUrls:catalog.chains.base?.rpcUrls||[],
  sourceRpcUrls:src.rpcUrls||[],destinationRpcUrls:dst.rpcUrls||[]};
}
export function validateUnsignedRecovery(result,configured){
 if(!result||typeof result!=="object"||!["READY_UNSIGNED_CALL","PENDING","ALREADY_DELIVERED","FRESH_QUORUM_REQUIRED"].includes(result.status))
  throw Error("Unexpected canonical recover-iln result");
 if(!same(result.messageId,configured.messageId))throw Error("Recovery message mismatch");
 if(result.status==="READY_UNSIGNED_CALL"){
  if(!same(result.route,configured.env.ATTESTATION_ROUTE)||!same(result.to,configured.destinationMailbox)||
     BigInt(result.destinationChainId??0)!==BigInt(configured.destinationChainId)||
     result.value!=="0x0"||typeof result.data!=="string"||
     !/^0x[0-9a-f]{8}(?:[0-9a-f]{2})+$/i.test(result.data)||
     !result.data.toLowerCase().startsWith(processSelector.toLowerCase())||result.data.length>262144)
    throw Error("Unsigned destination calldata does not match approved Mailbox/process");
  return {status:result.status,messageId:configured.messageId,destinationChainId:configured.destinationChainId,
   destinationMailbox:configured.destinationMailbox,data:result.data,value:"0x0"};
 }
 return {status:result.status,messageId:configured.messageId,note:String(result.note||"").slice(0,500)};
}
export function parseRecoveryCliOutput(stdout,configured){
 const value=JSON.parse(stdout);
 return validateUnsignedRecovery(value,configured);
}
// Deliberately expose only stable, non-secret diagnostic classes to clients.
// The real parser/runtime failure is kept in the private systemd journal.
export function classifyRecoveryFailure(err,stderr=""){
 const raw=String(stderr||"").slice(-16000);
 let parsed=null;
 for(const line of raw.split(/\r?\n/)){
  if(!line.startsWith("XITA_RECOVERY_DIAGNOSTIC:"))continue;
  try {const value=JSON.parse(line.slice("XITA_RECOVERY_DIAGNOSTIC:".length));
   if(value?.status==="RECOVERY_NOT_READY")parsed=value;}catch{}
 }
 // Older CLI releases output pretty-printed JSON without the diagnostic tag.
 // Parse that whole record only when available, never with quote-truncating regex.
 if(!parsed&&raw.trimStart().startsWith("{")){
  try{const old=JSON.parse(raw.trim());if(old?.status==="RECOVERY_NOT_READY")parsed=old;}catch{}
 }
 const progress=raw.split(/\r?\n/).filter(line=>line.startsWith("XITA_RECOVERY_STAGE:")).at(-1)?.slice("XITA_RECOVERY_STAGE:".length).trim();
 const detail=String(parsed?.error||err?.message||"").slice(0,650);
 const lastStage=parsed?.stage||progress||"";
 const stage=/^[a-z][a-z0-9-]{1,54}$/.test(lastStage)?lastStage:"unknown";
 const rpcCode=Number.isInteger(parsed?.rpcCode)?parsed.rpcCode:null;
 const t=detail.toLowerCase();
 const code=err?.killed||/timed out|timeout/.test(t)?"PROOF_TIMEOUT":
  rpcCode===-32601?"PROOF_RPC_METHOD_UNAVAILABLE":
  rpcCode===-32602?"PROOF_RPC_ARGUMENT_INVALID":
  /missing [A-Z_]+|invalid [A-Z_]+|configuration/i.test(detail)?"PROOF_CONFIG_MISMATCH":
  /route is not configured or discovered locally/.test(t)?"PROOF_ROUTE_NOT_REGISTERED":
  /iln worker not available/.test(t)?"PROOF_VALIDATOR_WORKER_UNAVAILABLE":
  /request exists with a different source block/.test(t)?"PROOF_QUORUM_REQUEST_CONFLICT":
  /quorum|attestation|signature/.test(t)&&rpcCode!==-32603?"PROOF_QUORUM_UNAVAILABLE":
  rpcCode===-32603?"PROOF_VALIDATOR_RPC_REJECTED":
  /rpc|connection|network|request failed|not found|could not coalesce|transport failure/.test(t)?"PROOF_RPC_UNAVAILABLE":
  /snapshot|merkle|checkpoint|proof/.test(t)?"PROOF_RECONSTRUCTION_UNAVAILABLE":"PROOF_NOT_READY";
 return {code,stage,rpcCode,detail};
}
const recoveryBaseDefaultUrls=()=>process.env.XITA_RECOVERY_BASE_RPC_URLS||
 ["https://mainnet.base.org",process.env.XITA_BASE_ARCHIVE_RPC_URLS||""].filter(Boolean).join(",");
// Prefer Base mainnet for the current-state FeeVault reads used by XITA.
// Operators may override ordering privately; other approved catalog endpoints
// remain fallbacks. Never accept browser-supplied or per-token RPC URLs.
export function recoveryBaseUrls(configured,{baseUrls=recoveryBaseDefaultUrls()}={}){
 return rpcCandidates({chainId:8453,rpcUrls:configured.baseRpcUrls||[]},{baseUrls});
}
// Qualify the actual route, not an unrelated historical Base test block.
export async function probeRouteSourceRpc(url,configured,{fetcher=globalThis.fetch,ms=4500}={}){
 try{
  const call=(method,params)=>readPublicRpc(url,method,params,{fetcher,ms});
  const sourceIsBase=Number(configured.env.ORIGIN_CHAIN_ID)===8453;
  const expected=sourceIsBase?configured.env.ORIGIN_CHAIN_ID:
   configured.env.DESTINATION_CHAIN_ID;
  if(BigInt(await call("eth_chainId",[]))!==BigInt(expected))
   throw Error("Configured route RPC chain identity mismatch");
  const txHash=sourceIsBase?configured.env.SOURCE_TX_HASH:null;
  if(txHash){
   const receipt=await call("eth_getTransactionReceipt",[txHash]);
   if(!receipt||!same(receipt.transactionHash,txHash)||receipt.status!=="0x1")
    throw Error("Original source receipt unavailable");
   const block=receipt.blockNumber;
   if(!/^0x[0-9a-f]+$/i.test(block||""))throw Error("Source block missing");
   // The original receipt is only a locator. Full Gateway/Dispatch/Merkle
   // verification is performed by the recovery CLI, never skipped.
   // Avoid redundant archive-sensitive eth_getLogs preflight.
  }else if(!sourceIsBase){
   const value=await call("eth_call",[{
    to:configured.env.DESTINATION_MAILBOX,
    data:selector("delivered(bytes32)")+configured.messageId.slice(2)
   },"latest"]);
   if(!/^0x[0-9a-f]{64}$/i.test(value||"")||![0n,1n].includes(BigInt(value)))
    throw Error("Destination Mailbox unavailable");
  }else{
   const head=await call("eth_blockNumber",[]);
   if(!/^0x[0-9a-f]+$/i.test(head||""))throw Error("Source head unavailable");
  }
  return {ok:true};
 }catch(error){return {ok:false,error:String(error.message||error).slice(0,170)};}
}
const sourceBaseStages=new Set([
 "verify-chain-ids","source-receipt","validate-attestation",
 "confirmed-fee-vault-allocation","base-archive"
]);
const destinationBaseStages=new Set([
 "verify-chain-ids","destination-delivery","destination-ism-registry",
 "simulate-base-delivery","base-archive"
]);
// Only source/destination Base RPC failures can switch providers. Immutable
// route failures, invalid fees, Merkle proofs and BLS verification never do.
export function canRetryBaseRecovery(error,configured){
 if(error?.code!=="PROOF_RPC_UNAVAILABLE"&&error?.code!=="PROOF_TIMEOUT")return false;
 const sourceBase=Number(configured.env.ORIGIN_CHAIN_ID)===8453;
 const destinationBase=Number(configured.env.DESTINATION_CHAIN_ID)===8453;
 return (sourceBase&&sourceBaseStages.has(error.stage))||
  (destinationBase&&destinationBaseStages.has(error.stage));
}
async function runRecoveryAttempt(configured,timeoutMs){
 const script=resolve(root,"runtime/native-relayer/recover-iln.mjs");
 // Prefer validator-local ILN attestation/proof RPC over public RPC gateways.
 const localXGR=process.env.XITA_RECOVERY_XGR_RPC_URL||"http://127.0.0.1:8545";
 if(!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(localXGR))throw Error("Invalid loopback XGR recovery RPC configuration");
 return new Promise((yes,no)=>{
  execFile(process.execPath,[script,configured.messageId],{
   cwd:root,env:{PATH:process.env.PATH||"/usr/bin:/bin",HOME:process.env.HOME||"/tmp",
    NODE_ENV:"production",...configured.env,
     ATTESTATION_RPC_URL:localXGR,
     ...(Number(configured.env.DESTINATION_CHAIN_ID)===1643?{DESTINATION_RPC_URL:localXGR}:{}),
     ...(Number(configured.env.ORIGIN_CHAIN_ID)===1643?{ORIGIN_RPC_URL:localXGR}:{})},maxBuffer:750000,
    timeout:timeoutMs,windowsHide:true,
  },(err,stdout,stderr)=>{
   try{yes(parseRecoveryCliOutput(stdout,configured))}
   catch(e){
    const failure=classifyRecoveryFailure(err||e,stderr);
    console.warn("XITA unsigned recovery failed",JSON.stringify({
      route:configured.route.name,messageId:configured.messageId,
      reason:failure.code,stage:failure.stage,rpcCode:failure.rpcCode,
      detail:failure.detail
    }));
    no(Object.assign(new Error("Unsigned destination proof unavailable"),{
      code:failure.code,stage:failure.stage
    }));
   }
  });
 });
}
export async function runRecoveryProcess(configured,{timeoutMs=45000,
 archiveProbe=probeRouteSourceRpc,fetcher=globalThis.fetch,
 baseUrls=recoveryBaseDefaultUrls(),
 runAttempt=runRecoveryAttempt}={}){
 // Base historical RPC prequalification is applicable ONLY when Base is
 // either the source or destination. Other EVM routes must not depend on
 // Base availability merely because Base is in the global catalog.
 const needsBase=Number(configured.env.ORIGIN_CHAIN_ID)===8453||
  Number(configured.env.DESTINATION_CHAIN_ID)===8453;
 if(!needsBase)return runAttempt(configured,timeoutMs);
 const candidates=recoveryBaseUrls(configured,{baseUrls});
 const deadline=Date.now()+timeoutMs;
 let last=null;
 for(let i=0;i<candidates.length;i++){
  const url=candidates[i];
  try{
   // Two sequential chain/receipt probes can each take 3s. Do not start
   // another attempt too close to the browser's 48s maximum wait.
   if(deadline-Date.now()<9000)break;
   const qualified=await archiveProbe(url,configured,{fetcher,ms:3000});
   if(!qualified?.ok)continue;
   const env={...configured.env};
   if(Number(env.ORIGIN_CHAIN_ID)===8453)env.ORIGIN_RPC_URL=url;
   if(Number(env.DESTINATION_CHAIN_ID)===8453)env.DESTINATION_RPC_URL=url;
   const current={...configured,env};
   const remaining=deadline-Date.now()-2000;
   if(remaining<3000)break;
   // Reserve time for independent provider retries when a Base eth_call
   // stalls. Keep the complete operation inside the existing 45s budget.
   const attemptTimeout=i<candidates.length-1?Math.min(12000,remaining):remaining;
   return await runAttempt(current,attemptTimeout);
  }catch(error){
   last=error;
   if(!canRetryBaseRecovery(error,configured)||i===candidates.length-1)
    throw error;
   // Log hostname only: private operator URLs can contain API tokens.
   console.warn("XITA recovery Base failover",JSON.stringify({
    provider:new URL(url).hostname,reason:error.code,stage:error.stage
   }));
  }
 }
 throw last||Object.assign(new Error("Base historical RPC unavailable"),{
  code:"PROOF_RPC_UNAVAILABLE",stage:"base-archive"
 });
}
