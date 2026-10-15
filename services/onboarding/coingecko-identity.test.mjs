import test from "node:test";
import assert from "node:assert/strict";
import {assertCoinGeckoIdentity,verifyCoinGecko,platforms} from "./coingecko-identity.mjs";
const app={coingeckoId:"example-token",canonicalChain:"base",canonicalAddress:"0x1234567890123456789012345678901234567890",symbol:"EXMP",decimals:18};
const coin={id:"example-token",symbol:"exmp",platforms:{base:app.canonicalAddress},
 detail_platforms:{base:{contract_address:app.canonicalAddress,decimal_place:18}}};
test("CoinGecko identity validates exact original chain, contract, decimals and token symbol",()=>{
 const v=assertCoinGeckoIdentity(app,coin);
 assert.equal(v.platform,"base"); assert.equal(v.address,app.canonicalAddress);
 assert.equal(platforms.polygon,"polygon-pos");
 assert.equal(platforms.arbitrum,"arbitrum-one");
});
test("CoinGecko identity fails closed for ID, contract, network, symbol, decimals and unsupported chains",()=>{
 assert.throws(()=>assertCoinGeckoIdentity({...app,coingeckoId:"other"},coin),/profile ID/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,canonicalAddress:"0x1234567890123456789012345678901234567891"},coin),/address mismatch/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,canonicalChain:"polygon"},coin),/not listed/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,canonicalChain:"xgrchain"},coin),/not yet supported/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,symbol:"OTHER"},coin),/symbol/);
 assert.throws(()=>assertCoinGeckoIdentity({...app,decimals:6},coin),/decimals/);
 assert.throws(()=>assertCoinGeckoIdentity(app,{...coin,platforms:{base:"0x1234567890123456789012345678901234567891"}}),/inconsistent/);
});
test("CoinGecko fetch verifies the upstream JSON and fails closed on provider errors",async()=>{
 const fetcher=async(url)=>{assert.match(url,/api.coingecko.com\/api\/v3\/coins\/example-token/);return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(coin)}};
 assert.equal((await verifyCoinGecko(app,{fetcher})).platform,"base");
 await assert.rejects(verifyCoinGecko(app,{fetcher:async()=>({ok:false,status:429})}),/HTTP 429/);
 await assert.rejects(verifyCoinGecko({...app,canonicalChain:"xgrchain"},{fetcher:async()=>{throw Error("must never fetch")}}),/unsupported/);
});
