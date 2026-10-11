import test from "node:test";
import assert from "node:assert/strict";
import {awaitDeploymentReceipt} from "./deployment-poll.mjs";
test("transient pending receipts are recovered without new broadcast",async()=>{
 const stages=["receipt","receipt","confirmations","done"];
 let index=0,waits=0,pending=0;
 const answer=await awaitDeploymentReceipt(async()=>{
  const stage=stages[index++];
  return {result:stage==="done"?{stage:"documented",txHash:"0x"+"1".repeat(64)}:
   {stage:"pending",reason:stage}};
 },{attempts:6,sleep:async()=>{waits++},onPending:()=>{pending++}});
 assert.equal(answer.result.stage,"documented");
 assert.equal(waits,3);assert.equal(pending,3);
 assert.equal(index,4);
});
test("expiry remains pending, never asks to rebroadcast",async()=>{
 const result=await awaitDeploymentReceipt(async()=>({result:{stage:"pending"}}),{
  attempts:3,sleep:async()=>{}
 });
 assert.equal(result.result.stage,"pending");
});
test("hard reconcile errors propagate, never create another transaction",async()=>{
 await assert.rejects(()=>awaitDeploymentReceipt(
  async()=>{throw Error("Wrong signed transaction")}
 ),/Wrong signed transaction/);
});
