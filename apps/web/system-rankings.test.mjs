import test from "node:test";
import assert from "node:assert/strict";
import {systemRanking,MAX_ORBIT_TOKENS} from "./system-rankings.js";
import {deployedFixture} from "./deployed-test-fixture.mjs";
const catalog={chains:{base:{},xgrchain:{}},assets:{
 XGR:deployedFixture("XGR","xgrchain"),ABC:deployedFixture("ABC"),
 HIDDEN:deployedFixture("HIDDEN")}};
const visible=(assets)=>({schemaVersion:1,kind:"xita-visibility-v1",
 assets:Object.fromEntries(Object.entries(assets).map(([id,status])=>[
  id,{status,assetId:catalog.assets[id].metadata.assetId}
 ]))});
const visibility=visible({XGR:"accepted",ABC:"public",HIDDEN:"accepted"});
const market=(id,cap)=>({assetId:id,verified:false,market:{
 status:"market-data",source:"coingecko",marketCapUsd:cap,priceUsd:1,circulating:cap},
 custody:{status:"unavailable"},movement:{status:"unavailable"}});
const metrics={kind:"xita-asset-metrics-v1",schemaVersion:1,assets:{
 ABC:market("ABC",100),HIDDEN:market("HIDDEN",1_000_000)}};
test("only deployed published assets can orbit; unsourced TVL remains unknown",()=>{
 const result=systemRanking(catalog,metrics,"base",{sort:"marketCapUsd",visibility});
 assert.equal(result.items.length,1);assert.equal(result.items[0].assetId,"ABC");
 const unranked=systemRanking(catalog,metrics,"base",{sort:"lockedUsd",visibility});
 assert.equal(unranked.items.length,1);
 assert.equal(unranked.items[0].assetId,"ABC");
 assert.equal(unranked.items[0].lockedUsd,null);
 assert.equal(unranked.status,"unranked");
 assert.equal(systemRanking(catalog,metrics,"base",{search:"HIDDEN",sort:"marketCapUsd",visibility}).items.length,0);
 assert.equal(systemRanking(catalog,metrics,"base",{sort:"marketCapUsd"}).items.length,0);
 assert.equal(systemRanking(catalog,metrics,"unknown",{visibility}),null);
});
test("ranking still limits visible assets to six",()=>{
 const c=structuredClone(catalog),v=structuredClone(visibility),m=structuredClone(metrics);
 for(let i=0;i<30;i++){
  const id="T"+i;c.assets[id]=deployedFixture(id);
  v.assets[id]={assetId:c.assets[id].metadata.assetId,status:"public"};
  m.assets[id]=market(id,1000+i);
 }
 const rank=systemRanking(c,m,"base",{sort:"marketCapUsd",limit:500,visibility:v});
 assert.equal(rank.items.length,MAX_ORBIT_TOKENS);
 assert.equal(rank.items[0].assetId,"T29");
});
