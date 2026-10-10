import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {approvedWorkInventory} from "./main-gate.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
import {buildWorkItems} from "./work-items.mjs";
import {infrastructureInventory} from "./chain-state.mjs";

const root=new URL("../../",import.meta.url).pathname;
const config=path=>JSON.parse(readFileSync(join(root,path),"utf8"));

test("every main-configured chain has independent bootstrap in every lifecycle stage",()=>{
 const inventory=approvedWorkInventory(root);
 const pinned=config("config/validators/initial.json").validators;
 const bootstraps=inventory.chains.map(c=>bootstrapPlan(root,c));
 assert.equal(bootstraps.length,inventory.chains.length);
 for(const [index,chain] of inventory.chains.entries()){
  const plan=bootstraps[index];
  const cfg=config("config/bootstrap/"+chain.name+".json");
  assert.equal(plan.chain,chain.name);
  assert.equal(plan.chainId,chain.chainId);
  assert.equal(plan.domainId,chain.domainId);
  assert.deepEqual(plan.initialValidators,pinned);
  assert.equal(plan.expectedValidatorCount,pinned.length);
  assert.equal(plan.validatorCount,cfg.validatorSnapshot.validators.length);
  assert.ok(plan.validatorCount===0||plan.validatorCount===pinned.length);
  assert.equal(plan.proposedFeeWei,cfg.sourceFee.targetWei);
  assert.equal(plan.feeInitialization,"factory-constructor-no-quorum");
  if(plan.ready){
   assert.equal(plan.validatorCount,pinned.length);
   assert.equal(plan.missing.length,0);
   assert.match(plan.reserveWei,/^[1-9][0-9]*$/);
  }else{
   assert.ok(plan.missing.length>0);
   assert.equal(plan.reserveWei,null);
  }
 }
 const items=buildWorkItems(inventory,infrastructureInventory(root,inventory.chains),bootstraps);
 assert.equal(items.filter(p=>p.kind==="validator-bootstrap").length,inventory.chains.length);
 assert.equal(items.filter(p=>p.kind==="fee-bootstrap").length,inventory.chains.length);
 assert.equal(items.filter(p=>p.kind==="route").length,inventory.routes.length);
 // A complete, syntactically valid manifest is not a cryptographic
 // verification or wallet authorization; those are separate live gates.
 assert.ok(items.every(p=>["blocked","documented"].includes(p.status)));
});

test("verified evidence may move a chain from 0/3 to 3/3 without changing the test suite",()=>{
 const inventory=approvedWorkInventory(root);
 const chain=inventory.chains.find(c=>c.chainId===1643);
 assert.ok(chain);
 const plan=bootstrapPlan(root,chain);
 const manifest=config("config/bootstrap/"+chain.name+".json");
 const count=manifest.validatorSnapshot.validators.length;
 assert.equal(plan.validatorCount,count);
 assert.equal(plan.expectedValidatorCount,config("config/validators/initial.json").validators.length);
 if(count===plan.expectedValidatorCount){
  assert.ok(manifest.validatorSnapshot.blockNumber>0);
  assert.deepEqual(manifest.validatorSnapshot.validators.map(v=>v.address),plan.initialValidators);
 }
});
