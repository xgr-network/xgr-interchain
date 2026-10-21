import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {loadCatalog,validateCatalog} from "./validate-manifests.mjs";
import {chainDeploymentPath,chainBootstrapPath,assetConfigFolder,assetDeploymentFolder,loadAssetDeployment} from "./manifest-layout.mjs";
const root=new URL("../",import.meta.url).pathname;
const XGR="0xa7585b8fbd074c1a7fa6df8b8e2e5ce73395ccbb64bf99b631c5da8ff2ac44e0";
test("only receipt-verified chains have deployment files",()=>{
 const names=["arbitrum","base","polygon","xgrchain"];
 const catalog=loadCatalog(root);
 assert.deepEqual(Object.keys(catalog.chains),names);
 assert.deepEqual(readdirSync(join(root,"deployments/chains")).sort(),["arbitrum.json","base.json","xgrchain.json"]);
 for(const name of names){
  const file=chainDeploymentPath(name);
  assert.equal(existsSync(join(root,file)),name==="xgrchain"||name==="base"||name==="arbitrum");
  assert.equal(catalog.infrastructure[name].present,name==="xgrchain"||name==="base"||name==="arbitrum");
  assert.equal(existsSync(join(root,chainBootstrapPath(name))),true);
 }
 const registry=catalog.infrastructure.xgrchain.xitaV315.components.validatorRegistry;
 assert.equal(registry.address.toLowerCase(),"0x65a9473b0a7c5ec27127125c05fb4efc29efdba6");
 assert.equal(existsSync(join(root,registry.receiptPath)),true);
 const bootstrap=JSON.parse(readFileSync(join(root,chainBootstrapPath("xgrchain")),"utf8"));
 assert.equal(bootstrap.verifierAddress,"0x0000000000000000000000000000000000002040");
 assert.ok(Object.keys(catalog.infrastructure.xgrchain.xitaV315.components).length>=2);
 assert.equal(catalog.infrastructure.xgrchain.xitaV315.components.ism.address.toLowerCase(),"0x8c4585952a5960fe1238414eba409288aa4bb47a");
 assert.deepEqual(validateCatalog(catalog),[]);
});
test("XGR sharded config and two deployed directions share the same canonical index",()=>{
 const catalog=loadCatalog(root);
 assert.equal(assetConfigFolder("XGR",XGR),"config/assets/a7/XGR");
 assert.equal(assetDeploymentFolder("XGR",XGR),"deployments/assets/a7/XGR");
 assert.equal(existsSync(join(root,"config/assets/XGR")),false);
 const virtual=loadAssetDeployment(root,"XGR",XGR);
 assert.equal(existsSync(join(root,"deployments/assets/a7/XGR")),virtual.present);
 assert.equal(virtual.representations.every(r=>virtual.receiptPaths.includes(r.receiptPath)),true);
 assert.equal(virtual.routeDeployments.every(r=>r.receiptPaths.every(p=>virtual.receiptPaths.includes(p))),true);
 assert.equal(catalog.assets.XGR.routes.routes.length,6);
 assert.equal(Object.hasOwn(catalog.assets.XGR,"mainnet"),false);
});
