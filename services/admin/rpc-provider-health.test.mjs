import test from "node:test";
import assert from "node:assert/strict";
import {observedChainProviders,approvedRPC,finalityTag,probeProvider,probeChainProviders,summarizeProviders,createRPCMonitor,RPC_RATE_LIMIT_PAUSE_MS,adminRPCSources} from "./rpc-provider-health.mjs";

const bsc={name:"bsc",chainId:56,rpcUrls:[
 "https://bsc-rpc.publicnode.com","https://bsc.drpc.org","https://bnb.api.onfinality.io/public"]};
const hex=x=>"0x"+x.toString(16);
function fakeFetcher({status=200,invalidFinalityHosts=[],rateLimitedHosts=[],sourceBlock=99}={}){
 const seen=[];
 const fetcher=async(url,options)=>{
  const host=new URL(url).host,body=JSON.parse(options.body);
  seen.push({host,method:body.method,params:body.params});
  if(rateLimitedHosts.includes(host))return {ok:false,status:429};
  let result=body.method==="eth_chainId"?"0x38":
   body.method==="eth_getBlockByNumber"?
    invalidFinalityHosts.includes(host)?null:{number:hex(sourceBlock),hash:"0x"+"a".repeat(64)}:
   body.method==="eth_blockNumber"?hex(sourceBlock+10):null;
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result})};
 };
 return {fetcher,seen};
}
test("catalog-only RPC URL validation; never forwards injected credentials",()=>{
 assert.equal(approvedRPC("https://bsc-rpc.publicnode.com").operator,"PublicNode");
 assert.equal(approvedRPC("https://bsc.drpc.org").operator,"dRPC");
 assert.equal(approvedRPC("https://bnb.api.onfinality.io/public").operator,"OnFinality");
 for(const bad of ["http://example.org","https://name:secret@bsc.drpc.org",
  "https://bsc.drpc.org/?token=secret","https://bsc.drpc.org/#x"])
  assert.equal(approvedRPC(bad),null);
});
test("each configured BSC provider is tested with native finalized head",async()=>{
 const {fetcher,seen}=fakeFetcher();
 const value=await probeChainProviders(bsc,{fetcher,cacheMs:0});
 assert.equal(value.providers.length,4);
 assert.equal(value.reachable,4);
 assert.equal(value.possibleOperators,4);
 assert.equal(value.state,"ok");
 assert.equal(value.sourceWitness,"not-checked");
 assert.equal(value.providers.every(v=>v.finalityTag==="finalized"),true);
 assert.equal(seen.filter(v=>v.method==="eth_getBlockByNumber").length,4);
 assert.equal(seen.filter(v=>v.method==="eth_getBlockByNumber")
  .every(v=>v.params[0]==="finalized"),true);
});
test("one working operator cannot claim healthy readiness",async()=>{
 const {fetcher}=fakeFetcher({invalidFinalityHosts:["bsc.drpc.org"],
  rateLimitedHosts:["bnb.api.onfinality.io"]});
 const v=await probeChainProviders(bsc,{fetcher,cacheMs:0});
 assert.equal(v.state,"warning");
 assert.equal(v.possibleOperators,2);
 assert.equal(v.providers[1].state,"unavailable");
 assert.equal(v.providers[2].state,"rate-limited");
});
test("different URLs from one operator cannot satisfy two-operator gate",()=>{
 const v=summarizeProviders("test",56,[{operator:"A",state:"ok",finalityHead:123},
  {operator:"A",state:"ok",finalityHead:123},{operator:"B",state:"unavailable"}]);
 assert.equal(v.possibleOperators,1);
 assert.equal(v.state,"degraded");
});
test("XGR latest is a chain-availability probe, not an independent source witness",()=>{
 assert.equal(finalityTag(1643),"latest");
 assert.equal(finalityTag(42161),"safe");
 const s=summarizeProviders("xgrchain",1643,[{operator:"XGR",state:"ok",finalityHead:12}]);
 assert.equal(s.state,"ok");
 assert.equal(s.sourceWitness,"not-checked");
});

