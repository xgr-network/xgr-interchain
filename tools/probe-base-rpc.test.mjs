import test from "node:test";import assert from "node:assert/strict";
import {probe} from "./probe-base-rpc.mjs";
const responder=(failure={})=>async (_url,args)=>{
 const {method}=JSON.parse(args.body);
 const result=method==="eth_chainId"?"0x2105":
 method==="eth_getBlockByNumber"?{hash:"0x"+"a".repeat(64)}:
 method==="eth_getLogs"?[]:"0x"+"0".repeat(64);
 const e=failure[method];
 return {ok:!e,status:e||200,json:async()=>e?
  {jsonrpc:"2.0",id:1,error:{code:-32602,message:"archive needs paid key"}}:
  {jsonrpc:"2.0",id:1,result}};
};
test("all four archive methods required",async()=>assert.equal(
 (await probe("https://provider.example",{fetcher:responder()})).ok,true));
test("403,429 archive errors fail closed",async()=>{for(const e of [403,429]){
 const v=await probe("https://provider.example",{fetcher:responder({eth_getLogs:e})});
 assert.equal(v.ok,false);assert.equal(v.historicalLogs,false);
}});
test("historic state is required, not merely old logs",async()=>{
 const v=await probe("https://provider.example",{fetcher:responder({eth_call:403})});
 assert.equal(v.historicalLogs,true);assert.equal(v.ok,false);
});
test("wrong chain fails before any historical call",async()=>{
 const v=await probe("https://provider.example",{fetcher:async()=>({ok:true,status:200,
 json:async()=>({jsonrpc:"2.0",id:1,result:"0x1"})})});
 assert.equal(v.ok,false);assert.equal(v.historicalBlock,false);
});
