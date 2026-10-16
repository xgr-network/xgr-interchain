import test from "node:test";
import assert from "node:assert/strict";
import {COINGECKO_GAS_COIN_IDS,usdPrice12,costInSourceWei,verifiedCoinGeckoPrices,ceilDiv}
 from "./fee-quote.mjs";
test("native source fee price maps XGR to CoinGecko xgr and Base gas to ETH",()=>{
 assert.equal(COINGECKO_GAS_COIN_IDS.xgrchain,"xgr");
 assert.equal(COINGECKO_GAS_COIN_IDS.base,"ethereum");
 assert.equal(COINGECKO_GAS_COIN_IDS.arbitrum,"ethereum");
});
test("tiny native gas coin prices preserve precision and reject zero",()=>{
 assert.equal(usdPrice12(0.0001),100000000n);
 assert.equal(usdPrice12(1e-8),10000n);
 assert.equal(usdPrice12("2500.25"),2500250000000000n);
 assert.throws(()=>usdPrice12(0),/invalid/);
 assert.throws(()=>usdPrice12(-2),/Invalid/);
});
test("gas quote is round-up source-native, no tokens or fractions of wei",()=>{
 const r=costInSourceWei({sourcePriceUsd:0.0001,destinationPriceUsd:2500,
   destinationGasPriceWei:1000000000n,destinationGasUnits:1000000n});
 assert.equal(r.estimatedDestinationCostWei,"1000000000000000");
 assert.equal(r.quotedServiceFeeWei,"32500000000000000000000"); // $2.50 *1.3 / $0.0001
});
test("quote rejects suspicious zero gas, extremely large gas cap or arbitrary risk margin",()=>{
 for(const v of [
  {destinationGasPriceWei:0n},{destinationGasUnits:100n},
  {destinationGasUnits:5000001n},{bufferBps:30001n}
 ])assert.throws(()=>costInSourceWei({
 sourcePriceUsd:0.0001,destinationPriceUsd:2500,
 destinationGasPriceWei:1000000000n,destinationGasUnits:600000n,...v
 }),/Unsafe/);
});
test("CoinGecko snapshot freshness is checked for BOTH chain gas coins",()=>{
 const now=1729000000000,sec=Math.floor(now/1000);
 const pair={"xgr":{usd:0.0001,last_updated_at:sec-20},
  ethereum:{usd:2500,last_updated_at:sec-25}};
 const p=verifiedCoinGeckoPrices(pair,"xgrchain","base",{now});
 assert.equal(p.sourceId,"xgr");assert.equal(p.destinationId,"ethereum");
 assert.throws(()=>verifiedCoinGeckoPrices({...pair,
  ethereum:{usd:2500,last_updated_at:sec-500}},"xgrchain","base",{now}),/stale/);
 assert.throws(()=>verifiedCoinGeckoPrices({...pair,
  xgr:{usd:0,last_updated_at:sec}},"xgrchain","base",{now}),/stale/);
});
test("single CoinGecko ETH price can support Base and Arbitrum without duplicate feeds",()=>{
 const now=1729000000000,sec=Math.floor(now/1000);
 const p=verifiedCoinGeckoPrices({ethereum:{usd:2600,last_updated_at:sec}},
  "base","arbitrum",{now});
 assert.equal(p.sourceUsd,2600);assert.equal(p.destinationUsd,2600);
});
test("integer ceil division never rounds under cost",()=>{
 assert.equal(ceilDiv(101n,10n),11n);
 assert.equal(ceilDiv(100n,10n),10n);
 assert.throws(()=>ceilDiv(1n,0n),/Invalid/);
});