test("production monitor reuses observations across UI refreshes",async()=>{
 let now=1_000_000;
 const {fetcher,seen}=fakeFetcher();
 const monitor=createRPCMonitor({fetcher,clock:()=>now,cacheMs:300000});
 const first=await monitor(bsc);
 assert.equal(first.providers.length,4);
 const count=seen.length;
 now+=30000;
 const second=await monitor(bsc);
 assert.equal(seen.length,count,"refresh must not call source RPC again");
 assert.deepEqual(first.providers,second.providers);
 now+=300001;
 await monitor(bsc);
 assert.ok(seen.length>count,"5-minute expiration permits fresh measurement");
});
test("HTTP 429 pauses every URL of the operator across chains without another call",async()=>{
 let now=1_000_000,calls=0;
 const fetcher=async(url,o)=>{
  calls++;
  const p=JSON.parse(o.body);
  if(new URL(url).host.endsWith("drpc.org"))
   return {ok:false,status:429,headers:{get:()=>null}};
  const result=p.method==="eth_chainId"?"0x38":
   p.method==="eth_getBlockByNumber"?{number:"0x60",hash:"0x"+"e".repeat(64)}:"0x60";
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result})};
 };
 const monitor=createRPCMonitor({fetcher,clock:()=>now,cacheMs:300000});
 const first=await monitor({name:"bsc",chainId:56,rpcUrls:["https://bsc.drpc.org"]});
 assert.equal(first.providers[0].state,"rate-limited");
 const count=calls;
 now+=2*60*1000;
 const second=await monitor({name:"bsc",chainId:56,rpcUrls:["https://bsc.drpc.org"]});
 assert.equal(second.providers[0].state,"rate-limited");
 assert.equal(calls,count);
 const differentChain=await monitor({name:"base",chainId:8453,rpcUrls:["https://base.drpc.org"]});
 assert.equal(differentChain.providers[0].state,"rate-limited");
 assert.equal(calls,count,"same operator on another chain must remain paused");
 now+=RPC_RATE_LIMIT_PAUSE_MS+1;
 await monitor({name:"bsc",chainId:56,rpcUrls:["https://bsc.drpc.org"]});
 assert.ok(calls>count);
});
test("simultaneous refreshes share the same source RPC requests",async()=>{
 const {fetcher,seen}=fakeFetcher();
 const monitor=createRPCMonitor({fetcher});
 await Promise.all([monitor(bsc),monitor(bsc),monitor(bsc)]);
 assert.equal(seen.filter(x=>x.method==="eth_chainId").length,4);
 assert.equal(seen.filter(x=>x.method==="eth_getBlockByNumber").length,4);
});
test("HTTP Retry-After is bounded and does not cause rapid retries",async()=>{
 let now=1_000_000,n=0;
 const monitor=createRPCMonitor({
  clock:()=>now,fetcher:async()=>{
   n++;return {ok:false,status:429,headers:{get:()=>String(600)}};},
  cacheMs:0
 });
 const v=await monitor({name:"bsc",chainId:56,rpcUrls:["https://bsc.drpc.org"]});
 assert.match(v.providers[0].retryAt,/Z$/);
 // The admin also checks the independent node-only 1RPC endpoint once.
 // Only the number of NEW requests after the cooldown starts matters.
 const count=n;
 now+=5*60*1000;
 await monitor({name:"bsc",chainId:56,rpcUrls:["https://bsc.drpc.org"]});
 assert.equal(n,count);
});

test("BSC admin shows the extra XGR v3.5.4 1RPC witness without altering catalog",async()=>{
 const original=[...bsc.rpcUrls],{fetcher,seen}=fakeFetcher();
 const entries=adminRPCSources(bsc);
 assert.equal(entries.length,4);
 assert.deepEqual(bsc.rpcUrls,original);
 assert.equal(entries[3].url,"https://public.1rpc.io/bnb");
 assert.equal(entries[3].source,"XGR node v3.5.4");
 assert.equal(entries[0].source,"XITA catalog");
 const actual=await probeChainProviders(bsc,{fetcher,cacheMs:0});
 assert.equal(actual.configuredEndpoints,4);
 assert.equal(actual.providers.find(p=>p.host==="public.1rpc.io").operator,"1RPC");
 assert.equal(actual.providers.find(p=>p.host==="public.1rpc.io").source,"XGR node v3.5.4");
 assert.equal(actual.sourceWitness,"not-checked");
 assert.equal(seen.filter(p=>p.host==="public.1rpc.io"&&p.method==="eth_getBlockByNumber").length,1);
 const dupe=adminRPCSources({...bsc,rpcUrls:[...bsc.rpcUrls,"https://public.1rpc.io/bnb"]});
 assert.equal(dupe.length,4);
 assert.equal(dupe[3].source,"XITA catalog");
 assert.deepEqual(adminRPCSources({name:"base",rpcUrls:["https://mainnet.base.org"]}),[
  {url:"https://mainnet.base.org",source:"XITA catalog"}
 ]);
});

