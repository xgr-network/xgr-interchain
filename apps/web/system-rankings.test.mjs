import test from "node:test";
import assert from "node:assert/strict";
import {systemRanking,MAX_ORBIT_TOKENS} from "./system-rankings.js";
const asset=(id,chain,status="public")=>({
 listing:{kind:"xita-asset-listing",asset:id,status},
 profile:{name:id,slug:id.toLowerCase()},
 metadata:{canonical:{chain},representations:[{chain,representation:"native",symbol:id}]}
});
const catalog={chains:{base:{},xgrchain:{}},assets:{
 XGR:asset("XGR","xgrchain"),ABC:asset("ABC","base"),HIDDEN:asset("HIDDEN","base","accepted")}};
const metrics={kind:"xita-asset-metrics-v1",schemaVersion:1,assets:{
 ABC:{assetId:"ABC",verified:false,market:{status:"market-data",source:"coingecko",marketCapUsd:100,priceUsd:1,circulating:100},custody:{status:"unavailable"},movement:{status:"unavailable"}}
}};
test("only public, chain-native, sourced metric entries can orbit",()=>{
 const result=systemRanking(catalog,metrics,"base",{sort:"marketCapUsd"});
 assert.equal(result.items.length,1);assert.equal(result.items[0].assetId,"ABC");
 assert.equal(systemRanking(catalog,metrics,"base",{sort:"lockedUsd"}).items.length,0);
 assert.equal(systemRanking(catalog,metrics,"base",{search:"HIDDEN",sort:"marketCapUsd"}).items.length,0);
 assert.equal(systemRanking(catalog,metrics,"unknown"),null);
});
test("ranking always limits 3D bodies to six",()=>{
 const c=structuredClone(catalog);const m=structuredClone(metrics);
 for(let i=0;i<30;i++){
  const id="T"+i;c.assets[id]=asset(id,"base");
  m.assets[id]={...metrics.assets.ABC,assetId:id,market:{...metrics.assets.ABC.market,marketCapUsd:1000+i}};
 }
 const rank=systemRanking(c,m,"base",{sort:"marketCapUsd",limit:500});
 assert.equal(rank.items.length,MAX_ORBIT_TOKENS);
 assert.equal(rank.items[0].assetId,"T29");
});
