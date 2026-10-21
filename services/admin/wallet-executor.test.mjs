import test from "node:test";
import assert from "node:assert/strict";
import {isObservedWalletExecutor,isVerifiedRouterCreator,METAMASK_WALLET_EXECUTOR} from "./wallet-executor.mjs";
const wallet="0x6a6415aa1c945ee437336c136c2de9e8bab1f05e";
test("Arbitrum and Base recognize observed delegated wallet executor",()=>{
 for(const chainId of [42161,8453]){
  assert.equal(isObservedWalletExecutor(chainId,METAMASK_WALLET_EXECUTOR),true);
  assert.equal(isVerifiedRouterCreator(chainId,METAMASK_WALLET_EXECUTOR,wallet),true);
  assert.equal(isVerifiedRouterCreator(chainId,wallet,wallet),true);
 }
});
test("other chains and unrelated creators cannot be impersonated",()=>{
 for(const chainId of [1643,137,1,10])
  assert.equal(isObservedWalletExecutor(chainId,METAMASK_WALLET_EXECUTOR),false);
 assert.equal(isVerifiedRouterCreator(42161,"0x"+"f".repeat(40),wallet),false);
 assert.equal(isVerifiedRouterCreator(8453,"0x"+"f".repeat(40),wallet),false);
});
