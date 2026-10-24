import test from "node:test";
import assert from "node:assert/strict";
import {sourceFinalityHead,verifySourceFinalityReceipt} from "./source-finality.mjs";

const H="0x"+"1".repeat(64),BAD="0x"+"2".repeat(64);
const fake=(chainId=8453,{unsafe=false,mismatch=false}={})=>({
 calls:[],
 async send(method,args){
  this.calls.push([method,args]);
  if(method==="eth_chainId")return "0x"+chainId.toString(16);
  if(method==="eth_getBlockByNumber"){
   if(unsafe&&args[0]==="safe")throw Error("RPC safe unsupported");
   return {number:"0x64",hash:H};
  }
  throw Error("Unexpected JSON-RPC method "+method);
 },
 async getBlock(n){return {number:n,hash:mismatch?BAD:H}}
});

test("Base and Arbitrum require safe; XGRChain uses IBFT latest",async()=>{
 for(const id of [8453,42161]){
  const p=fake(id);
  assert.equal(await sourceFinalityHead(p,id),100);
  assert.deepEqual(p.calls.find(c=>c[0]==="eth_getBlockByNumber")[1],["safe",false]);
 }
 const x=fake(1643);
 assert.equal(await sourceFinalityHead(x,1643),100);
 assert.deepEqual(x.calls.find(c=>c[0]==="eth_getBlockByNumber")[1],["latest",false]);
});

test("unsupported safe, noncanonical head, wrong chain ID and unknown chain fail closed",async()=>{
 await assert.rejects(sourceFinalityHead(fake(8453,{unsafe:true}),8453),/unsupported/);
 await assert.rejects(sourceFinalityHead(fake(8453,{mismatch:true}),8453),/canonical/);
 await assert.rejects(sourceFinalityHead(fake(8453),42161),/chain ID/);
 await assert.rejects(sourceFinalityHead(fake(137),137),/Unsupported/);
});

test("original receipt must be canonical and inside source safe finality",async()=>{
 const r={status:1,blockNumber:90,blockHash:H};
 assert.equal(await verifySourceFinalityReceipt(fake(8453),8453,r),true);
 await assert.rejects(verifySourceFinalityReceipt(fake(8453),8453,{...r,blockNumber:101}),/not yet/);
 await assert.rejects(verifySourceFinalityReceipt(fake(8453),8453,{...r,blockHash:BAD}),/not canonical/);
 await assert.rejects(verifySourceFinalityReceipt(fake(8453),8453,{...r,status:0}),/Invalid/);
});
