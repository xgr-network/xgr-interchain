import test from "node:test";
import assert from "node:assert/strict";
import {readCanonicalFinalizedHead} from "./chain-finality.mjs";

const HASH="0x"+"a".repeat(64);
const OTHER="0x"+"b".repeat(64);
const url="https://bsc-rpc.publicnode.com";
const rpc=(options={})=>async (_url,method,args)=>{
 assert.equal(_url,url);
 assert.equal(method,"eth_getBlockByNumber");
 if(args[0]==="finalized"){
  if(options.unsupported)throw Error("unsupported finalized tag");
  return {number:"0x20",hash:options.badHash?"invalid":HASH};
 }
 assert.equal(args[0],"0x20","numeric canonical re-read must match finalized head");
 return {number:options.wrongNumber?"0x21":"0x20",hash:options.reorg?OTHER:HASH};
};

test("BSC deployment evidence is bound to finalized head and a matching numeric block",async()=>{
 const observed=await readCanonicalFinalizedHead({rpc:rpc(),url});
 assert.deepEqual(observed,{number:32n,hash:HASH});
});
test("unsupported finalized tag fails closed without safe/latest fallback",async()=>{
 await assert.rejects(()=>readCanonicalFinalizedHead({rpc:rpc({unsupported:true}),url}),/unsupported finalized/);
});
test("malformed finalized head and canonical mismatch fail closed",async()=>{
 for(const options of [{badHash:true},{wrongNumber:true},{reorg:true}]){
  await assert.rejects(()=>readCanonicalFinalizedHead({rpc:rpc(options),url}),/Finalized head/);
 }
});
test("a finalized policy never accepts a non-HTTPS RPC",async()=>{
 await assert.rejects(()=>readCanonicalFinalizedHead({rpc:rpc(),url:"http://example.invalid"}),/Approved finalized RPC/);
});
