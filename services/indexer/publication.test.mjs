import test from "node:test";
import assert from "node:assert/strict";
import {derivedVisibility} from "./publication.mjs";
import {deployedFixture} from "../../apps/web/deployed-test-fixture.mjs";
const NOW=Date.parse("2026-10-11T12:00:00Z");
const good=(lockedUsd,asset="ABC")=>({assetId:deployedFixture(asset).metadata.assetId,
 lockedUsd:String(lockedUsd),verified:true,complete:true,valuationVerified:true,
 proofDigest:"0x"+"a".repeat(64),asOf:new Date(NOW-30000).toISOString()});
const catalog=minimum=>({
 publication:{schemaVersion:1,kind:"xita-publication-policy",minimumLockedUsd:minimum,maxEvidenceAgeSeconds:900},
 assets:{ABC:deployedFixture("ABC")}
});
const status=(minimum,row)=>derivedVisibility(catalog(minimum),{ABC:row},{now:NOW}).assets.ABC.status;
test("publication threshold is NOT selected in GitHub yet",()=>{
 const out=derivedVisibility(catalog(null),{ABC:good(1000000)},{now:NOW});
 assert.equal(out.minimumLockedUsd,null);
 assert.equal(out.status,"threshold-unconfigured");
 assert.equal(out.assets.ABC.status,"unknown");
});
test("verified valuation crosses future configurable threshold in both directions",()=>{
 assert.equal(status(20,good(19.99)),"accepted");
 assert.equal(status(20,good(20)),"public");
 assert.equal(status(20.00000001,good("20.00000000")),"accepted");
 assert.equal(status(20.00000001,good("20.00000001")),"public");
 assert.equal(status(20,good(0)),"accepted");
 assert.equal(status(20,good(21)),"public");
});
test("missing, stale, future, duplicate and invalid proof never masquerade as zero",()=>{
 assert.equal(derivedVisibility(catalog(20),null,{now:NOW}).assets.ABC.status,"unknown");
 assert.equal(status(20,{...good(100),complete:false}),"unknown");
 assert.equal(status(20,{...good(100),valuationVerified:false}),"unknown");
 assert.equal(status(20,{...good(100),proofDigest:"invalid"}),"unknown");
 assert.equal(status(20,{...good(100),assetId:"0x"+"f".repeat(64)}),"unknown");
 assert.equal(status(20,{...good(100),asOf:new Date(NOW-901000).toISOString()}),"unknown");
 assert.equal(status(20,{...good(100),asOf:new Date(NOW+90000).toISOString()}),"unknown");
 assert.equal(status(20,{...good(100),lockedUsd:"NaN"}),"unknown");
});
test("config-only and incomplete token is prospect regardless of asserted custody",()=>{
 const c=catalog(20);
 c.assets.ABC.deployment.routeDeployments.pop();
 const out=derivedVisibility(c,{ABC:good(999999)},{now:NOW});
 assert.equal(out.assets.ABC.status,"prospect");
});
