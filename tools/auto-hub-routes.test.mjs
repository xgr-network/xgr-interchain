import test from "node:test";
import assert from "node:assert/strict";
import {loadCatalog,validateCatalog} from "./validate-manifests.mjs";
import {deriveMissingHubRoutes} from "./auto-hub-routes.mjs";

function withoutSpoke(spoke){
 const catalog=structuredClone(loadCatalog());
 for(const asset of Object.values(catalog.assets)){
  asset.metadata.representations=asset.metadata.representations.filter(x=>x.chain!==spoke);
  asset.routes.routes=asset.routes.routes.filter(x=>x.sourceChain!==spoke&&x.destinationChain!==spoke);
 }
 return catalog;
}
test("all approved current deployed spokes have reciprocal desired hub routes",()=>{
 assert.equal(deriveMissingHubRoutes(loadCatalog()).size,0);
});
test("repository evidence automatically proposes both OP directions for every existing hub asset",()=>{
 const catalog=withoutSpoke("optimism"),updates=deriveMissingHubRoutes(catalog);
 assert.deepEqual([...updates.keys()].sort(),
  Object.keys(catalog.assets).filter(key=>
   catalog.assets[key].metadata.representations.some(rep=>rep.chain==="xgrchain")&&
   !(catalog.assets[key].metadata.creation?.kind==="xgrchain-creator-v1"&&
     catalog.assets[key].routes.routes.length===0)).sort());
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
 const catalog=withoutSpoke("optimism");
 delete catalog.infrastructure.optimism.xitaV315.components.executionGateway;
 assert.equal(deriveMissingHubRoutes(catalog).size,0);
});
test("idempotent discovery never changes deployed route receipts or canonical IDs",()=>{
 const catalog=withoutSpoke("optimism"),old=structuredClone(catalog.assets.XGR.deployment);
 const updates=deriveMissingHubRoutes(catalog);
 catalog.assets.XGR.metadata=updates.get("XGR").metadata;
 catalog.assets.XGR.routes=updates.get("XGR").routes;
 assert.deepEqual(catalog.assets.XGR.deployment,old);
 assert.equal(catalog.assets.XGR.metadata.assetId,old.assetId);
 assert.equal(catalog.assets.XGR.routes.routes.filter(x=>x.name==="xgr_to_optimism").length,1);
});
test("ambiguous route names and missing canonical collateral are not silently accepted",()=>{
 const conflicting=withoutSpoke("optimism");
 conflicting.assets.XGR.routes.routes.push({name:"xgr_to_optimism",sourceChain:"xgrchain",destinationChain:"base"});
 assert.throws(()=>deriveMissingHubRoutes(conflicting),/Conflicting asset route identity/);
 const origin=withoutSpoke("optimism");
 origin.assets.ARB.metadata.canonical.chain="optimism";
 assert.throws(()=>deriveMissingHubRoutes(origin),/Cannot invent canonical collateral/);
});

test("receipt-verified XGR Creator originals without any Join route remain route-free",()=>{
 const catalog=structuredClone(loadCatalog());
 const candidate=catalog.assets.XITACAN;
 assert.equal(candidate.metadata.creation.kind,"xgrchain-creator-v1");
 assert.deepEqual(candidate.metadata.representations.map(x=>x.chain),["xgrchain"]);
 assert.deepEqual(candidate.routes.routes,[]);
 assert.equal(deriveMissingHubRoutes(catalog).size,0);
 const unjoined=structuredClone(catalog);
 delete unjoined.assets.XITACAN.metadata.creation;
 assert.ok(deriveMissingHubRoutes(unjoined).has("XITACAN"));
});

test("the same automatic expansion covers ECDSA spokes and requires their verifier receipt",()=>{
 const catalog=withoutSpoke("xdc");
 const updates=deriveMissingHubRoutes(catalog);
 assert.deepEqual([...updates.keys()].sort(),["ARB","XGR"]);
 for(const {metadata,routes} of updates.values()){
  assert.ok(metadata.representations.some(rep=>rep.chain==="xdc"));
  assert.deepEqual(routes.routes.filter(r=>r.sourceChain==="xdc"||r.destinationChain==="xdc").map(r=>r.name),
   ["xgr_to_xdc","xdc_to_xgr"]);
 }
 const core=catalog.infrastructure.xdc.xitaV315;
 core.receiptPaths=core.receiptPaths.filter(path=>path!==core.components.ecdsaVerifier.receiptPath);
 assert.equal(deriveMissingHubRoutes(catalog).size,0);
});
