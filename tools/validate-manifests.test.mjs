import test from "node:test";
import assert from "node:assert/strict";
import {loadCatalog,validateCatalog} from "./validate-manifests.mjs";
const copy=()=>structuredClone(loadCatalog());
test("XETA four-chain XGR/wXGR plan validates",()=>assert.deepEqual(validateCatalog(copy()),[]));
test("six directed hub routes exist",()=>{const x=copy();assert.equal(x.assets.XGR.routes.routes.length,6)});
test("rejects missing reverse route",()=>{const x=copy();x.assets.XGR.routes.routes.pop();assert.ok(validateCatalog(x).some(s=>s.includes("missing reverse route")))});
test("rejects external-to-external direct routes",()=>{const x=copy(),r=x.assets.XGR.routes.routes[0];r.sourceChain="base";r.destinationChain="polygon";assert.ok(validateCatalog(x).some(s=>s.includes("direct external-to-external")))});
test("rejects phantom chain",()=>{const x=copy();x.assets.XGR.routes.routes[0].destinationChain="unknown";assert.ok(validateCatalog(x).some(s=>s.includes("invalid route endpoints")))});
test("asset deployment manifest is keyed by original asset ID",()=>{const x=copy();x.assets.XGR.deployment.assetId="0x"+"1".repeat(64);assert.ok(validateCatalog(x).some(s=>s.includes("canonical asset ID mismatch")))});
test("rejects legacy infrastructure metadata",()=>{
 const x=copy();x.infrastructure.polygon.ilnV314={status:"unverified-not-activated"};
 assert.ok(validateCatalog(x).some(s=>s.includes("legacy infrastructure block forbidden")));
});
test("legacy Hyperlane addresses cannot enter a fresh XITA deployment manifest",()=>{
 const x=copy();
 for(const [name,infra] of Object.entries(x.infrastructure)){
  assert.equal(Object.hasOwn(infra,"hyperlaneCore"),false,name+" contains historical transport addresses");
 }
 x.infrastructure.xgrchain.hyperlaneCore={mailbox:"0x"+"1".repeat(40)};
 assert.ok(validateCatalog(x).some(e=>e.includes("legacy infrastructure address fields forbidden")));
});
test("recorded XITA deployments are valid; unauthorized metadata or malformed bindings fail",()=>{
 const x=copy();
 assert.deepEqual(validateCatalog(x),[]);
 for(const inf of Object.values(x.infrastructure)){
  const index=inf.xitaV315;
  assert.equal(index.schemaVersion,1);
  for(const binding of Object.values(index.components)){
   assert.ok(index.receiptPaths.includes(binding.receiptPath));
   assert.match(binding.runtimeCodeKeccak256,/^0x[0-9a-f]{64}$/i);
  }
 }
 x.infrastructure.xgrchain.xitaV315.history={};
 assert.ok(validateCatalog(x).some(s=>s.includes("invalid XITA v3.1.5 deployment index")));
 const altered=copy();
 altered.infrastructure.xgrchain.xitaV315.components.badLegacyComponent={
  address:"0x"+"1".repeat(40),runtimeCodeKeccak256:"0x"+"2".repeat(64),
  receiptPath:"deployments/receipts/xgrchain/"+"3".repeat(64)+"-"+"1".repeat(40)+".json"
 };
 assert.ok(validateCatalog(altered).some(s=>s.includes("invalid component deployment binding")));
});
test("rejects duplicate domains",()=>{const x=copy();x.chains.base.domainId=1643;assert.ok(validateCatalog(x).some(s=>s.includes("duplicate chainId or domainId")))});
test("XGR deployment receipts stay tied to recorded contract bindings, without assumed deployment counts",()=>{
 const x=copy(),dep=x.assets.XGR.deployment;
 const referenced=[...dep.representations.map(r=>r.receiptPath),
 ...dep.routeDeployments.flatMap(r=>[r.components.gateway.receiptPath,r.components.feeVault.receiptPath])];
 assert.equal(referenced.every(p=>dep.receiptPaths.includes(p)),true);
});
test("rejects missing token profile logo",()=>{const c=copy();c.assets.XGR.profile.branding.logoUrl=null;assert.ok(validateCatalog(c).some(e=>e.includes("profile branding")))});
test("rejects unsafe public profile URL",()=>{const c=copy();c.assets.XGR.profile.links.website="javascript:alert(1)";assert.ok(validateCatalog(c).some(e=>e.includes("profile links")))});
test("rejects mismatched token profile",()=>{const c=copy();c.assets.XGR.profile.asset="OTHER";assert.ok(validateCatalog(c).some(e=>e.includes("public token profile")))});

test("legacy manual listing controls are rejected",()=>{const c=copy();c.assets.XGR.listing={status:"public"};assert.ok(validateCatalog(c).some(x=>x.includes("legacy listing state forbidden")))});
test("no public threshold is hardcoded in configuration",()=>{const c=copy();assert.equal(c.publication.minimumLockedUsd,null);c.publication.minimumLockedUsd=-1;assert.ok(validateCatalog(c).some(x=>x.includes("invalid publication policy")))});

test("collateral tokens must have an original ERC20 address in the asset catalog",()=>{
 const c=copy();
 const item=c.assets.XGR.metadata.representations.find(x=>x.chain==="base");
 const saved=item.representation;
 item.representation="collateral";
 item.assetAddress=null;
 assert.ok(validateCatalog(c).some(x=>x.includes("collateral original ERC20")));
 item.assetAddress="0x"+"a".repeat(40);
 assert.equal(validateCatalog(c).some(x=>x.includes("collateral original ERC20")),false);
 item.representation=saved;
});
