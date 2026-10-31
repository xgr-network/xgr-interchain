import test from "node:test";
import assert from "node:assert/strict";
import {assertCoinGeckoIdentity,verifyCoinGecko,verifiedAssetPlatform} from "./coingecko-identity.mjs";
import {loadCatalog} from "../../tools/validate-manifests.mjs";
const catalog=loadCatalog();
const app={coingeckoId:"example-token",canonicalChain:"base",canonicalAddress:"0x1234567890123456789012345678901234567890",symbol:"EXMP",decimals:18};
const coin={id:"example-token",symbol:"exmp",platforms:{base:app.canonicalAddress},
 detail_platforms:{base:{contract_address:app.canonicalAddress,decimal_place:18}}};
test("CoinGecko identity validates exact original chain, contract, decimals and token symbol",()=>{
 const v=assertCoinGeckoIdentity(app,coin,{catalog});
 assert.equal(v.platform,"base"); assert.equal(v.address,app.canonicalAddress);
 assert.equal(verifiedAssetPlatform(catalog,"polygon"),null);
 assert.equal(verifiedAssetPlatform(catalog,"arbitrum"),"arbitrum-one");
 assert.equal(verifiedAssetPlatform(catalog,"bsc"),"binance-smart-chain");
});
test("CoinGecko identity fails closed for ID, contract, network, symbol, decimals and unsupported chains",()=>{
 assert.throws(()=>assertCoinGeckoIdentity({...app,coingeckoId:"other"},coin,{catalog}),/profile ID/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,canonicalAddress:"0x1234567890123456789012345678901234567891"},coin,{catalog}),/address mismatch/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,canonicalChain:"polygon"},coin,{catalog}),/not yet supported/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,canonicalChain:"xgrchain"},coin,{catalog}),/not yet supported/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,symbol:"OTHER"},coin,{catalog}),/symbol/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,decimals:6},coin,{catalog}),/decimals/);
 assert.throws(()=>assertCoinGeckoIdentity(app,{...coin,platforms:{base:"0x1234567890123456789012345678901234567891"}},{catalog}),/inconsistent/);
});
test("BSC original BEP20 identity uses binance-smart-chain and excludes undeployed Polygon",()=>{
 const bsc={...app,canonicalChain:"bsc"};
 const onBsc={id:app.coingeckoId,symbol:app.symbol,
  platforms:{"binance-smart-chain":app.canonicalAddress},
  detail_platforms:{"binance-smart-chain":{contract_address:app.canonicalAddress,decimal_place:18}}};
 assert.equal(assertCoinGeckoIdentity(bsc,onBsc,{catalog}).platform,"binance-smart-chain");
 assert.throws(()=>assertCoinGeckoIdentity({...bsc,canonicalChain:"polygon"},onBsc,{catalog}),/not yet supported/);
 const unknown=structuredClone(catalog);
 unknown.infrastructure.bsc.present=false;
 assert.throws(()=>assertCoinGeckoIdentity(bsc,onBsc,{catalog:unknown}),/not yet supported/);
});
test("CoinGecko fetch verifies the upstream JSON and fails closed on provider errors",async()=>{
 const fetcher=async(url)=>{assert.match(url,/api.coingecko.com\/api\/v3\/coins\/example-token/);return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(coin)}};
 assert.equal((await verifyCoinGecko(app,{fetcher,catalog})).platform,"base");
 await assert.rejects(verifyCoinGecko(app,{fetcher:async()=>({ok:false,status:429}),catalog}),/HTTP 429/);
 await assert.rejects(verifyCoinGecko({...app,canonicalChain:"xgrchain"},{fetcher:async()=>{throw Error("must never fetch")},catalog}),/unsupported/);
});
