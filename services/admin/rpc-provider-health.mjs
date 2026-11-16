// Operator-level catalog RPC diagnostics. Read-only: no signing, no quorum requests.
// A responsive RPC and a native finality head are NOT sufficient Direct-BLS evidence.
const KNOWN_OPERATORS=Object.freeze({
 "bsc-rpc.publicnode.com":"PublicNode",
 "arbitrum-one-rpc.publicnode.com":"PublicNode",
 "base-rpc.publicnode.com":"PublicNode",
 "optimism-rpc.publicnode.com":"PublicNode",
 "bsc.drpc.org":"dRPC",
 "base.drpc.org":"dRPC",
 "arbitrum.drpc.org":"dRPC",
 "optimism.drpc.org":"dRPC",
 "bnb.api.onfinality.io":"OnFinality",
 "arb1.arbitrum.io":"Arbitrum official",
 "mainnet.base.org":"Base official",
 "mainnet.optimism.io":"Optimism official",
 "arbitrum.gateway.tenderly.co":"Tenderly",
 "gateway.tenderly.co":"Tenderly",
 "optimism.gateway.tenderly.co":"Tenderly",
 "rpc.xgr.network":"XGR RPC",
 "rpc2.xgr.network":"XGR RPC 2"
});
const cache=new Map();
const goodHash=/^0x[0-9a-f]{64}$/i;
const validHex=/^0x[0-9a-f]+$/i;
const validNumber=n=>Number.isSafeInteger(n)&&n>0;
const toNumber=v=>typeof v==="string"&&validHex.test(v)&&
 BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
export function finalityTag(chainId){
 return chainId===56?"finalized":chainId===1643?"latest":"safe";
}
export function approvedRPC(url){
 try{
  if(typeof url!=="string"||url.length>300)return null;
  const u=new URL(url);
  if(u.protocol!=="https:"||u.port||u.username||u.password||u.search||u.hash||!u.hostname||
     !/^[a-z0-9.-]+$/i.test(u.hostname))return null;
  return {url:u.href,host:u.hostname,operator:KNOWN_OPERATORS[u.hostname]||u.hostname};
 }catch{return null}
}
function category(e){
 const s=String(e?.message||"unavailable").slice(0,180);
 if(/^HTTP 429/.test(s))return {state:"rate-limited",reason:"HTTP 429 · Rate-Limit"};
 if(/timeout|abort/i.test(s))return {state:"unavailable",reason:"Timeout"};
 if(/^HTTP [0-9]{3}/.test(s))return {state:"unavailable",reason:s};
 if(s.includes("chainId"))return {state:"unavailable",reason:"Falsche Chain-ID"};
 if(/finality|finalized|safe|head|block/i.test(s))return {state:"unavailable",reason:"Native Finalität nicht verifizierbar: "+s};
 return {state:"unavailable",reason:s};
}
async function request(url,method,params,fetcher,timeoutMs){
 const response=await fetcher(url,{method:"POST",redirect:"error",cache:"no-store",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
  signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok)throw Error("HTTP "+response.status);
 const body=await response.json();
 if(body?.error)throw Error("RPC "+method+": "+String(body.error.message||body.error.code).slice(0,110));
 if(body?.jsonrpc!=="2.0"||body.id!==1||!Object.hasOwn(body,"result"))
  throw Error("Malformed JSON-RPC response");
 return body.result;
}
export async function probeProvider(provider,chainId,{fetcher=globalThis.fetch,timeoutMs=3500,now=Date.now()}={}){
 const tag=finalityTag(chainId);
 const row={operator:provider.operator,host:provider.host,url:provider.url,state:"unavailable",
  reason:null,chainId:null,finalityTag:tag,finalityHead:null,finalityHash:null,
  latestHead:null,lagBlocks:null,elapsedMs:null};
 const began=Date.now();
 try{
  const id=await request(provider.url,"eth_chainId",[],fetcher,timeoutMs);
  const got=toNumber(id);
  row.chainId=got;
  if(got!==chainId)throw Error("chainId mismatch");
  const f=await request(provider.url,"eth_getBlockByNumber",[tag,false],fetcher,timeoutMs);
  if(!f||!goodHash.test(f.hash||"")||!validNumber(toNumber(f.number)))
   throw Error("Native "+tag+" finality head invalid/unavailable");
  row.finalityHead=toNumber(f.number);row.finalityHash=f.hash;
  if(tag==="latest")row.latestHead=row.finalityHead;
  else{
   // A broken latest RPC must not invalidate a valid safe/finalized witness;
   // record the transport problem without declaring a fake lag.
   try{
    const latest=await request(provider.url,"eth_blockNumber",[],fetcher,timeoutMs);
    row.latestHead=toNumber(latest);
    if(validNumber(row.latestHead)&&row.latestHead>=row.finalityHead)
     row.lagBlocks=row.latestHead-row.finalityHead;
   }catch{/* latest-head unavailable; native finality is still evidence */}
  }
  row.state="ok";
 }catch(e){Object.assign(row,category(e))}
 row.elapsedMs=Math.max(0,Date.now()-began);
 return row;
}
export function summarizeProviders(name,chainId,rows){
 const ready=rows.filter(r=>r.state==="ok");
 const required=chainId===1643?1:2;
 const distinct=new Set(ready.map(r=>r.operator));
 // Operator names are catalog labels, NOT independently verified node policy,
 // and no source receipt/route/fee witness is established by this check.
 const potential=distinct.size;
 const state=rows.length===0?"unavailable":
  potential<required?"degraded":
  ready.length<rows.length?"warning":"ok";
 const height=ready.map(r=>r.finalityHead).filter(validNumber);
 return {name,chainId,configuredEndpoints:rows.length,attempted:rows.length,
  reachable:ready.length,possibleOperators:potential,requiredOperators:required,
  head:height.length?Math.max(...height):null,state,providers:rows,
  scope:"catalog-rpc-finality-only",sourceWitness:"not-checked",
  reason:state==="degraded"?"Weniger als "+required+" erreichbare unabhängige Katalog-Anbieter für native Finalität":
   state==="warning"?"Mindestens ein RPC-Anbieter ist gestört":"Native RPC-Finalität lesbar; kein historischer BLS-Quorumsbeleg"};
}
export async function probeChainProviders(chain,{
 fetcher=globalThis.fetch,timeoutMs=3500,now=Date.now(),cacheMs=90000
}={}){
 const name=String(chain?.name||"unknown").slice(0,80),chainId=Number(chain?.chainId);
 const providers=[...new Set(Array.isArray(chain?.rpcUrls)?chain.rpcUrls:[])].slice(0,6)
  .map(approvedRPC).filter(Boolean);
 if(!validNumber(chainId)||providers.length===0)
  return summarizeProviders(name,chainId,[]);
 const key=JSON.stringify([name,chainId,providers.map(x=>x.url)]);
 const canCache=fetcher===globalThis.fetch&&cacheMs>0;
 const held=canCache?cache.get(key):null;
 if(held&&held.expires>now)return held.promise;
 const promise=Promise.all(providers.map(p=>probeProvider(p,chainId,{fetcher,timeoutMs,now})))
  .then(rows=>summarizeProviders(name,chainId,rows));
 if(canCache){
  cache.set(key,{expires:now+cacheMs,promise});
  if(cache.size>40)cache.clear();
 }
 return promise;
}
