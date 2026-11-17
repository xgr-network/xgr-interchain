import test from "node:test";
import assert from "node:assert/strict";
import {Interface,keccak256,zeroPadValue} from "ethers";
import {resolveSignedDispatch} from "./recover-iln.mjs";

const mailbox="0x"+"a".repeat(40),sender="0x"+"b".repeat(40),
 recipient="0x"+"c".repeat(40),block=133969943;
const e=new Interface([
 "event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)"
]);
const hex=n=>Number(n).toString(16).padStart(8,"0");
const fakeMessage=()=> "0x"+"00".repeat(5)+hex(56)+
 sender.slice(2).padStart(64,"0")+hex(1643)+
 recipient.slice(2).padStart(64,"0")+"00".repeat(8);
const message=fakeMessage(),mid=keccak256(message);
const args={
 mailbox,sourceRouter:sender,sourceDomain:56,destDomain:1643,
 destRouter:recipient,messageId:mid,sourceBlock:block
};
const record=(body=message)=>{
 const encoded=e.encodeEventLog(e.getEvent("Dispatch"),[
  sender,1643,zeroPadValue(recipient,32),body
 ]);
 return {address:mailbox,blockNumber:block,topics:encoded.topics,data:encoded.data};
};
test("all chains use source-agnostic signed-block Dispatch bytes without a receipt",async()=>{
 let queried=0;
 const p={getLogs:async filter=>{
  queried++;
  assert.equal(filter.fromBlock,block);
  assert.equal(filter.toBlock,block);
  assert.equal(filter.address,mailbox);
  assert.equal(filter.topics.length,4);
  return [record()];
 }};
 const x=await resolveSignedDispatch({...args,sourceProvider:p});
 assert.equal(x,message);
 assert.equal(queried,1);
});
test("independent wallet may supply original public bytes and require zero source RPC calls",async()=>{
 const result=await resolveSignedDispatch({...args,suppliedMessage:message,
  sourceProvider:{getLogs:async()=>{throw Error("Source RPC must not be needed")}}});
 assert.equal(result,message);
});
test("no other message, source domain, destination router or block is accepted",async()=>{
 await assert.rejects(resolveSignedDispatch({...args,suppliedMessage:message+"00"}),/hash differs/);
 await assert.rejects(resolveSignedDispatch({...args,sourceDomain:8453,suppliedMessage:message}),/domain/);
 await assert.rejects(resolveSignedDispatch({...args,destRouter:"0x"+"d".repeat(40),suppliedMessage:message}),/router/);
 await assert.rejects(resolveSignedDispatch({...args,sourceProvider:{getLogs:async()=>[]}}),/unavailable or ambiguous/);
 await assert.rejects(resolveSignedDispatch({...args,sourceProvider:{getLogs:async()=>[record(),record()]}}),/ambiguous/);
});
test("malformed or oversized Dispatch body fails closed before RPC",async()=>{
 for(const suppliedMessage of ["0x", "0x123","0x"+"ab".repeat(65537)]){
  await assert.rejects(resolveSignedDispatch({...args,suppliedMessage}),/Malformed or oversized/);
 }
});
