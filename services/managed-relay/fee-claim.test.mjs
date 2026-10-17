import test from "node:test";
import assert from "node:assert/strict";
import {runClaimMonitor,claimAccruedFees} from "./fee-claim.mjs";

test("aggregate fee claim monitor checks periodically, with no per-message claims",async()=>{
 let polls=0,sleeps=0;
 await runClaimMonitor({intervalMs:60000,
  run:async()=>{polls++;return {status:"disabled"};},
  shouldStop:()=>polls>=3,
  sleep:async ms=>{assert.equal(ms,60000);sleeps++;}
 });
 assert.equal(polls,3);
 assert.equal(sleeps,2);
});
test("unbounded aggressive claim polling is prohibited",async()=>{
 await assert.rejects(()=>runClaimMonitor({
  intervalMs:1000,shouldStop:()=>true
 }),/Unsafe aggregate claim monitor interval/);
});
test("invalid claim threshold cannot incur a live transaction",async()=>{
 let touched=false;
 const provider={getNetwork:async()=>{touched=true;throw Error("must not fetch RPC")}};
 await assert.rejects(()=>claimAccruedFees({
  provider,signer:{address:"0x"+"1".repeat(40)},
  adapterAddress:"0x"+"2".repeat(40),
  expectedChainId:8453,minClaimWei:"0"
 }),/Invalid fee claim configuration/);
 assert.equal(touched,false);
});
