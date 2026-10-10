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
 assert.deepEqual(configuredIds(catalog),["xgr"]);
 assert.equal(catalog.assets.XGR.profile.market.priceSource,"coingecko");
 assert.equal(catalog.assets.XGR.listing.status,"public");
});
