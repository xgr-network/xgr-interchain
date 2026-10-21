// Read-only PUBLIC BLS proof collection from the XGR Node installed beside
// the *only* XITA Admin instance (validator 1). Validators 2 and 3 run NO
// XITA service; their signatures arrive over existing node-to-node P2P.
const ADDR=/^0x[0-9a-f]{40}$/i;
const LOCAL=/^http:\/\/127\.0\.0\.1:[0-9]{2,5}$/;
const MAX_BYTES=128*1024;

export async function collectLocalBootstrapProofs({
 chain,expectedValidators,originChainId=1643,
 rpcUrl=process.env.XITA_BOOTSTRAP_XGR_RPC||"http://127.0.0.1:8545",
 fetcher=globalThis.fetch,timeoutMs=3500
}){
 if(!chain||!Number.isSafeInteger(chain.domainId)||chain.domainId<1||
   chain.domainId>0xffffffff||originChainId!==1643||
   !Array.isArray(expectedValidators)||expectedValidators.length<3||
   expectedValidators.length>128||
   expectedValidators.some(v=>!ADDR.test(v))||
   new Set(expectedValidators.map(v=>v.toLowerCase())).size!==expectedValidators.length)
  throw Error("Invalid local bootstrap proof collection identity");
 if(!LOCAL.test(rpcUrl))throw Error("Bootstrap proof RPC must be validator-1 loopback only");
 if(typeof fetcher!=="function"||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)
  throw Error("Invalid bootstrap RPC timeout");
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 let result;
 try{
  const response=await fetcher(rpcUrl,{
   method:"POST",signal:controller.signal,cache:"no-store",redirect:"error",
   headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method:"xgr_getILNBootstrapProofs",
    params:[chain.domainId]})
  });
  if(!response.ok)throw Error("Local XGR bootstrap RPC returned HTTP "+response.status);
  if(Number(response.headers?.get?.("content-length")||0)>MAX_BYTES)
   throw Error("Oversized XGR bootstrap RPC response");
  const text=await response.text();
  if(text.length>MAX_BYTES)throw Error("Oversized XGR bootstrap RPC response");
  const body=JSON.parse(text);
  if(body.error)throw Error("Local XGR bootstrap RPC: "+
   String(body.error.message||"method unavailable").slice(0,160));
  result=body.result;
 }catch(error){
  throw Error("Local XGR bootstrap proofs unavailable: "+String(error.message||error).slice(0,160));
 }finally{clearTimeout(timer)}
 if(result?.originChainId!==originChainId||
   result.destinationDomain!==chain.domainId||!Array.isArray(result.proofs)||
   result.proofs.length>128)
  throw Error("Invalid XGR bootstrap proofs response identity");
 const byValidator=new Map();
 const allowed=new Set(expectedValidators.map(x=>x.toLowerCase()));
 for(const proof of result.proofs){
  const address=String(proof?.validator||"").toLowerCase();
  if(!allowed.has(address))continue;
  if(byValidator.has(address))throw Error("Duplicate P2P bootstrap validator proof");
  if(proof.originChainId!==originChainId||
     proof.destinationDomain!==chain.domainId||
     typeof proof.payload!=="string"||typeof proof.possessionProof!=="string")
   throw Error("P2P bootstrap proof has wrong origin or destination");
  byValidator.set(address,proof);
 }
 const missing=expectedValidators.filter(v=>!byValidator.has(v.toLowerCase()));
 if(missing.length)throw Error("P2P bootstrap proofs pending: "+
  byValidator.size+"/"+expectedValidators.length+
  " approved validators for domain "+chain.domainId);
 return expectedValidators.map(v=>byValidator.get(v.toLowerCase()));
}
