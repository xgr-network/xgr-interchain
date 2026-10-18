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

test("configured Tenderly Base HTTP 429 retries a chain-verified independent RPC",async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,opts)=>{
   const body=JSON.parse(opts.body);calls.push({url,method:body.method});
   if(url==="https://gateway.tenderly.co/public/base")return {ok:false,status:429};
   if(url==="https://mainnet.base.org")return {ok:true,json:async()=>({
    result:body.method==="eth_chainId"?"0x2105":"0x5208"})};
   throw Error("Unexpected endpoint "+url);
  };
  const value=await rpcCall("https://gateway.tenderly.co/public/base","eth_estimateGas",[{}]);
  assert.equal(value,"0x5208");
  assert.deepEqual(calls.map(x=>x.method),["eth_estimateGas","eth_chainId","eth_estimateGas"]);
 }finally{globalThis.fetch=original}
});
test("Tenderly JSON-RPC 429 quota error is transient but execution revert is not",async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,opts)=>{
   const body=JSON.parse(opts.body);calls.push({url,method:body.method});
   if(url==="https://base.gateway.tenderly.co")return {ok:true,json:async()=>({
    error:{code:-32005,message:"rate limit exceeded"}})};
   if(url==="https://mainnet.base.org")return {ok:true,json:async()=>({
    result:body.method==="eth_chainId"?"0x2105":"0x15"})};
   throw Error("Unexpected endpoint "+url);
  };
  assert.equal(await rpcCall("https://base.gateway.tenderly.co","eth_blockNumber"),"0x15");
  assert.equal(calls.length,3);
 }finally{globalThis.fetch=original}
});
test("Tenderly 429 fallback on wrong chain is blocked before any deployment simulation",async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,opts)=>{
   const body=JSON.parse(opts.body);calls.push({url,method:body.method});
   if(url==="https://gateway.tenderly.co/public/base")return {ok:false,status:429};
   return {ok:true,json:async()=>({result:"0x1"})};
  };
  await assert.rejects(()=>rpcCall("https://gateway.tenderly.co/public/base","eth_estimateGas",[{}]),/fallback chain ID/);
  assert.equal(calls.filter(x=>x.method==="eth_estimateGas").length,1);
 }finally{globalThis.fetch=original}
});
