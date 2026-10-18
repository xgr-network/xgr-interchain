import test from "node:test";
import assert from "node:assert/strict";
import {projectMetrics} from "./server.mjs";
const catalog={assets:{XGR:{profile:{name:"XGR"},routes:{routes:[]}},ABC:{profile:{name:"ABC"},routes:{routes:[]}}}};
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

test("verified collateral does not require a movement proof to display TVL",()=>{
 const proof=verified("XGR");proof.movement={status:"unavailable"};
 const rows=projectMetrics({assets:{XGR:catalog.assets.XGR}},
  {schemaVersion:1,kind:"xita-asset-metrics-v1",assets:{XGR:proof}});
 assert.equal(rows.totals.lockedUsd,20);
 assert.equal(rows.totals.movedUsd,null);
});
