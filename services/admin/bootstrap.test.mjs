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
  const cfg=config("config/chains/"+chain.name+"/bootstrap.json");
  assert.equal(plan.chain,chain.name);
  assert.equal(plan.chainId,chain.chainId);
  assert.equal(plan.domainId,chain.domainId);
  assert.deepEqual(plan.initialValidators,pinned);
  assert.equal(plan.expectedValidatorCount,pinned.length);
  assert.equal(plan.validatorCount,pinned.length);
  assert.equal(cfg.genesisValidatorManifest,"config/validators/initial.json");
  assert.equal(cfg.validatorSource,"explicit-interchain-genesis");
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
 assert.equal(items.filter(p=>p.kind==="route").length,inventory.routes.filter(r=>r.status!=="deployed").length);
 // A complete, syntactically valid manifest is not a cryptographic
 // verification or wallet authorization; those are separate live gates.
 assert.ok(items.every(p=>["blocked","documented"].includes(p.status)));
});

test("the original Interchain Genesis signer set stays pinned even before public proofs are loaded",()=>{
 const inventory=approvedWorkInventory(root);
 const chain=inventory.chains.find(c=>c.chainId===1643);
 assert.ok(chain);
 const plan=bootstrapPlan(root,chain);
 const manifest=config("config/chains/"+chain.name+"/bootstrap.json");
 const expected=config("config/validators/initial.json").validators;
 assert.equal(plan.validatorCount,expected.length);
 assert.deepEqual(plan.initialValidators,expected);
 assert.equal(manifest.validatorSnapshot.validators.length,0);
 assert.equal(manifest.validatorSnapshot.blockNumber,null);
 // No origin PoS snapshot is required to pin and plan initial membership.
});

test("XGRChain Registry and Factory batch never receive empty constructor economics",()=>{
 const inventory=approvedWorkInventory(root);
 const chain=inventory.chains.find(c=>c.chainId===1643);
 assert.ok(chain);
 const plan=bootstrapPlan(root,chain);
 const cfg=config("config/chains/xgrchain/bootstrap.json");
 assert.equal(plan.ready,true,"XGRChain must be configured before batch start");
 assert.deepEqual(plan.missing,[]);
 const {minimumWei,maxExecutorReimbursementWei,perValidatorWei}=cfg.reserve;
 const sourceFeeWei=cfg.sourceFee.targetWei;
 for(const v of [minimumWei,maxExecutorReimbursementWei,perValidatorWei,sourceFeeWei]){
  assert.match(v,/^[1-9][0-9]*$/,"No null/zero/float Wei values");
 }
 assert.ok(BigInt(perValidatorWei)>=BigInt(minimumWei));
 assert.ok(BigInt(minimumWei)>=BigInt(maxExecutorReimbursementWei));
 assert.equal(plan.proposedFeeWei,sourceFeeWei);
 assert.deepEqual(plan.initialValidators,config("config/validators/initial.json").validators);
});
