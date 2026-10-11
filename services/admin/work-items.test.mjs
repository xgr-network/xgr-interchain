import test from "node:test";import assert from "node:assert/strict";
import {approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {buildWorkItems} from "./work-items.mjs";
const root=new URL("../../",import.meta.url).pathname;
test("every unproven chain component and route has a blocked, explicit task",()=>{
 const inv=approvedWorkInventory(root),infra=infrastructureInventory(root,inv.chains);
 const tasks=buildWorkItems(inv,infra);
 const expectedChainTasks=infra.flatMap(chain=>chain.components
  .filter(part=>part.status!=="documented")
  .map(part=>chain.name+":"+part.key)).sort();
 const actualChainTasks=tasks.filter(t=>t.kind==="chain").map(t=>t.id).sort();
 assert.deepEqual(actualChainTasks,expectedChainTasks,
  "Only missing chain components belong in the blocked task queue");
 const expectedRouteTasks=Object.values(inv.assets).flatMap(asset=>asset.routes
  .filter(route=>route.status!=="deployed")
  .map(route=>asset.key+":"+route.name)).sort();
 assert.deepEqual(tasks.filter(t=>t.kind==="route").map(t=>t.id).sort(),expectedRouteTasks,
  "Only undeployed routes belong in the blocked task queue");
 assert.ok(tasks.every(t=>t.status==="blocked" && t.reason.length>15));
 assert.ok(tasks.every(t=>t.chain==="xgrchain"||inv.chains.some(c=>c.name===t.chain)));
 assert.ok(tasks.filter(t=>t.kind==="route").every(t=>inv.assets[t.asset].assetId===t.assetId));
});
