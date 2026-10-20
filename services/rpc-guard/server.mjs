#!/usr/bin/env node
// XITA v3.2.0 read-through Base RPC guard. Does not alter XGR-Node binaries,
// ILN consensus, signed payloads or the source chain's finality rule.
// Bind loopback only; deploy solely as an operator-configured upstream URL.
import {createServer} from "node:http";
import {pathToFileURL} from "node:url";

const READ_METHODS = new Set([
  "eth_chainId","eth_blockNumber","net_version","web3_clientVersion",
  "eth_call","eth_getLogs","eth_getBlockByNumber","eth_getBlockByHash",
  "eth_getTransactionReceipt","eth_getTransactionByHash","eth_getCode",
  "eth_getBalance","eth_getTransactionCount","eth_getStorageAt",
  "eth_getProof","eth_estimateGas","eth_gasPrice","eth_maxPriorityFeePerGas",
  "eth_feeHistory","eth_getBlockReceipts","eth_getBlockTransactionCountByNumber",
  "eth_getBlockTransactionCountByHash","eth_syncing","net_peerCount",
]);
const WRITE_METHOD = "eth_sendRawTransaction";
const HEX_BLOCK = /^0x[0-9a-f]+$/i;
const RATE_LIMIT_ERROR = /rate.limit|too many requests|quota exceeded|429|throttl/i;
const READ_CACHE_LIMIT = 768;
const MAX_BODY = 256 * 1024;
const MAX_RESPONSE = 4 * 1024 * 1024;

