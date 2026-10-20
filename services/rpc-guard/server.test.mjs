import test from "node:test";
import assert from "node:assert/strict";
import {createBaseRpcGuard,createGuardServer} from "./server.mjs";

function harness({throttle=false}={}) {
 let clock=1_800_000_000_000;
 const calls=[];
 const fetcher=async(_,req)=>{
  const q=JSON.parse(req.body);calls.push(q);
  if(throttle&&calls.length===1)return {
   status:429,ok:false,headers:{get:()=>null},
   text:async()=>JSON.stringify({jsonrpc:"2.0",id:1,
    error:{code:-32005,message:"rate limit exceeded"}})
  };
  return {status:200,ok:true,headers:{get:()=>null},
   text:async()=>JSON.stringify({jsonrpc:"2.0",id:1,result:
    q.method==="eth_chainId"?"0x2105":
    q.method==="eth_blockNumber"?"0x100":
    q.method==="eth_call"?"0x"+"00".repeat(32):
    q.method==="eth_sendRawTransaction"?"0x"+"ab".repeat(32):"0x1"})};
 };
 const guard=createBaseRpcGuard({fetcher,now:()=>clock,
  sleep:async ms=>{clock+=ms},rps:2});
 return {guard,calls,setTime:x=>{clock=x}};
}
const request=(method,params=[],id=1)=>({jsonrpc:"2.0",id,method,params});
test("same validator RPC requests coalesce, refresh head and cache confirmed historical eth_call",async()=>{
 const h=harness();
 const a=await Promise.all(Array.from({length:12},(_,i)=>
  h.guard.handle(request("eth_chainId",[],i+1))));
 assert.equal(h.calls.length,1);
 assert.equal(a.length,12);
 assert.deepEqual(a.map(x=>x.id),Array.from({length:12},(_,i)=>i+1));
 assert.equal((await h.guard.handle(request("eth_blockNumber"))).result,"0x100");
 const params=[{to:"0x"+"11".repeat(20),data:"0xabcdef01"},"0x80"];
 await h.guard.handle(request("eth_call",params));
 await h.guard.handle(request("eth_call",params));
 assert.equal(h.calls.filter(x=>x.method==="eth_call").length,1);
 assert.ok(h.guard.snapshot().cacheHits>=1);
});
test("latest state must not be frozen longer than short TTL",async()=>{
 const h=harness();
 const params=[{to:"0x"+"11".repeat(20),data:"0xabcdef01"},"latest"];
 await h.guard.handle(request("eth_call",params));
 await h.guard.handle(request("eth_call",params));
 assert.equal(h.calls.length,1);
 h.setTime(1_800_000_010_000);
 await h.guard.handle(request("eth_call",params));
 assert.equal(h.calls.length,2);
});
test("429 retries safely, never caches an upstream error or unsupported method",async()=>{
 const h=harness({throttle:true});
 const a=await h.guard.handle(request("eth_chainId"));
 assert.equal(a.result,"0x2105");
 assert.equal(h.calls.length,2);
 assert.equal(h.guard.snapshot().rateLimits,1);
 const denied=await h.guard.handle(request("eth_accounts"));
 assert.equal(denied.error.code,-32601);
 assert.equal(h.calls.length,2);
});
test("broadcast transaction is never duplicated even when RPC returns 429",async()=>{
 let attempts=0;
 const guard=createBaseRpcGuard({
  fetcher:async()=>{attempts++;return {
   status:429,ok:false,headers:{get:()=>null},
   text:async()=>JSON.stringify({jsonrpc:"2.0",id:1,
    error:{code:-32005,message:"rate limit exceeded"}}),
  }},
  sleep:async()=>{},
 });
 const o=await guard.handle(request("eth_sendRawTransaction",["0xf00d"]));
 assert.equal(o.error.code,-32005);
 assert.equal(attempts,1);
});
test("HTTP listener stays on loopback and reports JSON-RPC status and Prometheus",async()=>{
 const {guard}=harness();
 assert.throws(()=>createGuardServer({guard,host:"0.0.0.0"}),/127.0.0.1/);
 const wrapper=createGuardServer({guard,port:0});
 const addr=await wrapper.listen();
 try{
  const base="http://127.0.0.1:"+addr.port;
  const result=await fetch(base,{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify(request("eth_chainId",[],55))});
  assert.equal((await result.json()).result,"0x2105");
  assert.match(await (await fetch(base+"/metrics")).text(),/xita_base_rpc_upstream_requests_total/);
  assert.equal((await (await fetch(base+"/health")).json()).lastSuccessAgeSeconds,0);
 }finally{await new Promise(resolve=>wrapper.server.close(resolve))}
});
