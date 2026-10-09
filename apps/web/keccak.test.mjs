import test from "node:test";
import assert from "node:assert/strict";
import {keccak256,selector} from "./keccak.mjs";
import {word,addressWord,parseUnits,formatUnits,calldata,readUint,manifestRoute} from "./protocol.mjs";

test("Ethereum Keccak standard vectors and ABI selectors",()=>{
  assert.equal(keccak256(""),"0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(selector("transfer(address,uint256)"),"0xa9059cbb");
  assert.equal(selector("approve(address,uint256)"),"0x095ea7b3");
  assert.equal(selector("balanceOf(address)"),"0x70a08231");
});
test("Strict ABI encoding and amount handling",()=>{
  assert.equal(word(8453).length,64);
  assert.equal(addressWord("0x1111111111111111111111111111111111111111"),"1".repeat(40).padStart(64,"0"));
  assert.equal(parseUnits("1.123",18),1123000000000000000n);
  assert.equal(formatUnits(1123000000000000000n), "1.123");
  assert.equal(readUint("0x"+word(42),0),42n);
  assert.equal(calldata("approve(address,uint256)",[addressWord("0x1111111111111111111111111111111111111111"),word(1)]).slice(0,10),"0x095ea7b3");
  assert.throws(()=>parseUnits("0",18));
  assert.throws(()=>parseUnits("1e10",18));
  assert.throws(()=>parseUnits("1.0000000000000000001",18));
});
test("No UI executable route without corroborated governance and deployment",()=>{
  const catalog={chains:{xgrchain:{chainId:1643},base:{chainId:8453}},
    infrastructure:{xgrchain:{ilnV314:{status:"unverified-not-activated"}},base:{ilnV314:{status:"unverified-not-activated"}}}};
  const asset={routes:{routes:[{name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base",activation:"pending-governance",routeId:null}]},
    deployment:{ilnV314:{status:"unverified-not-activated",routes:[{name:"xgr_to_base",gateway:null,warpRouter:null}]}}};
  assert.equal(manifestRoute(catalog,asset,"xgr_to_base").allowed,false);
});
