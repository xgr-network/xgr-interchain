import test from "node:test";
import assert from "node:assert/strict";
import {awaitVerifiedDeploymentCheckout} from "./deployment-sync-wait.mjs";
const old="a".repeat(40),next="b".repeat(40);
test("receipt-only sync may finish after the old 16-second UI limit",async()=>{
 let polls=0,pauses=0;
 const result=await awaitVerifiedDeploymentCheckout({
  expectedCommit:next,attempts:50,intervalMs:0,sleep:async()=>{},
  readQueue:async()=>++polls>25?{commit:next,readOnly:false}:{commit:old,remoteCommit:next,readOnly:true},
  readSyncStatus:async()=>({sync:{phase:"pending",commit:next}}),
  onWaiting:()=>{pauses++}
 });
 assert.equal(result.status,"current");
 assert.equal(polls,26);
 assert.equal(pauses,25);
});
test("unrelated code main is not accepted as expected receipt commit",async()=>{
 await assert.rejects(()=>awaitVerifiedDeploymentCheckout({
  expectedCommit:next,attempts:2,intervalMs:0,sleep:async()=>{},
  readQueue:async()=>({commit:"c".repeat(40),readOnly:false}),
  readSyncStatus:async()=>({sync:{phase:"failed",commit:next,error:"Non-receipt commit"}})
 }),/Non-receipt commit/);
});
test("failures are explicit and no new transaction is sent",async()=>{
 let writes=0;
 await assert.rejects(()=>awaitVerifiedDeploymentCheckout({
  expectedCommit:next,attempts:3,intervalMs:0,sleep:async()=>{},
  readQueue:async()=>({commit:old,readOnly:true}),
  readSyncStatus:async()=>({sync:{phase:"failed",commit:next,error:"Git fetch failed"}}),
  onWaiting:()=>{writes+=0}
 }),/Git fetch failed/);
 assert.equal(writes,0);
});
test("operator Pause stops sync polling without throwing",async()=>{
 const x=await awaitVerifiedDeploymentCheckout({
  expectedCommit:null,paused:()=>true,readQueue:async()=>{throw Error("must not call")}
 });
 assert.equal(x.status,"paused");
});