function positiveInteger(input, fallback, min, max, name) {
  const value = input === undefined || input === null || input === "" ?
    fallback : Number(input);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error("Invalid " + name + ": expected integer " + min + ".." + max);
  return value;
}
const jsonError = (code,message) => ({code,message});
function parseBlock(value) {
  if (typeof value !== "string" || !HEX_BLOCK.test(value)) return null;
  const n = Number(BigInt(value));
  return Number.isSafeInteger(n) ? n : null;
}
function isStableBlock(tag, head, confirmations) {
  const number = parseBlock(tag);
  return number !== null && head !== null && number <= head - confirmations;
}
function cacheTTL(method, params, result, head, confirmations) {
  if (result === null || result === undefined) return 0;
  if (method === "eth_chainId" || method === "net_version") return 24 * 3600_000;
  if (method === "eth_blockNumber") return 5000;
  if (method === "eth_call" || method === "eth_getCode" ||
      method === "eth_getBalance" || method === "eth_getStorageAt") {
    const tag = params[1];
    if (tag === "pending") return 0;
    return isStableBlock(tag,head,confirmations) ? 30 * 60_000 : 3000;
  }
  if (method === "eth_getLogs") {
    const filter=params[0]||{};
    if (filter && typeof filter==="object" && filter.blockHash) return 60_000;
    return isStableBlock(filter.toBlock,head,confirmations) ? 30 * 60_000 : 0;
  }
  if (method === "eth_getTransactionReceipt" ||
      method === "eth_getTransactionByHash") {
    return isStableBlock(result?.blockNumber,head,confirmations) ? 30 * 60_000 : 0;
  }
  if (method === "eth_getBlockByNumber" ||
      method === "eth_getBlockReceipts" ||
      method === "eth_getBlockTransactionCountByNumber") {
    return isStableBlock(params[0],head,confirmations) ? 30 * 60_000 : 0;
  }
  if (method === "eth_getBlockByHash") return 60_000;
  return 0; // fresh validator membership, nonce, gas and live fee state
}
const defaultSleep = ms => new Promise(resolve => setTimeout(resolve,ms));
export function createBaseRpcGuard({
  upstream="https://mainnet.base.org",
  fetcher=globalThis.fetch,
  now=Date.now,
  sleep=defaultSleep,
  rps=2,
  timeoutMs=14000,
  maxPending=96,
  confirmations=12,
}={}) {
  const parsed=new URL(upstream);
  if (!["https:","http:"].includes(parsed.protocol) ||
      parsed.username || parsed.password || parsed.hash)
    throw new Error("Base RPC upstream must be an operator-configured HTTP(S) URL");
  rps=positiveInteger(rps,2,1,10,"requests/second");
  timeoutMs=positiveInteger(timeoutMs,14000,1000,60000,"upstream timeout");
  maxPending=positiveInteger(maxPending,96,1,256,"max pending requests");
  confirmations=positiveInteger(confirmations,12,1,1024,"confirmations");
  const cache=new Map();
  const inflight=new Map();
  const metrics={upstreamRequests:0,cacheHits:0,cacheMisses:0,sharedRequests:0,
    rateLimits:0,errors:0,writes:0,lastSuccessUnix:0,lastErrorUnix:0};
  let tail=Promise.resolve();
  let queued=0;
  let nextSlot=0;
  let head=null;
  const minInterval=Math.ceil(1000/rps);

  function entry(key) {
    const cached=cache.get(key);
    if (!cached) return null;
    if (cached.expires<=now()) {cache.delete(key);return null}
    cache.delete(key);cache.set(key,cached); // bounded LRU
    metrics.cacheHits++;
    return cached.result;
  }
  function insert(key,result,ttl) {
    if (ttl<=0) return;
    const raw=JSON.stringify(result);
    if (raw.length>128*1024) return;
    cache.delete(key);
    cache.set(key,{result,expires:now()+ttl});
    while(cache.size>READ_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  async function remote(method,params,isWrite) {
    const attempts=isWrite?1:3;
    for(let attempt=0;attempt<attempts;attempt++) {
      // All outbound requests, including 429 retries, go through one lane.
      const wait=Math.max(0,nextSlot-now());
      if(wait) await sleep(wait);
      nextSlot=now()+minInterval;
      metrics.upstreamRequests++;
      let response;
      try{
        response=await fetcher(upstream,{
          method:"POST",
          headers:{"content-type":"application/json","accept":"application/json"},
          body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
          redirect:"error",
          signal:AbortSignal.timeout(timeoutMs),
        });
      }catch(err){
        metrics.errors++;metrics.lastErrorUnix=Math.floor(now()/1000);
        // Never repeat an externally broadcast signed transaction on timeout.
        throw jsonError(-32000,"Base RPC transport unavailable (no transaction retried)");
      }
      let parsedBody;
      let textBody="";
      try{
        textBody=await response.text();
        if(textBody.length>MAX_RESPONSE) throw Error("upstream payload exceeds bound");
        parsedBody=JSON.parse(textBody);
      }catch{
        // Public providers sometimes reply to 429 with plain text / HTML.
        // Treat the HTTP status as a retryable throttle regardless of body.
        if(response.status!==429){
          metrics.errors++;metrics.lastErrorUnix=Math.floor(now()/1000);
          throw jsonError(-32000,"Base RPC returned invalid or oversized JSON");
        }
      }
      const throttled=response.status===429 ||
        (parsedBody?.error && RATE_LIMIT_ERROR.test(
          String(parsedBody.error?.message||"")));
      if(throttled){
        metrics.rateLimits++;metrics.lastErrorUnix=Math.floor(now()/1000);
        if(attempt+1<attempts){
          const retryHeader=Number(response.headers?.get?.("retry-after"));
          const waitMs=Number.isFinite(retryHeader)&&retryHeader>0?
            Math.min(retryHeader*1000,8000):Math.min(1000*2**attempt,4000);
          await sleep(waitMs);continue;
        }
        throw jsonError(-32005,"Base RPC rate limited; safely deferred (no state assumed)");
      }
      if(!response.ok){
        metrics.errors++;metrics.lastErrorUnix=Math.floor(now()/1000);
        throw jsonError(-32000,"Base RPC HTTP "+response.status);
      }
      if(!parsedBody || typeof parsedBody!=="object" || Array.isArray(parsedBody) ||
          !("result" in parsedBody || "error" in parsedBody)){
        metrics.errors++;metrics.lastErrorUnix=Math.floor(now()/1000);
        throw jsonError(-32000,"Base RPC missing JSON-RPC result");
      }
      if(parsedBody.error){
        // Preserve upstream revert and nonce errors verbatim; never cache them.
        return {error:parsedBody.error};
      }
      metrics.lastSuccessUnix=Math.floor(now()/1000);
      if(method==="eth_blockNumber"){
        const n=parseBlock(parsedBody.result);
        if(n!==null)head=Math.max(head??0,n);
      }
      return {result:parsedBody.result};
    }
    throw jsonError(-32005,"Base RPC rate limit exhausted");
  }
  async function call(method,params) {
    const write=method===WRITE_METHOD;
    if(!write&&!READ_METHODS.has(method))
      throw jsonError(-32601,"Method unavailable on XITA Base RPC guard");
    if(!Array.isArray(params)) throw jsonError(-32602,"RPC params must be array");
    const key=write?null:JSON.stringify([method,params]);
    if(key!==null){
      const cached=entry(key);
      if(cached!==null)return {result:cached};
      if(inflight.has(key)){metrics.sharedRequests++;return inflight.get(key)}
      metrics.cacheMisses++;
    }
    if(queued>=maxPending)
      throw jsonError(-32005,"Base RPC request queue full; retry later");
    queued++;
    const predecessor=tail;
    let release;
    tail=new Promise(resolve=>{release=resolve});
    const task=(async()=>{
      try{
        await predecessor;
        if(write)metrics.writes++;
        const output=await remote(method,params,write);
        if(key!==null && "result" in output) {
          insert(key,output.result,cacheTTL(method,params,output.result,head,confirmations));
        }
        return output;
      }finally{
        queued--;release();
      }
    })();
    if(key!==null)inflight.set(key,task);
    try {return await task}finally{if(key!==null)inflight.delete(key)}
  }
  async function handle(request) {
    const id=request?.id??null;
    if(!request||Array.isArray(request)||request.jsonrpc!=="2.0"||
      (typeof request.id!=="number"&&typeof request.id!=="string")||
      typeof request.method!=="string")
      return {jsonrpc:"2.0",id,error:jsonError(-32600,"Invalid JSON-RPC request")};
    try{
      const out=await call(request.method,request.params??[]);
      return {jsonrpc:"2.0",id,...out};
    }catch(error) {
      return {jsonrpc:"2.0",id,
        error:typeof error.code==="number"?error:jsonError(-32000,
          "Base RPC guard internal error")};
    }
  }
  const snapshot=()=>({...metrics,queueDepth:queued,inflight:inflight.size,
    cacheEntries:cache.size,head,lastSuccessAgeSeconds:metrics.lastSuccessUnix?
      Math.max(0,Math.floor(now()/1000)-metrics.lastSuccessUnix):null});
  return {handle,snapshot};
}
export function createGuardServer({guard,host="127.0.0.1",port=4093}={}) {
  if(host!=="127.0.0.1")throw new Error("RPC guard must be bound to 127.0.0.1");
  const server=createServer(async(req,res)=>{
    const send=(status,data,contentType="application/json")=>{
      res.writeHead(status,{"content-type":contentType,"cache-control":"no-store",
        "x-content-type-options":"nosniff"});
      res.end(data);
    };
    if(req.method==="GET"&&req.url==="/health"){
      send(200,JSON.stringify({status:"running",...guard.snapshot()}));return;
    }
    if(req.method==="GET"&&req.url==="/metrics"){
      const m=guard.snapshot();
      const series=[
        ["xita_base_rpc_upstream_requests_total",m.upstreamRequests],
        ["xita_base_rpc_cache_hits_total",m.cacheHits],
        ["xita_base_rpc_cache_misses_total",m.cacheMisses],
        ["xita_base_rpc_rate_limits_total",m.rateLimits],
        ["xita_base_rpc_upstream_errors_total",m.errors],
        ["xita_base_rpc_queue_depth",m.queueDepth],
        ["xita_base_rpc_last_success_timestamp_seconds",m.lastSuccessUnix],
      ];
      send(200,series.map(([name,value])=>name+" "+value).join("\n")+"\n",
        "text/plain; version=0.0.4");return;
    }
    if(req.method!=="POST"||req.url!=="/"){
      send(404,JSON.stringify({error:"Not found"}));return;
    }
    try{
      const input=[];
      let length=0;
      for await(const chunk of req){
        length+=chunk.length;
        if(length>MAX_BODY)throw Error("oversized JSON-RPC request");
        input.push(chunk);
      }
      const request=JSON.parse(Buffer.concat(input).toString("utf8"));
      const result=Array.isArray(request)?
        (request.length>0&&request.length<=32?
          await Promise.all(request.map(guard.handle)):
          [{jsonrpc:"2.0",id:null,error:jsonError(-32600,"Invalid batch size")}]):
        await guard.handle(request);
      send(200,JSON.stringify(result));
    }catch {
      send(400,JSON.stringify({jsonrpc:"2.0",id:null,
        error:jsonError(-32700,"Invalid or oversized JSON-RPC payload")}));
    }
  });
  return {server,listen:()=>new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(port,host,()=>{server.off("error",reject);resolve(server.address())});
  })};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{
    const upstream=process.env.XITA_BASE_RPC_UPSTREAM||"https://mainnet.base.org";
    const guard=createBaseRpcGuard({
      upstream,
      rps:process.env.XITA_BASE_RPC_RPS||2,
      maxPending:process.env.XITA_BASE_RPC_MAX_PENDING||96,
      timeoutMs:process.env.XITA_BASE_RPC_TIMEOUT_MS||14000,
    });
    const server=createGuardServer({guard});
    await server.listen();
    console.log("XITA Base RPC guard listening at 127.0.0.1:4093 (upstream redacted)");
  }catch(error){
    console.error("XITA Base RPC guard cannot start:",error.message);
    process.exitCode=1;
  }
}
