import test from "node:test";
import assert from "node:assert/strict";
import {derivedVisibility} from "./publication.mjs";
import {deployedFixture} from "../../apps/web/deployed-test-fixture.mjs";

const creatorOrigin=()=>{
 const e=deployedFixture("XTK","xgrchain");
 e.metadata.canonical={chain:"xgrchain",tokenAddress:"0x1234567890123456789012345678901234567890"};
 e.metadata.creation={kind:"xgrchain-creator-v1",
  ownerAddress:"0x1234567890123456789012345678901234567890",factory:"0x2234567890123456789012345678901234567890",
  transactionHash:"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",tokenRuntimeCodeHash:"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",blockNumber:123};
 e.profile={name:"XGR Created Token",slug:"xgr-created-token",market:{priceSource:"none",coingeckoId:null}};
 e.deployment.present=false;
 return e;
};

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
test("approved XGR creator origin stays published without DB, TVL or route receipts",()=>{
 const c={assets:{XTK:creatorOrigin()},
  publication:{schemaVersion:1,kind:"xita-publication-policy",minimumLockedUsd:null,maxEvidenceAgeSeconds:900}};
 const row=derivedVisibility(c,null,{now:NOW}).assets.XTK;
 assert.equal(row.status,"public");
 assert.equal(row.deployment,"origin-verified");
 assert.equal(row.lockedUsd,null);
 const invalid=structuredClone(c);
 delete invalid.assets.XTK.metadata.creation;
 assert.equal(derivedVisibility(invalid,null,{now:NOW}).assets.XTK.status,"prospect");
});
