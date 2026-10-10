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
test("rejects fabricated planned chain security",()=>{const x=copy();x.infrastructure.polygon.ilnV314.sourceRegistry="0x"+"2".repeat(40);assert.ok(validateCatalog(x).some(s=>s.includes("pending infrastructure")))});
test("rejects duplicate domains",()=>{const x=copy();x.chains.base.domainId=1643;assert.ok(validateCatalog(x).some(s=>s.includes("duplicate chainId or domainId")))});
test("unverified asset has no deployment receipts",()=>{const x=copy();assert.deepEqual(x.assets.XGR.deployment.receiptPaths,[])});
test("rejects missing token profile logo",()=>{const c=copy();c.assets.XGR.profile.branding.logoUrl=null;assert.ok(validateCatalog(c).some(e=>e.includes("profile branding")))});
test("rejects unsafe public profile URL",()=>{const c=copy();c.assets.XGR.profile.links.website="javascript:alert(1)";assert.ok(validateCatalog(c).some(e=>e.includes("profile links")))});
test("rejects mismatched token profile",()=>{const c=copy();c.assets.XGR.profile.asset="OTHER";assert.ok(validateCatalog(c).some(e=>e.includes("public token profile")))});

test("reject public listing without GitHub-pinned transfer proof",()=>{const c=copy();c.assets.XGR.listing={schemaVersion:1,kind:"xita-asset-listing",asset:"XGR",status:"public",basis:"verified-transfer",publicProof:null};assert.ok(validateCatalog(c).some(x=>x.includes("publication evidence")))});

test("protocol hub XGR is accepted until a verified successful XITA bridge transfer",()=>{
 const c=copy();
 assert.equal(c.assets.XGR.listing.status,"accepted");
 assert.equal(c.assets.XGR.listing.basis,"protocol-hub");
 c.assets.XGR.listing.status="public";
 assert.ok(validateCatalog(c).some(x=>x.includes("publication evidence")));
});
test("a fabricated publication object cannot bypass the absent finality verifier",()=>{
 const c=copy();
 c.assets.XGR.listing.status="public";
 c.assets.XGR.listing.basis="verified-transfer";
 c.assets.XGR.listing.publicProof={txHash:"0x"+"f".repeat(64)};
 assert.ok(validateCatalog(c).some(x=>x.includes("publication evidence")));
});
