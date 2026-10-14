import test from "node:test";
import assert from "node:assert/strict";
import {rpcCall} from "./inspector.mjs";

test("Base 403 is retried on verified 8453 fallback, preserving receipt hash",async()=>{
 const original=globalThis.fetch,calls=[];
 const hash="0x"+"a".repeat(64);
 try{
  globalThis.fetch=async (url,opts)=>{
   const body=JSON.parse(opts.body);
   calls.push({url,method:body.method,params:body.params});
   if(url==="https://base-rpc.publicnode.com")return {ok:false,status:403};
   if(url==="https://mainnet.base.org")return {
    ok:true,json:async()=>({result:body.method==="eth_chainId"?"0x2105":{transactionHash:hash,status:"0x1"}})
   };
   throw Error("Unexpected URL");
  };
  const receipt=await rpcCall("https://base-rpc.publicnode.com","eth_getTransactionReceipt",[hash]);
  assert.equal(receipt.transactionHash,hash);
  assert.deepEqual(calls.map(x=>x.method),
   ["eth_getTransactionReceipt","eth_chainId","eth_getTransactionReceipt"]);
  assert.deepEqual(calls[2].params,[hash]);
 }finally{globalThis.fetch=original}
});
test("Base failover rejects wrong chain without querying transaction receipt",async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,opts)=>{
   const body=JSON.parse(opts.body);calls.push({url,method:body.method});
   if(url==="https://base-rpc.publicnode.com")return {ok:false,status:403};
   return {ok:true,json:async()=>({result:"0x1"})};
  };
  await assert.rejects(()=>rpcCall("https://base-rpc.publicnode.com","eth_getTransactionReceipt",["0x"+"b".repeat(64)]),/fallback chain ID/);
  assert.equal(calls.filter(x=>x.method==="eth_getTransactionReceipt").length,1);
 }finally{globalThis.fetch=original}
});
test("A JSON-RPC execution error is never silently bypassed",async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,opts)=>{
   calls.push(url);
   return {ok:true,json:async()=>({error:{message:"execution reverted"}})};
  };
  await assert.rejects(()=>rpcCall("https://base-rpc.publicnode.com","eth_call",[]),/execution reverted/);
  assert.equal(calls.length,1);
 }finally{globalThis.fetch=original}
});
