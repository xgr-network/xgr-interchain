import test from "node:test";
import assert from "node:assert/strict";
import {accumulateVerifiedMovement} from "./total-moved-history.mjs";
import {deployedFixture} from "../../apps/web/deployed-test-fixture.mjs";

const catalog={assets:{XGR:deployedFixture("XGR","xgrchain")},
 chains:{xgrchain:{chainId:1643,rpcUrls:["https://rpc.xgr.network"]},base:{chainId:8453}}};
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
