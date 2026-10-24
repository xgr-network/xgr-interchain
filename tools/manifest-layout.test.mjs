import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {loadCatalog,validateCatalog} from "./validate-manifests.mjs";
import {chainDeploymentPath,chainBootstrapPath,assetConfigFolder,assetDeploymentFolder,loadAssetDeployment} from "./manifest-layout.mjs";
const root=new URL("../",import.meta.url).pathname;
const XGR="0xa7585b8fbd074c1a7fa6df8b8e2e5ce73395ccbb64bf99b631c5da8ff2ac44e0";

test("Direct-BLS manifests reflect recorded deploy receipts, including fresh hard-reset state",()=>{
 const catalog=loadCatalog(root);
 for(const [name,chain] of Object.entries(catalog.chains)){
  const path=chainDeploymentPath(name);
  const present=existsSync(join(root,path));
  const observed=catalog.infrastructure[name];
  assert.equal(existsSync(join(root,chainBootstrapPath(name))),true);
  assert.equal(observed.present,present,"deployment presence follows recorded GitHub receipts: "+name);
  const index=observed.xitaV315;
  if(!present){
   assert.deepEqual(index.components,{});
   assert.deepEqual(index.receiptPaths,[]);
   continue;
  }
  // A freshly deployed chain must NOT fail because an old hard-reset
  // regression assumed every deployments/ directory would stay empty.
  const linked=[...new Set(Object.values(index.components).map(x=>x.receiptPath))].sort();
  assert.deepEqual(linked,[...index.receiptPaths].sort(),"receipt index mismatch: "+name);
  for(const [component,binding] of Object.entries(index.components)){
   const file=join(root,binding.receiptPath);
   assert.equal(existsSync(file),true,"missing durable receipt for "+name+":"+component);
   const receipt=JSON.parse(readFileSync(file,"utf8"));
   assert.equal(receipt.chain,name);
   assert.equal(receipt.chainId,chain.chainId);
   assert.equal(receipt.domainId,chain.domainId);
   assert.equal(receipt.component,component==="requiredHook"?"dispatchHook":component);
   assert.equal(receipt.address.toLowerCase(),binding.address.toLowerCase());
   assert.equal(receipt.runtimeCodeKeccak256.toLowerCase(),binding.runtimeCodeKeccak256.toLowerCase());
   assert.equal(receipt.status,"onchain-deployment-verified");
  }
 }
 for(const {deployment} of Object.values(catalog.assets)){
  // Representations and routes may be deployed after the infrastructure.
  // Never hard-code a permanently empty deployment inventory in tests.
  assert.equal(deployment.present,Boolean(deployment.representations.length||deployment.routeDeployments.length));
  for(const path of deployment.receiptPaths)
   assert.equal(existsSync(join(root,path)),true,"missing asset deployment receipt: "+path);
 }
 assert.deepEqual(validateCatalog(catalog),[]);
});
test("XGR source configuration and permissionless hub routes survive hard reset",()=>{
 const catalog=loadCatalog(root);
 assert.equal(assetConfigFolder("XGR",XGR),"config/assets/a7/XGR");
 assert.equal(assetDeploymentFolder("XGR",XGR),"deployments/assets/a7/XGR");
 const virtual=loadAssetDeployment(root,"XGR",XGR);
 assert.equal(virtual.present,Boolean(virtual.representations.length||virtual.routeDeployments.length));
 assert.equal(catalog.assets.XGR.routes.routes.length,6);
 assert.equal(catalog.assets.XGR.metadata.assetId,XGR);
});
