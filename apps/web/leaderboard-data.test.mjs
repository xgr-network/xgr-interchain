import test from "node:test";
import assert from "node:assert/strict";
import {verifiedMetrics,rankAssets,buildLeaderboardRows,formatUsd} from "./leaderboard-data.js";
const proof={
 schemaVersion:1,kind:"xita-asset-metrics-v1",
 assets:{XGR:{
  assetId:"XGR",verified:true,asOf:"2026-10-10T00:00:00Z",
  market:{status:"verified",priceUsd:2,marketCapUsd:160,circulatingRaw:"80000000000000000000",decimals:18},
  custody:{status:"verified",complete:true,lockedUsd:30,vaults:[{verified:true,chain:"xgrchain",router:"0xabc",netLockedRaw:"15000000000000000000",valueUsd:30}]},
  movement:{status:"verified",complete:true,movedUsd:24,journeys:[
   {id:"bridge-a",verified:true,viaHub:true,valueUsd:24,hops:["base->xgrchain","xgrchain->polygon"]}
  ]}
 }}};
test("complete, independently verified collateral and journeys are shown",()=>{
 assert.deepEqual(verifiedMetrics(proof,"XGR"),{marketCapUsd:160,lockedUsd:30,movedUsd:24,asOf:"2026-10-10T00:00:00Z"});
});
test("duplicated custody vault cannot inflate TVL",()=>{
 const p=structuredClone(proof);p.assets.XGR.custody.vaults.push({...p.assets.XGR.custody.vaults[0]});
 p.assets.XGR.custody.lockedUsd=60;
 assert.equal(verifiedMetrics(p,"XGR").lockedUsd,null);
});
test("duplicate bridge journeys and mismatched totals fail closed",()=>{
 const p=structuredClone(proof),entry=p.assets.XGR.movement;
 entry.journeys.push({...entry.journeys[0]});entry.movedUsd=48;
 assert.equal(verifiedMetrics(p,"XGR").movedUsd,null);
 entry.journeys[1].id="bridge-b";entry.movedUsd=47;
 assert.equal(verifiedMetrics(p,"XGR").movedUsd,null);
});
test("wrapped supply alone cannot be construed as custody",()=>{
 const p=structuredClone(proof);p.assets.XGR.custody={wrappedSupplyRaw:"200000000000000000000"};
 assert.equal(verifiedMetrics(p,"XGR").lockedUsd,null);
});
test("missing price and supply never invent market cap",()=>{
 const p=structuredClone(proof);delete p.assets.XGR.market.circulatingRaw;
 assert.equal(verifiedMetrics(p,"XGR").marketCapUsd,null);
});
test("unknown always last for either sort direction",()=>{
 const rows=[{name:"A",lockedUsd:null},{name:"B",lockedUsd:5},{name:"C",lockedUsd:12}];
 assert.deepEqual(rankAssets(rows,"lockedUsd","desc").map(x=>x.name),["C","B","A"]);
 assert.deepEqual(rankAssets(rows,"lockedUsd","asc").map(x=>x.name),["B","C","A"]);
});
test("all listed tokens appear without metrics even if indexer is offline",()=>{
 const catalog={assets:{XGR:{profile:{name:"XGR"},routes:{routes:[]}},ABC:{profile:{name:"ABC"},routes:{routes:[]}}}};
 const rows=buildLeaderboardRows(catalog,null);
 assert.equal(rows.length,2);assert.ok(rows.every(x=>x.lockedUsd===null&&x.movedUsd===null&&x.marketCapUsd===null));
 assert.equal(formatUsd(null),"—");
});
