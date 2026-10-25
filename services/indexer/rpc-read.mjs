// Public, same-origin, READ-ONLY EVM RPC transport. All upstream URLs come
// from the currently generated GitHub deployment catalog, not the HTTP body.
// Refuse arbitrary URLs, writes, broad log scans, and mismatched chain IDs.
const ALLOWED=new Set([
 "eth_chainId","eth_blockNumber","eth_gasPrice","eth_getBalance",
 "eth_getTransactionCount","eth_call","eth_getTransactionByHash",
 "eth_getTransactionReceipt","eth_getLogs","eth_getCode",
 "eth_getBlockByNumber"
]);
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const BLOCK=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const isObj=v=>!!v&&typeof v==="object"&&!Array.isArray(v);
const bad=message=>{const e=Error(message);e.httpStatus=400;throw e};
function endpointAllowed(url){
 try{
  const u=new URL(url);
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.hash&&
   /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(u.hostname)&&url.length<=420;
 }catch{return false}
}
function validateParams(method,params){
 if(!Array.isArray(params)||JSON.stringify(params).length>6500)
  bad("Invalid read-only RPC parameters");
 if(["eth_chainId","eth_blockNumber","eth_gasPrice"].includes(method))
  return params.length===0||bad("Unexpected RPC parameters");
 // Native-safe/finalized header reads are required by wallet recovery.
 // Never permit full transaction bodies or pending/uncanonical block tags.
 if(method==="eth_getBlockByNumber")
  return params.length===2&&params[1]===false&&
   (["latest","safe","finalized"].includes(params[0])||BLOCK.test(params[0]||""))||
   bad("Only canonical block-header reads are permitted");
 if(method==="eth_getBalance"||method==="eth_getTransactionCount")
  return params.length===2&&ADDRESS.test(params[0])&&
   ["latest","pending"].includes(params[1])||bad("Invalid account RPC parameters");
 if(method==="eth_getTransactionReceipt"||method==="eth_getTransactionByHash")
  return params.length===1&&HASH.test(params[0])||bad("Invalid transaction hash");
 if(method==="eth_getCode")
  return params.length===2&&ADDRESS.test(params[0])&&params[1]==="latest"||
   bad("Only latest-state contract code is readable");
 if(method==="eth_call"){
  const tx=params[0];
  return params.length===2&&isObj(tx)&&ADDRESS.test(tx.to)&&
   (tx.from===undefined||ADDRESS.test(tx.from))&&
   typeof tx.data==="string"&&/^0x(?:[0-9a-f]{2})*$/i.test(tx.data)&&
   tx.data.length<=4100&&
   (params[1]==="latest"||BLOCK.test(params[1]||""))||
   bad("Only bounded latest or block-pinned contract reads are permitted");
 }
 if(method==="eth_getLogs"){
  const filter=params[0];
  if(params.length!==1||!isObj(filter)||!ADDRESS.test(filter.address)||
     !BLOCK.test(filter.fromBlock)||!BLOCK.test(filter.toBlock)||
     BigInt(filter.toBlock)<BigInt(filter.fromBlock)||
     BigInt(filter.toBlock)-BigInt(filter.fromBlock)>255n||
     !Array.isArray(filter.topics)||filter.topics.length>4)
   bad("Only address-filtered, 256-block log windows are permitted");
  const validTopic=t=>t===null||HASH.test(t)||(Array.isArray(t)&&
   t.length<=8&&t.every(x=>x===null||HASH.test(x)));
  if(!filter.topics.every(validTopic))bad("Invalid log topic filter");
  return true;
 }
 bad("Unsupported read-only RPC method");
}
export function resolveCatalogRpcRead(catalog,request){
 if(!isObj(request)||Object.keys(request).length!==3||
   !["rpcUrl","method","params"].every(k=>Object.hasOwn(request,k))||
   typeof request.rpcUrl!=="string"||typeof request.method!=="string"||
   !ALLOWED.has(request.method)||!endpointAllowed(request.rpcUrl))
  bad("Read-only RPC method or catalog endpoint not permitted");
 validateParams(request.method,request.params);
 for(const chain of Object.values(catalog?.chains||{})){
  if(!Number.isSafeInteger(chain?.chainId)||chain.chainId<=0||
    !Array.isArray(chain.rpcUrls)||!chain.rpcUrls.includes(request.rpcUrl))continue;
  const urls=[request.rpcUrl,...chain.rpcUrls.filter(x=>x!==request.rpcUrl)]
   .filter(endpointAllowed).slice(0,4);
  if(!urls.length)bad("No approved chain RPC endpoint");
  return {chainId:chain.chainId,urls,method:request.method,params:request.params};
 }
 bad("RPC URL is not present in the documented chain catalog");
}
// Upstream failures are grouped by cause. Never log raw JSON-RPC params,
// wallet addresses, transaction hashes or provider credentials.
function rpcProblem(code){
 const error=Error(code);
 error.rpcReadCode=code;
 return error;
}
function diagnosticCode(error){
 if(typeof error?.rpcReadCode==="string"&&
    /^RPC_[A-Z0-9_]{3,64}$/.test(error.rpcReadCode))
  return error.rpcReadCode;
 const type=String(error?.name||"");
 const cause=String(error?.cause?.code||error?.code||"");
 if(type==="TimeoutError"||type==="AbortError"||
    /TIMEOUT|TIMED_OUT|ETIMEDOUT/.test(cause))return "RPC_UPSTREAM_TIMEOUT";
 if(cause==="ENOTFOUND"||cause==="EAI_AGAIN")return "RPC_UPSTREAM_DNS";
 if(cause==="ECONNREFUSED"||cause==="ECONNRESET"||
    cause==="UND_ERR_SOCKET")return "RPC_UPSTREAM_CONNECTION";
 if(type==="TypeError")return "RPC_UPSTREAM_NETWORK";
 return "RPC_UPSTREAM_UNEXPECTED";
}
async function rawRpc(url,method,params,fetcher){
 const response=await fetcher(url,{method:"POST",redirect:"error",
  headers:{"content-type":"application/json","accept":"application/json"},
  signal:AbortSignal.timeout(6000),
  body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 if(!response?.ok){
  const status=Number(response?.status);
  throw rpcProblem(Number.isInteger(status)&&status>=100&&status<=599?
   "RPC_UPSTREAM_HTTP_"+status:"RPC_UPSTREAM_HTTP_ERROR");
 }
 const content=await response.text();
 if(content.length>1500000)throw rpcProblem("RPC_UPSTREAM_RESPONSE_TOO_LARGE");
 let j;
 try{j=JSON.parse(content)}
 catch{throw rpcProblem("RPC_UPSTREAM_NOT_JSON")}
 if(!isObj(j)||j.jsonrpc!=="2.0"||j.id!==1||
   !Object.hasOwn(j,"result")||Object.hasOwn(j,"error"))
  throw rpcProblem(Object.hasOwn(j||{},"error")?
   "RPC_UPSTREAM_JSONRPC_ERROR":"RPC_UPSTREAM_INVALID_RESPONSE");
 return j.result;
}
// The XITA transfer page makes many concurrent same-chain balance, gas and
// route checks. Single-flight verification prevents a thundering herd of
// redundant eth_chainId requests, while retaining bounded periodic identity
// revalidation and fail-closed behavior on mismatches.
const identities=new WeakMap();
const IDENTITY_TTL_MS=15000;
function fetcherIdentityState(fetcher){
 let state=identities.get(fetcher);
 if(!state){
  state={verified:new Map(),pending:new Map()};
  identities.set(fetcher,state);
 }
 return state;
}
async function verifyUpstreamIdentity({url,chainId,fetcher,state}){
 const key=chainId+"|"+url,now=Date.now();
 const known=state.verified.get(key);
 if(known&&known.expiresAt>now)return known.id;
 const inFlight=state.pending.get(key);
 if(inFlight)return inFlight;
 const verify=(async()=>{
  const actualId=await rawRpc(url,"eth_chainId",[],fetcher);
  if(!BLOCK.test(actualId)||BigInt(actualId)!==BigInt(chainId))
   throw rpcProblem("RPC_UPSTREAM_CHAIN_MISMATCH");
  state.verified.set(key,{id:actualId,expiresAt:Date.now()+IDENTITY_TTL_MS});
  return actualId;
 })();
 state.pending.set(key,verify);
 try{return await verify}
 finally{if(state.pending.get(key)===verify)state.pending.delete(key)}
}
// Concurrency bound prevents an unauthenticated public client from exhausting
// a single-loopback read service; no write calls or secrets are forwarded.
let active=0;
export async function proxyCatalogRpcRead({catalog,request,fetcher=globalThis.fetch}){
 const spec=resolveCatalogRpcRead(catalog,request);
 if(typeof fetcher!=="function")throw rpcProblem("RPC_FETCH_UNAVAILABLE");
 if(active>=24)throw rpcProblem("RPC_CAPACITY_EXHAUSTED");
 active++;
 const state=fetcherIdentityState(fetcher);
 const attempts=[];
 try{
  for(let index=0;index<spec.urls.length;index++){
   const url=spec.urls[index],key=spec.chainId+"|"+url;
   let phase="identity";
   try{
    const id=await verifyUpstreamIdentity({url,chainId:spec.chainId,fetcher,state});
    if(spec.method==="eth_chainId")return id;
    phase="read";
    return await rawRpc(url,spec.method,spec.params,fetcher);
   }catch(error){
    state.verified.delete(key);
    attempts.push({endpoint:index+1,phase,code:diagnosticCode(error)});
    // Never trust a mismatched RPC, and never expose raw upstream data.
   }
  }
  const error=rpcProblem("RPC_ALL_ENDPOINTS_FAILED");
  error.chainId=spec.chainId;
  error.attempts=attempts;
  error.message="All catalog-approved chain RPCs failed";
  throw error;
 }finally{active--}
}
