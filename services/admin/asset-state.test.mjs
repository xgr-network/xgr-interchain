import test from "node:test";
import assert from "node:assert/strict";
import {buildAssetState,canonicalAssetId} from "./asset-state.mjs";
import {approvedWorkInventory,isHubHop} from "./main-gate.mjs";
const root=new URL("../../",import.meta.url).pathname;
test("native XGR has deterministic canonical asset ID",()=>{
 const inv=approvedWorkInventory(root),asset=inv.assets.XGR;
 assert.equal(asset.assetId,"0xa7585b8fbd074c1a7fa6df8b8e2e5ce73395ccbb64bf99b631c5da8ff2ac44e0");
 assert.equal(asset.assetId,canonicalAssetId({
  asset:"XGR",canonical:{chain:"xgrchain",representation:"native"}
 },Object.fromEntries(inv.chains.map(c=>[c.name,c]))));
});
test("all six XGR routes remain attached to ONE asset and one deployment index",()=>{
 const inv=approvedWorkInventory(root),asset=inv.assets.XGR;
 assert.equal(asset.routeCount,6);
 assert.equal(asset.deploymentManifest,"deployments/mainnet/assets/XGR.json");
 assert.equal(asset.status,"not-deployed");
 assert.equal(asset.receiptCount,0);
 assert.equal(asset.routes.every(r=>r.assetId===asset.assetId&&r.status==="not-deployed"),true);
 assert.equal(asset.routes.every(r=>isHubHop(inv.chains.find(c=>c.name===r.source),inv.chains.find(c=>c.name===r.destination))),true);
});
test("cannot silently treat existing config as evidence of a deployment",()=>{
 const inv=approvedWorkInventory(root);
 assert.equal(inv.assets.XGR.deployedRoutes,0);
 assert.equal(inv.routes.length,6);
 assert.equal(inv.assets.XGR.routes.every(r=>r.routeIds.length===0),true);
});
