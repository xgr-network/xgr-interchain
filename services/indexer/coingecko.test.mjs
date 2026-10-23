import test from "node:test";
import assert from "node:assert/strict";
import {configuredIds,validMarketRecord,getCoinGeckoPrices} from "./coingecko.mjs";
const cat={assets:{A:{profile:{market:{priceSource:"coingecko",coingeckoId:"ethereum"}}},B:{profile:{market:{priceSource:"none",coingeckoId:null}}}}};
test("Only configured CoinGecko identifiers are requested",()=>{
 assert.deepEqual(configuredIds(cat),["ethereum"]);
});
test("Reject invalid, incomplete market records",()=>{
 assert.equal(validMarketRecord({current_price:-1,market_cap:500,circulating_supply:5},"now"),null);
 assert.equal(validMarketRecord({current_price:5,market_cap:500,circulating_supply:null},"now"),null);
});
test("Market caps require valid public provider record",async()=>{
 const snapshot=await getCoinGeckoPrices(cat,{fetcher:async(url)=>{assert.match(url,/ids=ethereum/);return {ok:true,json:async()=>[{id:"ethereum",current_price:2,market_cap:100,circulating_supply:50}]};},clock:()=>0});
 assert.equal(snapshot.records.ethereum.marketCapUsd,100);
 assert.equal(snapshot.records.ethereum.priceUsd,2);
});

test("XGR CoinGecko id is configured in the canonical generated catalog",async()=>{
 const {readFileSync}=await import("node:fs");
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const ids=configuredIds(catalog);
 assert.equal(catalog.assets.XGR.profile.market.coingeckoId,"xgr");
 assert.ok(ids.includes("xgr"),"XGR must remain a configured CoinGecko asset");
 const expected=Object.values(catalog.assets)
  .filter(asset=>asset.profile?.market?.priceSource==="coingecko")
  .map(asset=>asset.profile.market.coingeckoId);
 assert.deepEqual(new Set(ids),new Set(expected),
  "Every listed CoinGecko asset must be included exactly once");
 assert.equal(catalog.assets.XGR.profile.market.priceSource,"coingecko");
 assert.equal(Object.hasOwn(catalog.assets.XGR,"listing"),false);
 assert.equal(catalog.publication.minimumLockedUsd,null);
});
