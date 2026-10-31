import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sourceFinalityHead,verifySourceFinalityReceipt} from "./source-finality.mjs";

const H="0x"+"1".repeat(64),BAD="0x"+"2".repeat(64);
const fake=(chainId=8453,{unsafe=false,mismatch=false}={})=>({
 calls:[],
 async send(method,args){
  this.calls.push([method,args]);
  if(method==="eth_chainId")return "0x"+chainId.toString(16);
  if(method==="eth_getBlockByNumber"){
   if(unsafe&&["safe","finalized"].includes(args[0]))throw Error("RPC native finality unsupported");
   return {number:"0x64",hash:H};
  }
  throw Error("Unexpected JSON-RPC method "+method);
 },
 async getBlock(n){return {number:n,hash:mismatch?BAD:H}}
});

test("OP, Base and Arbitrum require safe; XGRChain uses IBFT latest",async()=>{
 for(const id of [10,8453,42161]){
  const p=fake(id);
  assert.equal(await sourceFinalityHead(p,id),100);
  assert.deepEqual(p.calls.find(c=>c[0]==="eth_getBlockByNumber")[1],["safe",false]);
 }
 const b=fake(56);
 assert.equal(await sourceFinalityHead(b,56),100);
 assert.deepEqual(b.calls.find(c=>c[0]==="eth_getBlockByNumber")[1],["finalized",false]);
 const x=fake(1643);
 assert.equal(await sourceFinalityHead(x,1643),100);
 assert.deepEqual(x.calls.find(c=>c[0]==="eth_getBlockByNumber")[1],["latest",false]);
});

test("unsupported safe, noncanonical head, wrong chain ID and unknown chain fail closed",async()=>{
 await assert.rejects(sourceFinalityHead(fake(8453,{unsafe:true}),8453),/unsupported/);
 await assert.rejects(sourceFinalityHead(fake(56,{unsafe:true}),56),/unsupported/);
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

test("every approved chain has the same native finality in relayer as in GitHub catalog",async()=>{
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 for(const [name,config] of Object.entries(catalog.chains)){
  const provider=fake(config.chainId);
  assert.equal(await sourceFinalityHead(provider,config.chainId),100,name);
  const used=provider.calls.find(c=>c[0]==="eth_getBlockByNumber");
  const legacy={xgrchain:"latest",base:"safe",arbitrum:"safe"};
  const policy=config.receiptFinalityTag??legacy[name];
  assert.ok(policy,name+" must specify a reviewed finality policy");
  assert.equal(used?.[1]?.[0],policy,name+" finality policy mismatch");
 }
});
test("OP source receipt can be finalized by safe but never by a missing safe tag",async()=>{
 const receipt={status:1,blockNumber:90,blockHash:H};
 assert.equal(await verifySourceFinalityReceipt(fake(10),10,receipt),true);
 await assert.rejects(()=>verifySourceFinalityReceipt(fake(10,{unsafe:true}),10,receipt),/unsupported/);
});
