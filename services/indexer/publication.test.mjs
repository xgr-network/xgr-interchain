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
const status=(minimum,row)=>derivedVisibility(catalog(minimum),row?{ABC:row}:null,{now:NOW}).assets.ABC.status;
test("null publishes documented token independently of TVL and indexer",()=>{
 assert.equal(status(null,null),"public");
 assert.equal(status(null,good(0)),"public");
 assert.equal(status(null,good(1000000)),"public");
 const out=derivedVisibility(catalog(null),null,{now:NOW});
 assert.equal(out.status,"unrestricted");
 assert.equal(out.assets.ABC.lockedUsd,null);
});
test("strict greater-than in eight-decimal USD integer units",()=>{
 assert.equal(status(0,good(0)),"accepted");
 assert.equal(status(0,good("0.00000001")),"public");
 assert.equal(status(1,good(1)),"accepted");
 assert.equal(status(1,good("1.00000001")),"public");
 assert.equal(status(20,good("19.99")),"accepted");
 assert.equal(status(20,good(20)),"accepted");
 assert.equal(status(20,good("20.00000001")),"public");
});
test("missing, stale, future, incomplete and forged TVL remain unknown under numeric threshold",()=>{
 assert.equal(status(0,null),"unknown");
 assert.equal(status(0,{...good(100),complete:false}),"unknown");
 assert.equal(status(0,{...good(100),valuationVerified:false}),"unknown");
 assert.equal(status(0,{...good(100),proofDigest:"invalid"}),"unknown");
 assert.equal(status(0,{...good(100),assetId:"0x"+"f".repeat(64)}),"unknown");
 assert.equal(status(0,{...good(100),asOf:new Date(NOW-901000).toISOString()}),"unknown");
 assert.equal(status(0,{...good(100),asOf:new Date(NOW+90000).toISOString()}),"unknown");
 assert.equal(status(0,{...good(100),lockedUsd:"NaN"}),"unknown");
});
test("one complete route publishes even if future spokes remain planned",()=>{
 const c=catalog(null),a=c.assets.ABC;
 a.metadata.representations.push({chain:"polygon",representation:"synthetic",symbol:"wABC"});
 a.routes.routes.push({name:"base_to_polygon",sourceChain:"base",destinationChain:"polygon"});
 assert.equal(derivedVisibility(c,null,{now:NOW}).assets.ABC.status,"public");
 c.assets.ABC.deployment.routeDeployments=[];
 assert.equal(derivedVisibility(c,null,{now:NOW}).assets.ABC.status,"prospect");
});
test("invalid publication policy does not silently remove TVL restrictions",()=>{
 const c=catalog(-1);
 assert.equal(derivedVisibility(c,{ABC:good(50)},{now:NOW}).assets.ABC.status,"unknown");
});