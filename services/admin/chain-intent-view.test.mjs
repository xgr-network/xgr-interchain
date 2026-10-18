import test from "node:test";
import assert from "node:assert/strict";
import {chainDeploymentIntent,hasOutstandingWalletTransaction} from "./chain-intent-view.mjs";
const entry=(id,stage)=>({id,stage});
test("an empty journal does not crash the optional execution gateway modal",()=>{
 assert.equal(chainDeploymentIntent({intents:{version:1,entries:{}}},"base","executionGateway"),null);
 assert.equal(chainDeploymentIntent({},"base","executionGateway"),null);
});
test("only the same chain and component count as an existing wallet intent",()=>{
 const status={intents:{version:1,entries:{"xgrchain:executionGateway":entry("xgrchain:executionGateway","submitted"),"base:sourceRegistry":entry("base:sourceRegistry","submitted")}}};
 assert.equal(chainDeploymentIntent(status,"base","executionGateway"),null);
 assert.equal(chainDeploymentIntent(status,"xgrchain","executionGateway").stage,"submitted");
});
test("an actual submitted or confirmed hash blocks an accidental new sign",()=>{
 for(const stage of ["submitted","confirmed"]){
  const intent=chainDeploymentIntent({intents:{entries:{"base:executionGateway":entry("base:executionGateway",stage)}}},"base","executionGateway");
  assert.equal(hasOutstandingWalletTransaction(intent),true);
 }
 assert.equal(hasOutstandingWalletTransaction(entry("base:executionGateway","prepared")),false);
 assert.equal(hasOutstandingWalletTransaction(null),false);
});
