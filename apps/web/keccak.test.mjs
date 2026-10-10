import test from "node:test";
import assert from "node:assert/strict";
import {keccak256,selector} from "./keccak.mjs";
import {connectWallet,formatUnits,shorten} from "./wallet-core.mjs";
test("Ethereum Keccak standard vectors and selectors",()=>{
 assert.equal(keccak256(""),"0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
 assert.equal(selector("transfer(address,uint256)"),"0xa9059cbb");
 assert.equal(selector("approve(address,uint256)"),"0x095ea7b3");
});
test("Wallet-only functions have no bridge execution authority",async()=>{
 const account="0x1111111111111111111111111111111111111111";
 const provider={request:async({method})=>{assert.equal(method,"eth_requestAccounts");return [account];}};
 assert.equal(await connectWallet(provider),account);
 assert.equal(shorten(account),"0x1111...1111");
 assert.equal(formatUnits(1123000000000000000n),"1.123");
 await assert.rejects(()=>connectWallet({request:async()=>[]}),/No authorized/);
});
