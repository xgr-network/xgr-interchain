import test from "node:test";
import assert from "node:assert/strict";
import {prepareBaseFromXgr} from "./base-bootstrap-from-xgr.mjs";
test("Base snapshot preparation rejects XGR-domain proofs before any expensive deployment",async()=>{
 const a="0x"+"1".repeat(40);
 await assert.rejects(()=>prepareBaseFromXgr({
  xgrChain:{chainId:1643,rpcUrls:["https://xgr.test"]},
  baseChain:{chainId:8453,domainId:8453},
  registryAddress:a,initial:{originChainId:1643,validators:[a,a,a]},
  bootstrap:{destinationDomain:8453},snapshot:{},proofs:[{},{},{}],
  rpc:async(_,method,params)=>{
   if(method==="eth_chainId")return "0x66b";
   if(params?.[0]?.data==="0x")return "0x";
   return "0x"+"0".repeat(63)+"1";
  }
 }),/Registry identity/);
});
test("missing a validator, wrong chain or wrong verifier address blocks early",async()=>{
 await assert.rejects(()=>prepareBaseFromXgr({
  xgrChain:{chainId:1643},baseChain:{chainId:8453,domainId:8453},
  registryAddress:"0x123",initial:{originChainId:1643,validators:[]},
  bootstrap:{destinationDomain:8453},proofs:[]
 }),/Invalid pinned/);
});
