// Only local XGRChain RPC: status polling and idempotent, untrusted ILN
// admission hints. The node reconstructs BOTH independent source witnesses
// before signing; the indexer is never a signing or receipt authority.
import {recoveryXgrRpcUrl} from "./transfer-recovery.mjs";
const HASH=/^0x[0-9a-f]{64}$/i;
const ROUTE=/^iln_[1-9][0-9]*_[1-9][0-9]*_[0-9a-f]{64}$/;
const LOOPBACK=/^http:\/\/127\.0\.0\.1:\d{2,5}$/;
const STATES=new Set(["PENDING","PARTIAL_QUORUM","RETRYING_VALIDATION","NOT_FOUND","EXPIRED_RETRY","AVAILABLE_UNVERIFIED"]);
const validHash=value=>HASH.test(value||"")&&!/^0x0{64}$/i.test(value);
async function callLocalXgr(method,params,{url,fetcher,timeoutMs}){
 if(!LOOPBACK.test(url)||typeof fetcher!=="function")
  throw Error("Invalid local XGR RPC");
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(url,{method:"POST",signal:controller.signal,
   headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
  if(!response.ok)throw Error("Local XGR quorum RPC unavailable");
  const payload=await response.json();
  if(payload?.error||!payload?.result)throw Error("Local XGR quorum RPC rejected");
  return payload.result;
 }finally{clearTimeout(timeout);}
}
export async function pollLocalQuorum({route,messageId,url=recoveryXgrRpcUrl(),
 fetcher=globalThis.fetch,timeoutMs=4000}={}){
 if(!ROUTE.test(route||"")||!validHash(messageId))
  throw Error("Invalid local quorum identity");
 const result=await callLocalXgr("xgr_getILNQuorum",[route,messageId],
  {url,fetcher,timeoutMs});
 if(!STATES.has(result.status)||result.route!==route||
    result.messageId?.toLowerCase()!==messageId.toLowerCase())
  throw Error("Invalid local quorum status");
 return result.status;
}
// Send only the canonical, already-indexed TX locator to the LOCAL validator.
// No chain read, new source transfer, signing payload or wallet transaction.
export async function requestIndexedQuorum({route,messageId,sourceBlock,sourceTxHash,
 url=recoveryXgrRpcUrl(),fetcher=globalThis.fetch,timeoutMs=4000}={}){
 if(!ROUTE.test(route||"")||!validHash(messageId)||!validHash(sourceTxHash)||
    !Number.isSafeInteger(sourceBlock)||sourceBlock<1)
  throw Error("Invalid indexed ILN quorum locator");
 const result=await callLocalXgr("xgr_requestILNQuorumWithSourceTx",
  [route,messageId,sourceBlock,sourceTxHash],{url,fetcher,timeoutMs});
 if(result.route!==route||result.messageId?.toLowerCase()!==messageId.toLowerCase()||
    result.sourceBlockNumber!==sourceBlock||result.status!=="PENDING")
  throw Error("Invalid local ILN quorum admission");
 return "PENDING";
}
export function quorumPollDecision(status,{lastFullCheckMs=0,now=Date.now()}={}){
 if(status==="AVAILABLE_UNVERIFIED")return "verify";
 if(status==="EXPIRED_RETRY"||status==="NOT_FOUND")
  return now-lastFullCheckMs>=120000?"verify":"wait";
 if(["PENDING","PARTIAL_QUORUM","RETRYING_VALIDATION"].includes(status))
  return now-lastFullCheckMs>=180000?"verify":"wait";
 return "verify";
}
