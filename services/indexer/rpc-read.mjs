// Public, same-origin, READ-ONLY EVM RPC transport. All upstream URLs come
// from the currently generated GitHub deployment catalog, not the HTTP body.
// Refuse arbitrary URLs, writes, broad log scans, and mismatched chain IDs.
const ALLOWED=new Set([
 "eth_chainId","eth_blockNumber","eth_gasPrice","eth_getBalance",
 "eth_getTransactionCount","eth_call","eth_getTransactionByHash",
 "eth_getTransactionReceipt","eth_getLogs"
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
 if(method==="eth_getBalance"||method==="eth_getTransactionCount")
  return params.length===2&&ADDRESS.test(params[0])&&
   ["latest","pending"].includes(params[1])||bad("Invalid account RPC parameters");
 if(method==="eth_getTransactionReceipt"||method==="eth_getTransactionByHash")
  return params.length===1&&HASH.test(params[0])||bad("Invalid transaction hash");
 if(method==="eth_call"){
  const tx=params[0];
  return params.length===2&&isObj(tx)&&ADDRESS.test(tx.to)&&
   (tx.from===undefined||ADDRESS.test(tx.from))&&
   typeof tx.data==="string"&&/^0x(?:[0-9a-f]{2})*$/i.test(tx.data)&&
   tx.data.length<=4100&&params[1]==="latest"||
   bad("Only bounded latest-state contract reads are permitted");
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
async function rawRpc(url,method,params,fetcher){
 const response=await fetcher(url,{method:"POST",redirect:"error",
  headers:{"content-type":"application/json","accept":"application/json"},
  signal:AbortSignal.timeout(6000),
  body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 if(!response?.ok)throw Error("Upstream chain RPC unavailable");
 const content=await response.text();
 if(content.length>1500000)throw Error("Upstream chain RPC response too large");
 const j=JSON.parse(content);
 if(!isObj(j)||j.jsonrpc!=="2.0"||j.id!==1||Object.hasOwn(j,"error")||
  !Object.hasOwn(j,"result"))throw Error("Invalid upstream chain RPC response");
 return j.result;
}
// Concurrency bound prevents an unauthenticated public client from exhausting
// a single-loopback read service; no write calls or secrets are forwarded.
let active=0;
export async function proxyCatalogRpcRead({catalog,request,fetcher=globalThis.fetch}){
 const spec=resolveCatalogRpcRead(catalog,request);
 if(typeof fetcher!=="function")throw Error("RPC fetch unavailable");
 if(active>=24)throw Error("Read-only RPC capacity exhausted");
 active++;
 try{
  for(const url of spec.urls){
   try{
    const actualId=await rawRpc(url,"eth_chainId",[],fetcher);
    if(!BLOCK.test(actualId)||BigInt(actualId)!==BigInt(spec.chainId))
     continue;
    if(spec.method==="eth_chainId")return actualId;
    return await rawRpc(url,spec.method,spec.params,fetcher);
   }catch{/* Try next approved endpoint; never trust a mismatched chain ID. */}
  }
  throw Error("All catalog-approved chain RPCs failed");
 }finally{active--}
}