test("1RPC quota error triggers operator cooldown without repeat requests",async()=>{
 let now=1_000_000,n=0;
 const monitor=createRPCMonitor({clock:()=>now,cacheMs:0,fetcher:async(_url,options)=>{
  n++;
  const body=JSON.parse(options.body);
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,
   ...(body.method==="eth_chainId"?{error:{code:-32001,message:"You've reached the usage limit for your current plan"}}:{result:null})})};
 }});
 const first=await monitor({name:"bsc",chainId:56,rpcUrls:["https://public.1rpc.io/bnb"]});
 assert.equal(first.providers.find(p=>p.operator==="1RPC").state,"rate-limited");
 assert.equal(first.providers.find(p=>p.operator==="1RPC").reason.includes("Pause bis"),true);
 const count=n;
 now+=5*60*1000;
 const second=await monitor({name:"bsc",chainId:56,rpcUrls:["https://public.1rpc.io/bnb"]});
 assert.equal(n,count,"quota exhaustion must not trigger repeat RPC probes");
 assert.equal(second.providers.find(p=>p.operator==="1RPC").state,"rate-limited");
});

test("XGR uses its existing status response only for the matching public endpoint",()=>{
 const now=1_800_000_000_000;
 const chain={name:"xgrchain",chainId:1643,rpcUrls:["https://rpc.xgr.network","https://rpc2.xgr.network"]};
 const validators=[
  {name:"Validator 1",workerAlive:false,rpcEndpoint:{
   url:"https://rpc.xgr.network/",state:"ok",observedUnix:now/1000}},
  {name:"Validator 2",workerAlive:true,rpcEndpoint:{
   url:"http://127.0.0.1:8545",state:"ok",observedUnix:now/1000}}
 ];
 const result=observedChainProviders(chain,validators,now);
 assert.equal(result.attempted,0);
 assert.deepEqual(result.providers.map(p=>p.state),["ok","unknown"]);
 assert.equal(result.providers[0].checkedAt,new Date(now).toISOString());
});

test("worker inventory adds unprobed receipt providers without expanding direct probes",()=>{
 const now=1_800_000_000_000;
 const validators=[{name:"Validator 1",workerAlive:true,rpcProviders:[
  {chainId:56,host:"receipt-only.example.org",operator:"receipt-operator",role:"receipt-witness",
   state:"ok",observedUnix:now/1000},
  {chainId:56,host:"pending.example.org",operator:"pending-operator",role:"receipt-witness",
   state:"unknown",observedUnix:0},
  {chainId:56,host:"bsc-rpc.publicnode.com",operator:"publicnode",role:"scanner",
   state:"unknown",observedUnix:0},
  {chainId:56,host:"example.org/path",operator:"invalid",role:"scanner"},
  {chainId:1,host:"wrong-chain.example.org",operator:"other",role:"scanner"},
 ]}];
 const result=observedChainProviders(bsc,validators,now);
 const rows=new Map(result.providers.map(row=>[row.host,row]));
 assert.equal(result.attempted,0);
 assert.equal(rows.size,adminRPCSources(bsc).length+2);
 assert.equal(rows.get("receipt-only.example.org").source,"XGR Node · Receipt-Prüfung");
 assert.equal(rows.get("receipt-only.example.org").state,"ok");
 assert.equal(rows.get("receipt-only.example.org").url,undefined);
 assert.equal(rows.get("pending.example.org").state,"unknown");
 assert.equal(rows.has("example.org/path"),false);
 assert.equal(rows.has("wrong-chain.example.org"),false);
 assert.equal(adminRPCSources(bsc).some(row=>row.url.includes("receipt-only.example.org")),false);
});
