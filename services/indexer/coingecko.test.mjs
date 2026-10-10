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
