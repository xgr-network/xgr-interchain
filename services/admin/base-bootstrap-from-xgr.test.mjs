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

test("positive: canonical XGR Registry V3, finalized snapshot and Base 8453 proofs yield precheck-only candidate",async()=>{
 // Crypto is mocked here; the real CLI still calls the native verifier by eth_call.
 const {selector}=await import("../../apps/web/keccak.mjs");
 const addresses=["0x"+"1".repeat(40),"0x"+"2".repeat(40),"0x"+"3".repeat(40)];
 const key="0xb56b72d028aa6d063d36917f9f18a3ee4b216e22694a701814af4fd55e6cbbe99209fc1359012e4733987ebdd0123e88";
 const eipKey="0x00000000000000000000000000000000156b72d028aa6d063d36917f9f18a3ee4b216e22694a701814af4fd55e6cbbe99209fc1359012e4733987ebdd0123e88000000000000000000000000000000000ff4b97c544a6915099d22d4b5abb6b35a3290cba39def4a1a8b902df5d94d9bc6bd98fe2f183e24fa16e41072de97fc";
 const w=n=>BigInt(n).toString(16).padStart(64,"0");
 const validatorABI="0x"+w(1)+w(96)+w(150000)+w(48)+key.slice(2).padEnd(128,"0");
 const origin={name:"xgrchain",chainId:1643,domainId:1643,confirmations:12,
  rpcUrls:["https://rpc.xgr.test"],blsVerifierFormat:"compressed"};
 const base={name:"base",chainId:8453,domainId:8453,confirmations:12,
  rpcUrls:["https://rpc.base.test"],blsVerifierFormat:"eip2537"};
 const bootstrap={chain:"base",chainId:8453,destinationDomain:8453,
  membershipOriginChainId:1643,verifierFormat:"eip2537",
  validatorSnapshot:{blockNumber:null,validators:[]},reserve:{}};
 const initial={originChainId:1643,validators:addresses};
 const blockHash="0x"+"a".repeat(64);
 const snapshot={number:101,hash:blockHash,validators:addresses.map(a=>({
  validator:{Address:a,BLSPublicKey:key}}))};
 const proofs=addresses.map(a=>({
  validator:a,originChainId:1643,destinationDomain:8453,
  blsPublicKey:key,blsPublicKeyEIP2537:eipKey,
  possessionProof:"0x"+"00".repeat(256), // structurally valid mock only
  payload:"0x"+Buffer.from("XGR_INTERCHAIN_BOOTSTRAP_V1").toString("hex")+
   "000000000000066b"+"00002105"+a.slice(2).toLowerCase()+
   "0030"+key.slice(2)+"0080"+eipKey.slice(2)
 }));
 const calls=[];
 const registry="0x"+"9".repeat(40);
 const rpc=async(url,method,args)=>{
  calls.push({url,method,args});
  if(url!=="https://rpc.xgr.test")throw Error("must only read actual origin RPC");
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_blockNumber")return "0x78"; // 120
  if(method==="eth_getBlockByNumber")return {number:"0x65",hash:blockHash};
  if(method==="eth_call"){
   const to=args[0].to.toLowerCase(),data=args[0].data;
   if(to===registry.toLowerCase()){
    if(data===selector("destinationDomain()"))return "0x"+w(1643);
    if(data===selector("originChainId()"))return "0x"+w(1643);
    if(data===selector("registryVersion()"))return "0x"+w(3);
    if(data===selector("setId()"))return "0x"+w(1);
    if(data.startsWith(selector("getValidator(address)")))return validatorABI;
    throw Error("unexpected XGR registry getter");
   }
   if(to==="0x0000000000000000000000000000000000002040"){
    assert.ok(data.startsWith(selector("verify(bytes,bytes[],bytes,bytes)")));
    return "0x"+w(1);
   }
   throw Error("unexpected verifier target");
  }
  throw Error("unexpected rpc method "+method);
 };
 const result=await prepareBaseFromXgr({
  xgrChain:origin,baseChain:base,registryAddress:registry,
  initial,bootstrap,snapshot,proofs,rpc});
 assert.equal(result.report.verifiedValidatorCount,3);
 assert.equal(result.registry.setId,"1");
 assert.equal(result.registry.validators.length,3);
 assert.equal(result.candidate.validatorSnapshot.blockNumber,101);
 assert.equal(result.candidate.validatorSnapshot.validators[2].destinationDomain,8453);
 assert.equal(result.proofMode,"xgr-native-precheck-only");
 assert.equal(result.destinationVerifierVerified,false);
 assert.equal(result.deploymentAuthorized,false);
 assert.equal(calls.filter(x=>x.method==="eth_call"&&x.args[0].to===registry).length,7);
 assert.equal(calls.filter(x=>x.method==="eth_call"&&
  x.args[0].to==="0x0000000000000000000000000000000000002040").length,3);
});
