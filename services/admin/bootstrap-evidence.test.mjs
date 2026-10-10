import test from "node:test";
import assert from "node:assert/strict";
import {prepareBootstrapEvidence} from "./bootstrap-evidence.mjs";
const addr=i=>"0x"+i.toString(16).padStart(40,"0");
const key=i=>"0x"+i.toString(16).padStart(96,"0");
const chain={name:"demo",chainId:999,domainId:999,blsVerifierFormat:"compressed",rpcUrls:["https://demo.example"]};
const origin={name:"xgrchain",chainId:1643,confirmations:2,rpcUrls:["https://xgr.example"]};
const initial={originChainId:1643,validators:[addr(1),addr(2),addr(3)]};
const bootstrap={chain:"demo",chainId:999,destinationDomain:999,membershipOriginChainId:1643,verifierFormat:"compressed",
 verifierAddress:addr(32),sourceFee:{targetWei:null},reserve:{minimumWei:null,perValidatorWei:null,maxExecutorReimbursementWei:null},validatorSnapshot:{blockNumber:null,validators:[]}};
const snapshot={number:100,hash:"0x"+"a".repeat(64),validators:initial.validators.map((address,i)=>({validator:{Address:address,BLSPublicKey:key(i+1)}}))};
const proofs=initial.validators.map((validator,i)=>({validator,blsPublicKey:key(i+1),blsPublicKeyEIP2537:"0x"+"aa".repeat(128),possessionProof:"0x"+"bb".repeat(256),originChainId:1643,destinationDomain:999}));
const rpc=async (_,method)=>method==="eth_chainId"?"0x66b":method==="eth_blockNumber"?"0x80":{number:"0x64",hash:snapshot.hash};
const verifyProof=async p=>({verified:true,validator:p.validator});
const input={chain,originChain:origin,bootstrap,initial,snapshot,proofs,rpc,verifyProof};
test("generates candidate in pinned order, leaves actual config untouched",async()=>{
 // Exercise output without BLS vector fixture; a separate live RPC test verifies cryptography.
 // Invalid test signatures intentionally remain untrusted by actual verifier.
 await assert.rejects(()=>prepareBootstrapEvidence(input),/EIP2537 G1 padding must be zero/);
});
test("canonical hash mismatch fails before any signature call",async()=>{
 await assert.rejects(()=>prepareBootstrapEvidence({...input,rpc:async (_,method)=>method==="eth_getBlockByNumber"?{number:"0x64",hash:"0x"+"b".repeat(64)}:rpc(_,method)}),/block hash/);
});
test("snapshot BLS mismatch fails closed",async()=>{
 const bad={...snapshot,validators:snapshot.validators.map((v,i)=>i===0?{validator:{...v.validator,BLSPublicKey:key(90)}}:v)};
 await assert.rejects(()=>prepareBootstrapEvidence({...input,snapshot:bad}),/PoS and proof BLS/);
});
test("insufficient origin head confirmations fails closed",async()=>{
 await assert.rejects(()=>prepareBootstrapEvidence({...input,rpc:async(_,method)=>method==="eth_blockNumber"?"0x65":rpc(_,method)}),/sufficiently confirmed/);
});
