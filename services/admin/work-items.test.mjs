import test from "node:test";import assert from "node:assert/strict";
import {approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {buildWorkItems} from "./work-items.mjs";
const root=new URL("../../",import.meta.url).pathname;
test("every unproven chain component and route has a blocked, explicit task",()=>{
 const inv=approvedWorkInventory(root),infra=infrastructureInventory(root,inv.chains);
 const tasks=buildWorkItems(inv,infra);
 assert.equal(tasks.filter(t=>t.kind==="chain").length,infra.reduce((n,c)=>n+c.required,0));
 assert.equal(tasks.filter(t=>t.kind==="route").length,6);
 assert.ok(tasks.every(t=>t.status==="blocked" && t.reason.length>15));
 assert.ok(tasks.every(t=>t.chain==="xgrchain"||inv.chains.some(c=>c.name===t.chain)));
 assert.ok(tasks.filter(t=>t.kind==="route").every(t=>inv.assets[t.asset].assetId===t.assetId));
});
