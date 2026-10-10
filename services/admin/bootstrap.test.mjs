import test from "node:test";import assert from "node:assert/strict";
import {approvedWorkInventory} from "./main-gate.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
import {buildWorkItems} from "./work-items.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
const root=new URL("../../",import.meta.url).pathname;
test("all four main-approved chains have fail-closed validator and fee bootstrap",()=>{
 const inventory=approvedWorkInventory(root),bootstrap=inventory.chains.map(c=>bootstrapPlan(root,c));
 assert.equal(bootstrap.length,4);
 assert.ok(bootstrap.every(p=>p.ready===false&&p.validatorCount===0&&p.proposedFeeWei===null));
 assert.ok(bootstrap.every(p=>p.missing.some(s=>s.includes("PoS-Validator-Snapshot"))));
 assert.equal(bootstrap.find(p=>p.chain==="xgrchain").verifierAddress,"0x0000000000000000000000000000000000002040");
 const items=buildWorkItems(inventory,infrastructureInventory(root,inventory.chains),bootstrap);
 assert.equal(items.filter(p=>p.kind==="validator-bootstrap").length,4);
 assert.equal(items.filter(p=>p.kind==="fee-bootstrap").length,4);
 assert.equal(items.filter(p=>p.kind==="route").length,6);
 assert.ok(items.every(p=>p.status==="blocked"));
});
