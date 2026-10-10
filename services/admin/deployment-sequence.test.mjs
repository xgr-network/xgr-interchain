import test from "node:test";
import assert from "node:assert/strict";
import {approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
import {buildDeploymentPlan} from "./deployment-sequence.mjs";
const root=new URL("../../",import.meta.url).pathname;
test("all chains in GitHub configs get independent generic steps and format-specific verifier",()=>{
 const inventory=approvedWorkInventory(root);
 const infrastructure=infrastructureInventory(root,inventory.chains);
 const bootstrap=inventory.chains.map(c=>bootstrapPlan(root,c));
 const plan=buildDeploymentPlan(inventory,infrastructure,bootstrap);
 assert.equal(plan.mode,"preflight-only");
 assert.deepEqual(new Set(plan.chains.map(c=>c.name)),new Set(inventory.chains.map(c=>c.name)));
 const hub=plan.chains.find(c=>c.verifierFormat==="compressed");
 const eip=plan.chains.find(c=>c.verifierFormat==="eip2537");
 assert.equal(hub.steps[0].component,"nativeVerifier");
 assert.equal(eip.steps[0].component,"blsVerifier");
 assert.equal(plan.chains.find(c=>c.name==="base").initialFeeWei,"100000000000");
 assert.equal(plan.assets.find(a=>a.key==="XGR").routes.length,inventory.assets.XGR.routes.length);
 assert.ok(plan.chains.flatMap(c=>c.steps).every(s=>s.status!=="ready"));
});
test("unknown verifier format fails closed without chain-name exceptions",()=>{
 const inventory=approvedWorkInventory(root);
 const infrastructure=infrastructureInventory(root,inventory.chains);
 const bootstrap=inventory.chains.map(c=>bootstrapPlan(root,c));
 const bad={...inventory,chains:inventory.chains.map((c,i)=>i===0?{...c,blsVerifierFormat:"unknown"}:c)};
 assert.throws(()=>buildDeploymentPlan(bad,infrastructure,bootstrap),/Unsupported configured BLS verifier/);
});
