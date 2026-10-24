import test from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {join} from "node:path";
import {loadCatalog,validateCatalog} from "./validate-manifests.mjs";
import {chainDeploymentPath,chainBootstrapPath,assetConfigFolder,assetDeploymentFolder,loadAssetDeployment} from "./manifest-layout.mjs";
const root=new URL("../",import.meta.url).pathname;
const XGR="0xa7585b8fbd074c1a7fa6df8b8e2e5ce73395ccbb64bf99b631c5da8ff2ac44e0";

test("Direct-BLS hard reset starts with no deployed contracts or active routes",()=>{
 const names=["arbitrum","base","polygon","xgrchain"];
 const catalog=loadCatalog(root);
 assert.deepEqual(Object.keys(catalog.chains),names);
 for(const name of names) {
  assert.equal(existsSync(join(root,chainDeploymentPath(name))),false);
  assert.equal(existsSync(join(root,chainBootstrapPath(name))),true);
  assert.equal(catalog.infrastructure[name].present,false);
  assert.deepEqual(catalog.infrastructure[name].xitaV315.components,{});
  assert.deepEqual(catalog.infrastructure[name].xitaV315.receiptPaths,[]);
 }
 for(const {deployment} of Object.values(catalog.assets)){
  assert.deepEqual(deployment.representations,[]);
  assert.deepEqual(deployment.routeDeployments,[]);
  assert.deepEqual(deployment.receiptPaths,[]);
  assert.equal(deployment.present,false);
 }
 assert.deepEqual(validateCatalog(catalog),[]);
});
test("XGR source configuration and permissionless hub routes survive hard reset",()=>{
 const catalog=loadCatalog(root);
 assert.equal(assetConfigFolder("XGR",XGR),"config/assets/a7/XGR");
 assert.equal(assetDeploymentFolder("XGR",XGR),"deployments/assets/a7/XGR");
 const virtual=loadAssetDeployment(root,"XGR",XGR);
 assert.equal(virtual.present,false);
 assert.equal(catalog.assets.XGR.routes.routes.length,6);
 assert.equal(catalog.assets.XGR.metadata.assetId,XGR);
});
