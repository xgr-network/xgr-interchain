import test from "node:test";
import assert from "node:assert/strict";
import {keccak256,toUtf8Bytes} from "ethers";
import {branchRoot,zeroHashes} from "./merkle.mjs";
import {verifyV320ReplicaProof,verifyV320FeeAllocation} from "./iln-v320-proof.mjs";

const messageId=keccak256(toUtf8Bytes("pending 0.5 wXGR message"));
const siblings=zeroHashes();
const root=branchRoot(messageId,siblings,0);
const routeId="0x"+"9".repeat(64);
const registry="0x"+"1".repeat(40);
const hook="0x"+"2".repeat(40);
const route="iln_8453_1643_"+routeId.slice(2);
const attestation={
 chain:route,routeId,authorizedMessageId:messageId,
 sourceBlockNumber:1,index:0,setId:3,root,payload:"0xabcdef",
 registry,validatorFeeWei:"100000000000000000",
};
const response={
 route,messageId,originChainId:8453,merkleTreeHook:hook,
 root,checkpointBlock:128,checkpointIndex:0,messageIndex:0,
 merkleProof:siblings,quorum:{...attestation},
};
const verify=(data=response,attest=attestation)=>verifyV320ReplicaProof({
 response:data,attestation:attest,route,messageId,sourceChainId:8453n,hook,
});

test("v3.2.0 validator-native proof matches current BLS payload and Merkle root",()=>{
 const result=verify();
 assert.equal(result.checkpointBlock,128);
 assert.equal(result.messageIndex,0);
 assert.equal(result.checkpointIndex,0);
 assert.deepEqual(result.proof,siblings);
});
test("source transaction block and signed insertion sequence are independent",()=>{
 assert.equal(Number(attestation.sourceBlockNumber),1);
 assert.equal(verify().checkpointBlock,128);
});
test("reject foreign validator route, signed root, message or current set",()=>{
 for(const invalid of [
  {...response,route:"base_to_xgr"},
  {...response,messageId:"0x"+"a".repeat(64)},
  {...response,originChainId:1643},
  {...response,merkleTreeHook:registry},
  {...response,root:"0x"+"b".repeat(64)},
  {...response,checkpointBlock:0},
  {...response,checkpointIndex:1},
  {...response,quorum:{...attestation,setId:4}},
  {...response,quorum:{...attestation,payload:"0x112233"}},
  {...response,messageIndex:1},
  {...response,merkleProof:[...siblings.slice(0,31)]},
  {...response,merkleProof:["bad",...siblings.slice(1)]},
  {...response,merkleProof:["0x"+"c".repeat(64),...siblings.slice(1)]},
 ]) assert.throws(()=>verify(invalid),/proof|checkpoint|identity|quorum|route|source/i);
 assert.throws(()=>verify(response,{...attestation,index:1}),/index/i);
});
test("original paid source fee may differ from checkpoint fee when governance changes",()=>{
 assert.equal(verifyV320FeeAllocation({
  originalFeeWei:100n,checkpointFeeWei:200n,allocated:true,setId:3,
 }),true);
 assert.equal(verifyV320FeeAllocation({
  originalFeeWei:200n,checkpointFeeWei:100n,allocated:true,setId:2,
 }),true);
 for(const bad of [
  {originalFeeWei:0n,checkpointFeeWei:100n,allocated:true,setId:3},
  {originalFeeWei:100n,checkpointFeeWei:0n,allocated:true,setId:3},
  {originalFeeWei:100n,checkpointFeeWei:100n,allocated:false,setId:3},
  {originalFeeWei:100n,checkpointFeeWei:100n,allocated:true,setId:0},
 ]) assert.throws(()=>verifyV320FeeAllocation(bad),/fee|Vault/i);
});

test("newer independently verified identical Hook prefix remains valid for an older signed checkpoint",()=>{
 const proof=verify({...response,checkpointBlock:160});
 assert.equal(proof.checkpointBlock,160);
 assert.equal(proof.checkpointIndex,0);
 assert.throws(()=>verify({...response,checkpointBlock:0}),/checkpoint/i);
 assert.throws(()=>verify({...response,checkpointBlock:160,root:"0x"+"b".repeat(64)}),/root/i);
});
