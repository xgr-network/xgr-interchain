import test from "node:test";
import assert from "node:assert/strict";
import {systemTokenPlanets, MAX_VISIBLE_TOKEN_PLANETS} from "./universe-token-layout.js";

const polygon = {key:"polygon",tokens:[{
 id:"XGR",name:"XGR",slug:"xgr",
 representations:[{chain:"xgrchain",representation:"native",symbol:"XGR"},
  {chain:"polygon",representation:"synthetic",symbol:"wXGR",assetAddress:null}]
}]};

test("catalog-listed wrapped tokens appear without ranking or deployment receipts", () => {
 const shown = systemTokenPlanets(polygon, []);
 assert.equal(shown.length, 1);
 assert.equal(shown[0].token.id, "XGR");
 assert.deepEqual(shown[0].representation, {
  kind:"wrapped",label:"Wrapped",symbol:"wXGR",
  description:"Synthetic token representation; deployment and activation require independent verification"
 });
 assert.ok(shown[0].orbit > 0 && shown[0].radius > 0);
 assert.ok(Number.isFinite(shown[0].phase));
});

test("hub native representation also appears without market or custody metrics", () => {
 const hub = {...polygon,key:"xgrchain"};
 const shown = systemTokenPlanets(hub);
 assert.equal(shown[0].representation.symbol, "XGR");
 assert.equal(shown[0].representation.kind, "native");
});

test("ranked items reorder catalog tokens but never filter out unranked assets or add outsiders", () => {
 const s={...polygon,tokens:[
  {...polygon.tokens[0],id:"ABC",name:"ABC"},
  polygon.tokens[0],
  {...polygon.tokens[0],id:"DEF",name:"DEF"}
 ]};
 const shown=systemTokenPlanets(s,[
  {assetId:"DEF",value:20},{assetId:"UNKNOWN",value:999},{assetId:"XGR",value:0}
 ]);
 assert.deepEqual(shown.map(x=>x.token.id),["DEF","XGR","ABC"]);
 assert.deepEqual(systemTokenPlanets(s,[]).map(x=>x.token.id),["ABC","XGR","DEF"]);
});

test("search filters from catalog locally even when external ranking is unavailable", () => {
 const s={...polygon,tokens:[...polygon.tokens,{
  id:"USDC",name:"USD Coin",slug:"usdc",
  representations:[{chain:"polygon",representation:"collateral",symbol:"USDC"}]
 }]};
 assert.deepEqual(systemTokenPlanets(s,[],"wrapped").map(x=>x.token.id),["XGR"]);
 assert.deepEqual(systemTokenPlanets(s,[],"usdc").map(x=>x.token.id),["USDC"]);
 assert.equal(systemTokenPlanets(s,[],"no match").length,0);
 assert.equal(systemTokenPlanets({key:"base",tokens:[]}).length,0);
});

test("at most six deterministic selectable planets are placed even for large catalogs", () => {
 const s={key:"base",tokens:Array.from({length:18},(_,i)=>({
  id:"ASSET"+i,name:"Asset "+i,representations:[{chain:"base",symbol:"T"+i}]
 }))};
 const first=systemTokenPlanets(s),again=systemTokenPlanets(s);
 assert.equal(first.length,MAX_VISIBLE_TOKEN_PLANETS);
 assert.deepEqual(first,again);
 assert.ok(first.every(x=>x.orbit>4&&x.radius>0&&x.phase>=0));
});
