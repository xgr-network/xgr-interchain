import test from "node:test";
import assert from "node:assert/strict";
import {projectMetrics} from "./server.mjs";
import {deployedFixture} from "../../apps/web/deployed-test-fixture.mjs";
const catalog={assets:{XGR:deployedFixture("XGR","xgrchain"),ABC:deployedFixture("ABC","base")}};
const verified=(id)=>({assetId:id,verified:true,
 market:{status:"verified",priceUsd:2,circulatingRaw:"100",decimals:0,marketCapUsd:200},
 custody:{status:"verified",complete:true,lockedUsd:20,vaults:[{verified:true,chain:"xgrchain",router:"0xaaa",netLockedRaw:"10",valueUsd:20}]},
 movement:{status:"verified",complete:true,movedUsd:8,journeys:[{id:"v1",verified:true,viaHub:true,valueUsd:8,hops:["base->xgrchain"]}]}
});
test("unavailable evidence never invents zero TVL or movement",()=>{
 const result=projectMetrics(catalog,null);
 assert.deepEqual(result.totals,{lockedUsd:null,movedUsd:null});
 assert.equal(result.status,"incomplete");
 assert.equal(result.assets.XGR.verified,false);
});
test("fully verified unique assets produce totals only with complete coverage",()=>{
 const result=projectMetrics(catalog,{schemaVersion:1,kind:"xita-asset-metrics-v1",assets:{
  XGR:verified("XGR"),ABC:{...verified("ABC"),custody:{...verified("ABC").custody,vaults:[{...verified("ABC").custody.vaults[0],router:"0xbbb"}]},movement:{...verified("ABC").movement,journeys:[{...verified("ABC").movement.journeys[0],id:"v2"}]}}
 }});
 assert.deepEqual(result.totals,{lockedUsd:40,movedUsd:16});
});
test("a single unverifiable asset invalidates aggregate totals",()=>{
 const result=projectMetrics(catalog,{schemaVersion:1,kind:"xita-asset-metrics-v1",assets:{XGR:verified("XGR")}});
 assert.deepEqual(result.totals,{lockedUsd:null,movedUsd:null});
 assert.equal(result.assets.ABC.verified,false);
});

test("CoinGecko public market data does not fabricate locked collateral",()=>{
 const c={assets:{ABC:{profile:{market:{priceSource:"coingecko",coingeckoId:"example-token"}},routes:{routes:[]}}}};
 const m={records:{"example-token":{priceUsd:2,marketCapUsd:2000,circulating:1000,asOf:"2026-10-10T00:00:00Z"}}};
 const rows=projectMetrics(c,null,m);
 assert.equal(rows.assets.ABC.market.marketCapUsd,2000);
 assert.equal(rows.assets.ABC.verified,false);assert.deepEqual(rows.totals,{lockedUsd:null,movedUsd:null});
});

test("newly accepted asset with partial receipts does not zero valid XGR 24h turnover",()=>{
 const xgr=deployedFixture("XGR","xgrchain");
 const arb=deployedFixture("ARB","arbitrum");
 arb.deployment.routeDeployments=[]; // e.g. registration complete, no route
 const full={assets:{XGR:xgr,ARB:arb}};
 const result=projectMetrics(full,{schemaVersion:1,kind:"xita-asset-metrics-v1",
  assets:{XGR:verified("XGR")}});
 assert.deepEqual(result.totals,{lockedUsd:20,movedUsd:8});
 assert.equal(result.metadata.configuredAssets,2);
 assert.equal(result.metadata.deployedAssets,1);
 assert.equal(result.assets.ARB.verified,false);
 // Once ARB is independently deployed, missing ARB evidence must fail closed.
 const ready=projectMetrics({assets:{XGR:xgr,ARB:deployedFixture("ARB","arbitrum")}},
  {schemaVersion:1,kind:"xita-asset-metrics-v1",assets:{XGR:verified("XGR")}});
 assert.deepEqual(ready.totals,{lockedUsd:null,movedUsd:null});
});
