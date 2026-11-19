// Operator-level catalog RPC diagnostics. Read-only: no signing, no quorum requests.
// A responsive RPC and a native finality head are NOT sufficient Direct-BLS evidence.
const KNOWN_OPERATORS=Object.freeze({
 "bsc-rpc.publicnode.com":"PublicNode",
 "public.1rpc.io":"1RPC",
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
// Display-only supplement from the compiled XGRChain v3.5.4 BSC witness
// policy. Do not mutate apps/web/catalog.json: transfer routing, recovery and
// browser RPC allowlists must not change when adding an admin monitor row.
export const ADMIN_NODE_RPC_ENDPOINTS=Object.freeze({
 bsc:Object.freeze(["https://public.1rpc.io/bnb"])
});
export function adminRPCSources(chain){
 const catalog=Array.isArray(chain?.rpcUrls)?chain.rpcUrls:[];
 const node=ADMIN_NODE_RPC_ENDPOINTS[String(chain?.name||"")]||[];
 const merged=new Map();
 for(const url of catalog){
  if(!merged.has(url))merged.set(url,"XITA catalog");
 }
 for(const url of node){
  if(!merged.has(url))merged.set(url,"XGR node v3.5.4");
 }
 return [...merged].map(([url,source])=>({url,source}));
}
export const RPC_HEALTH_CACHE_MS=5*60*1000;
export const RPC_RATE_LIMIT_PAUSE_MS=30*60*1000;
const MAX_RETRY_AFTER_MS=60*60*1000;
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
 if(/^HTTP 429/.test(s))return {state:"rate-limited",reason:"HTTP 429 · Rate-Limit",
  retryAfterMs:Number.isFinite(e?.retryAfterMs)?e.retryAfterMs:null};
 if(/usage limit|current plan|quota exceeded|resource exhausted|daily limit|monthly limit/i.test(s))
  return {state:"rate-limited",reason:"RPC-Kontingent erschöpft"};
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
 if(!response.ok){
  const error=new Error("HTTP "+response.status);
  if(response.status===429){
   const raw=response.headers?.get?.("retry-after");
   if(typeof raw==="string"&&raw.length<100){
    const seconds=Number(raw);
    const wait=Number.isFinite(seconds)&&seconds>=0?seconds*1000:
     Date.parse(raw)-Date.now();
    if(Number.isFinite(wait)&&wait>0)error.retryAfterMs=Math.min(MAX_RETRY_AFTER_MS,wait);
   }
  }
  throw error;
 }
 const body=await response.json();
 if(body?.error)throw Error("RPC "+method+": "+String(body.error.message||body.error.code).slice(0,110));
 if(body?.jsonrpc!=="2.0"||body.id!==1||!Object.hasOwn(body,"result"))
  throw Error("Malformed JSON-RPC response");
 return body.result;
}
export async function probeProvider(provider,chainId,{fetcher=globalThis.fetch,timeoutMs=3500,now=Date.now()}={}){
 const tag=finalityTag(chainId);
 const row={operator:provider.operator,host:provider.host,url:provider.url,
  source:provider.source||"XITA catalog",state:"unavailable",
  reason:null,chainId:null,finalityTag:tag,finalityHead:null,finalityHash:null,
  latestHead:null,lagBlocks:null,elapsedMs:null,
  checkedAt:new Date(now).toISOString(),retryAt:null};
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
  // Do not issue a third eth_blockNumber call for a cosmetic lag metric.
  // The chain-native finality head is the health signal used here.
  if(tag==="latest")row.latestHead=row.finalityHead;
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
function pausedProvider(provider,chainId,hold,previous){
 return {operator:provider.operator,host:provider.host,url:provider.url,
  source:provider.source||"XITA catalog",state:"rate-limited",reason:"Betreiber wegen HTTP 429 pausiert (keine neue Anfrage)",
  chainId:null,finalityTag:finalityTag(chainId),finalityHead:null,
  finalityHash:null,latestHead:null,lagBlocks:null,elapsedMs:null,
  checkedAt:previous?.checkedAt??null,retryAt:new Date(hold.until).toISOString()};
}

// One backend-wide monitor. Browser refreshes receive cached observations.
// A 429 cools down *all configured endpoints of that operator*.
// Requests are serialized per operator across chains to avoid burst traffic.
export function createRPCMonitor({
 fetcher=globalThis.fetch,clock=()=>Date.now(),timeoutMs=3500,
 cacheMs=RPC_HEALTH_CACHE_MS,rateLimitMs=RPC_RATE_LIMIT_PAUSE_MS
}={}){
 if(typeof fetcher!=="function"||typeof clock!=="function"||
    !Number.isFinite(cacheMs)||cacheMs<0||!Number.isFinite(rateLimitMs)||rateLimitMs<0)
  throw Error("Invalid RPC monitor options");
 const byEndpoint=new Map(),byOperator=new Map(),operatorQueue=new Map();
 async function observe(provider,chainId){
  const key=chainId+"|"+provider.url;
  const now=clock();
  const cached=byEndpoint.get(key),cool=byOperator.get(provider.operator);
  if(cool&&now<cool.until&&cached?.row?.state!=="rate-limited")
   return pausedProvider(provider,chainId,cool,cached?.row);
  if(cached&&cached.expires>now)return cached.promise;

  const previous=operatorQueue.get(provider.operator)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   const tick=clock(),hold=byOperator.get(provider.operator);
   if(hold&&hold.until>tick)
    return pausedProvider(provider,chainId,hold,byEndpoint.get(key)?.row);
   const row=await probeProvider(provider,chainId,{fetcher,timeoutMs,now:tick});
   if(row.state==="rate-limited"){
    const prev=byOperator.get(provider.operator);
    const strikes=Math.min(3,(prev?.strikes||0)+1);
    const delay=Math.max(rateLimitMs*Math.min(strikes,2),row.retryAfterMs||0);
    const until=clock()+Math.min(MAX_RETRY_AFTER_MS,delay);
    byOperator.set(provider.operator,{until,strikes});
    row.retryAt=new Date(until).toISOString();
    row.reason=(row.reason||"RPC Rate-Limit")+"; Pause bis "+row.retryAt;
   }else if(row.state==="ok"&&
            byOperator.get(provider.operator)?.until<=clock()){
    byOperator.delete(provider.operator);
   }
   const expires=clock()+(row.state==="rate-limited"?
    Math.min(MAX_RETRY_AFTER_MS,Math.max(rateLimitMs,row.retryAfterMs||0)):cacheMs);
   byEndpoint.set(key,{expires,promise:Promise.resolve(row),row});
   return row;
  });
  const settled=task.catch(()=>{});
  operatorQueue.set(provider.operator,settled);
  // Coalesce concurrent identical calls. Pending probe always expires
  // after the bounded RPC request, not at the next UI refresh.
  byEndpoint.set(key,{expires:now+Math.max(1000,timeoutMs*3),
   promise:task,row:cached?.row??null});
  try{return await task}finally{
   if(operatorQueue.get(provider.operator)===settled)
    operatorQueue.delete(provider.operator);
  }
 }
 return async function probeChain(chain){
  const name=String(chain?.name||"unknown").slice(0,80),chainId=Number(chain?.chainId);
  const providers=adminRPCSources(chain).slice(0,6).map(item=>{
   const approved=approvedRPC(item.url);
   return approved?{...approved,source:item.source}:null;
  }).filter(Boolean);
  if(!validNumber(chainId)||!providers.length)
   return summarizeProviders(name,chainId,[]);
  const rows=await Promise.all(providers.map(p=>observe(p,chainId)));
  return summarizeProviders(name,chainId,rows);
 };
}
const defaultMonitor=createRPCMonitor();
export async function probeChainProviders(chain,options={}){
 // Dependency-injected instances are intentionally isolated from global
 // production state for deterministic tests and custom read-only probes.
 if(Object.keys(options).length===0)return defaultMonitor(chain);
 const {fetcher=globalThis.fetch,timeoutMs=3500,now=Date.now(),
  cacheMs=RPC_HEALTH_CACHE_MS}=options;
 if(fetcher===globalThis.fetch&&timeoutMs===3500&&cacheMs===RPC_HEALTH_CACHE_MS)
  return defaultMonitor(chain);
 return createRPCMonitor({fetcher,timeoutMs,cacheMs,
  clock:()=>now})(chain);
}
