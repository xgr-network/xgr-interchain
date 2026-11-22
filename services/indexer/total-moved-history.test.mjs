import test from "node:test";
import assert from "node:assert/strict";
import {accumulateVerifiedMovement} from "./total-moved-history.mjs";
import {freshDeployedCatalog} from "../managed-relay/test-deployments.mjs";

const catalog=freshDeployedCatalog({routeDestination:"base"}).catalog;
catalog.assets.XGR.metadata.decimals=18;
catalog.assets.XGR.profile.market={priceSource:"coingecko",coingeckoId:"xgr"};
const assetId=catalog.assets.XGR.metadata.assetId;
const now=Date.parse("2026-11-22T09:00:00Z");
const price=n=>({records:{[catalog.assets.XGR.profile.market.coingeckoId]:{
 source:"coingecko",priceUsd:n,asOf:new Date(now).toISOString()
}}});
const snap=(grossRaw,at=now)=>({asOf:new Date(at).toISOString(),
 lifetimeFlows:{XGR:{status:"verified",kind:"escrow-gross-lifetime-raw",
  assetId,grossRaw}}});
const calc=(raw,usd,previous=null,at=now)=>accumulateVerifiedMovement(
 snap(raw,at),catalog,price(usd),previous,{now:at}
);
test("lifetime grows only with newly indexed amounts, never with token repricing",()=>{
 const one=calc("1000000000000000000",2);
 assert.equal(one.status,"verified");
 assert.equal(one.totalUsd,2);
 const unchanged=calc("1000000000000000000",.5,one,now+60000);
 assert.equal(unchanged.totalUsd,2);
 const two=calc("2000000000000000000",.5,unchanged,now+120000);
 assert.equal(two.totalUsd,2.5);
 assert.deepEqual(two.points.map(x=>x.totalUsd),[2,2,2.5]);
});
test("replaying snapshot cannot double count or move an observation backwards",()=>{
 const first=calc("1000000000000000000",2);
 assert.strictEqual(calc("2000000000000000000",5,first,now),first);
 const revised=calc("500000000000000000",5,first,now+60000);
 assert.strictEqual(revised,first);
});
test("incomplete coverage and unknown events never invent a new total",()=>{
 const first=calc("1000000000000000000",2);
 const missing=accumulateVerifiedMovement(
 {asOf:new Date(now+60000).toISOString(),lifetimeFlows:{}},
 catalog,price(10),first,{now:now+60000});
 assert.strictEqual(missing,first);
 const fresh=accumulateVerifiedMovement(
 {asOf:new Date(now+60000).toISOString(),lifetimeFlows:{}},
 catalog,price(10),null,{now:now+60000});
 assert.equal(fresh.status,"unavailable");
 assert.equal(fresh.totalUsd,null);
});

test("cumulative first snapshot becomes valid after an incomplete startup",()=>{
 const pending=accumulateVerifiedMovement({asOf:new Date(now).toISOString()},
  catalog,price(2),null,{now});
 assert.equal(pending.status,"unavailable");
 const ready=calc("1000000000000000000",2,pending,now+60000);
 assert.equal(ready.status,"verified");
 assert.equal(ready.totalUsd,2);
});

test("last complete 24h number survives a later incomplete observation with timestamp",()=>{
 const valid24h={assetId:"XGR",verified:true,market:{status:"unavailable"},
  custody:{status:"unavailable"},
  movement:{status:"verified",complete:true,metric:"escrow-gross-24h",
   windowStart:new Date(now-86400000).toISOString(),windowEnd:new Date(now).toISOString(),
   proofDigest:"0x"+"a".repeat(64),inflowRaw:"1000000000000000000",
   outflowRaw:"0",movedUsd:2}};
 const first=accumulateVerifiedMovement({...snap("1000000000000000000"),
  kind:"xita-asset-metrics-v1",schemaVersion:1,
  assets:{XGR:valid24h}},catalog,price(2),null,{now});
 assert.equal(first.lastVerified24h.movedUsd,2);
 assert.equal(first.lastVerified24h.asOf,new Date(now).toISOString());
 const later=calc("1000000000000000000",.5,first,now+60000);
 assert.deepEqual(later.lastVerified24h,first.lastVerified24h);
 assert.equal(later.totalUsd,first.totalUsd);
});

test("persisted canonical movement curve survives later temporarily incomplete index snapshot",()=>{
 const start={...snap("1000000000000000000"),
  reconstructedMoved:{kind:"indexed-gross-movement-history-v1",status:"verified",
   pricing:"current-reference-price",asOf:new Date(now).toISOString(),
   points:[{asOf:new Date(now-3600000).toISOString(),movedWindowUsd:0},
    {asOf:new Date(now).toISOString(),movedWindowUsd:2}]}};
 const first=accumulateVerifiedMovement(start,catalog,price(2),null,{now});
 assert.equal(first.totalUsd,2);
 assert.equal(first.reconstructed.points.length,2);
 const later=calc("1000000000000000000",.5,first,now+60000);
 assert.deepEqual(later.reconstructed,first.reconstructed,
  "the last verified curve is retained with its ORIGINAL time and values");
 assert.equal(later.asOf,new Date(now+60000).toISOString());
 const increased=calc("2000000000000000000",.5,later,now+120000);
 assert.equal(increased.totalUsd,2.5);
 assert.equal(increased.reconstructed.points.at(-1).totalUsd,2);
 assert.equal(increased.reconstructed.asOf,first.reconstructed.asOf);
 const expired=calc("2000000000000000000",.5,increased,now+7*3600000);
 assert.equal(expired.reconstructed,undefined,
  "a stale curve is not misrepresented as a current 30-day reconstruction");
});
