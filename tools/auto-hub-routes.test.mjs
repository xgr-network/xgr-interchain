import test from "node:test";
import assert from "node:assert/strict";
import {loadCatalog,validateCatalog} from "./validate-manifests.mjs";
import {deriveMissingHubRoutes} from "./auto-hub-routes.mjs";

function withoutOP(){
 const catalog=structuredClone(loadCatalog());
 for(const asset of Object.values(catalog.assets)){
  asset.metadata.representations=asset.metadata.representations.filter(x=>x.chain!=="optimism");
  asset.routes.routes=asset.routes.routes.filter(x=>x.sourceChain!=="optimism"&&x.destinationChain!=="optimism");
 }
 return catalog;
}
test("all approved current deployed spokes have reciprocal desired hub routes",()=>{
 assert.equal(deriveMissingHubRoutes(loadCatalog()).size,0);
});
test("repository evidence automatically proposes both OP directions for every existing hub asset",()=>{
 const catalog=withoutOP(),updates=deriveMissingHubRoutes(catalog);
 assert.deepEqual([...updates.keys()].sort(),["ARB","XGR"]);
 for(const [name,update] of updates){
  const op=update.metadata.representations.filter(x=>x.chain==="optimism");
  assert.deepEqual(op,[{chain:"optimism",representation:"synthetic",
   symbol:"w"+name,assetAddress:null}]);
  assert.deepEqual(update.routes.routes.filter(x=>x.sourceChain==="optimism"||x.destinationChain==="optimism").map(x=>x.name),
   ["xgr_to_optimism","optimism_to_xgr"]);
  assert.ok(update.routes.routes.every(x=>x.sourceChain==="xgrchain"||x.destinationChain==="xgrchain"));
  catalog.assets[name].metadata=update.metadata;
  catalog.assets[name].routes=update.routes;
 }
 assert.equal(deriveMissingHubRoutes(catalog).size,0);
 assert.deepEqual(validateCatalog(catalog),[]);
});
test("incomplete OP deployment or missing gateway never proposes signable routes",()=>{
 const catalog=withoutOP();
 delete catalog.infrastructure.optimism.xitaV315.components.executionGateway;
 assert.equal(deriveMissingHubRoutes(catalog).size,0);
});
test("idempotent discovery never changes deployed route receipts or canonical IDs",()=>{
 const catalog=withoutOP(),old=structuredClone(catalog.assets.XGR.deployment);
 const updates=deriveMissingHubRoutes(catalog);
 catalog.assets.XGR.metadata=updates.get("XGR").metadata;
 catalog.assets.XGR.routes=updates.get("XGR").routes;
 assert.deepEqual(catalog.assets.XGR.deployment,old);
 assert.equal(catalog.assets.XGR.metadata.assetId,old.assetId);
 assert.equal(catalog.assets.XGR.routes.routes.filter(x=>x.name==="xgr_to_optimism").length,1);
});
test("ambiguous route names and missing canonical collateral are not silently accepted",()=>{
 const conflicting=withoutOP();
 conflicting.assets.XGR.routes.routes.push({name:"xgr_to_optimism",sourceChain:"xgrchain",destinationChain:"base"});
 assert.throws(()=>deriveMissingHubRoutes(conflicting),/Conflicting asset route identity/);
 const origin=withoutOP();
 origin.assets.ARB.metadata.canonical.chain="optimism";
 assert.throws(()=>deriveMissingHubRoutes(origin),/Cannot invent canonical collateral/);
});
