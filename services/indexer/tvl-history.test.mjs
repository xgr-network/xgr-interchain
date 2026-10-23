import test from "node:test";
import assert from "node:assert/strict";
import {verifiedTvlHistory} from "./tvl-history.mjs";
import {deployedFixture} from "../../apps/web/deployed-test-fixture.mjs";
const a=deployedFixture("XGR","xgrchain"),b=deployedFixture("ARB","arbitrum");
b.deployment.routeDeployments=[];
const catalog={assets:{XGR:a,ARB:b}};
const asOf="2026-10-23T12:00:00.000Z";
const snapshot={kind:"xita-asset-metrics-v1",schemaVersion:1,asOf,
 assets:{XGR:{assetId:"XGR",verified:true,
  custody:{status:"verified",complete:true,lockedUsd:20,vaults:[
   {verified:true,chain:"xgrchain",router:"0xaaa",netLockedRaw:"1000",valueUsd:20}
  ]},
  movement:{status:"unavailable"}}}};
test("planned or partial deployment does not block verified XGR history",()=>{
 const h=verifiedTvlHistory(snapshot,catalog);
 assert.equal(h.points.length,1);
 assert.equal(h.points[0].lockedUsd,20);
 assert.deepEqual(h.points[0].assets,{XGR:20});
 const all=verifiedTvlHistory(snapshot,{assets:{XGR:a,ARB:deployedFixture("ARB","arbitrum")}});
 assert.equal(all.points.length,0,"a fully deployed asset missing evidence blocks complete history");
});
