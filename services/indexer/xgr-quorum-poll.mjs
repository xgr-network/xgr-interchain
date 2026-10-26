// Local XGRChain diagnostics only; no Base/Arbitrum RPC or source-chain work.
// Polling is not signing authorization. Full recovery still verifies all
// source receipts, active destination set, BLS quorum and Mailbox process.
import {recoveryXgrRpcUrl} from "./transfer-recovery.mjs";
const HASH=/^0x[0-9a-f]{64}$/i;
const STATES=new Set(["PENDING","PARTIAL_QUORUM","RETRYING_VALIDATION","NOT_FOUND","EXPIRED_RETRY","AVAILABLE_UNVERIFIED"]);
export async function pollLocalQuorum({route,messageId,url=recoveryXgrRpcUrl(),
 fetcher=globalThis.fetch,timeoutMs=4000}={}){
 if(!/^[a-z0-9_]{5,150}$/.test(route||"")||!HASH.test(messageId||""))
  throw Error("Invalid local quorum identity");
 if(!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(url)||typeof fetcher!=="function")
  throw Error("Invalid local quorum RPC");
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(url,{method:"POST",signal:controller.signal,
   headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method:"xgr_getILNQuorum",params:[route,messageId]})});
  if(!response.ok)throw Error("Local XGR quorum RPC unavailable");
  const payload=await response.json();
  if(payload?.error||!payload?.result||!STATES.has(payload.result.status)||
     payload.result.route!==route||
     payload.result.messageId?.toLowerCase()!==messageId.toLowerCase())
   throw Error("Invalid local quorum status");
  return payload.result.status;
 }finally{clearTimeout(timeout)}
}
export function quorumPollDecision(status,{lastFullCheckMs=0,now=Date.now()}={}){
 if(status==="AVAILABLE_UNVERIFIED")return "verify";
 if(status==="EXPIRED_RETRY"||status==="NOT_FOUND")
  return now-lastFullCheckMs>=120000?"verify":"wait";
 if(["PENDING","PARTIAL_QUORUM","RETRYING_VALIDATION"].includes(status))
  return now-lastFullCheckMs>=180000?"verify":"wait";
 return "verify";
}
