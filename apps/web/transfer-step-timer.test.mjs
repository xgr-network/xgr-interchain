import test from "node:test";
import assert from "node:assert/strict";
import {transferStepStartedAt,formatTransferStepElapsed} from "./transfer-step-timer.js";
const account="0x"+"a".repeat(40),sourceTxHash="0x"+"b".repeat(64);
test("elapsed formatting covers seconds, minutes and hours",()=>{
 assert.equal(formatTransferStepElapsed(0),"00:00");
 assert.equal(formatTransferStepElapsed(125000),"02:05");
 assert.equal(formatTransferStepElapsed(3601000),"1:00:01");
});
test("step timer persists across new modal observations, resets only on step progression",()=>{
 const store=new Map(),storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
 const base={account,sourceTxHash,step:0,storage};
 assert.equal(transferStepStartedAt({...base,now:1700000000000}),1700000000000);
 assert.equal(transferStepStartedAt({...base,now:1700000012000}),1700000000000);
 assert.equal(transferStepStartedAt({...base,step:1,now:1700000012000}),1700000012000);
 assert.equal(transferStepStartedAt({...base,step:1,now:1700000018000}),1700000012000);
});
