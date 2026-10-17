import test from "node:test";
import assert from "node:assert/strict";
import {Wallet,keccak256,Interface} from "ethers";
import {deliverManagedMessage} from "./delivery.mjs";
const h=x=>"0x"+x.repeat(64),address=x=>"0x"+x.repeat(40);
const wallet=new Wallet("0x"+"11".repeat(32));
const entry={sourceTxHash:h("a"),messageId:h("b"),destinationTxHash:null};
const processData=new Interface(["function process(bytes metadata,bytes message)"])
 .encodeFunctionData("process",["0x01","0x02"]);
const signedRaw=await wallet.signTransaction({to:address("3"),value:0n,nonce:1,
 chainId:8453,type:2,gasLimit:400000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:100000000n,
 data:processData});
const signed={raw:signedRaw,hash:keccak256(signedRaw)};
function options(patch={}){
 const calls=[];
 return {calls,params:{destinationChainId:8453,destinationMailbox:address("2"),
  getDelivered:async()=>false,
  getProof:async()=>({status:"READY_UNSIGNED_CALL",messageId:entry.messageId,
   destinationMailbox:address("2"),destinationChainId:8453,value:"0x0",data:processData}),
  signTransaction:async()=>{calls.push("sign");return signed},
  persist:async()=>{calls.push("persist")},
  broadcastRaw:async()=>{calls.push("broadcast")},
  getPreviousTx:async()=>{calls.push("previous");return "pending"},
  ...patch}};
}
test("persist signed transaction before broadcasting, never sign twice",async()=>{
 const o=options(),result=await deliverManagedMessage(entry,o.params);
 assert.equal(result.destinationTxHash,signed.hash.toLowerCase());
 assert.deepEqual(o.calls,["sign","persist","broadcast","persist"]);
 const resumed=options(),r=await deliverManagedMessage(result,resumed.params);
 assert.equal(r.status,"DESTINATION_TX_PENDING");
 assert.deepEqual(resumed.calls,["previous"]);
});
test("after crash rebroadcast exact same signed tx without taking a new nonce",async()=>{
 const o=options({getPreviousTx:async()=>"absent"});
 const result=await deliverManagedMessage({...entry,
  destinationTxHash:signed.hash,signedRawTransaction:signed.raw},o.params);
 assert.equal(result.status,"BROADCAST_EXISTING_TRANSACTION");
 assert.deepEqual(o.calls,["broadcast","persist"]);
});
test("do not send or sign after any third-party delivery",async()=>{
 const o=options({getDelivered:async()=>true});
 const result=await deliverManagedMessage(entry,o.params);
 assert.equal(result.status,"DELIVERED");
 assert.deepEqual(o.calls,["persist"]);
});
test("on uncertain mailbox state never send",async()=>{
 const o=options({getDelivered:async()=>null});
 await assert.rejects(()=>deliverManagedMessage(entry,o.params),/unavailable/);
 assert.deepEqual(o.calls,[]);
});
test("if validator quorum pending, do not broadcast or second-source-lock",async()=>{
 const o=options({getProof:async()=>({status:"PENDING"})});
 const result=await deliverManagedMessage(entry,o.params);
 assert.equal(result.status,"WAITING_VALIDATOR_PROOF");
 assert.deepEqual(o.calls,[]);
});
test("unsigned destination calldata is strictly message/chain/mailbox bound",async()=>{
 const o=options({getProof:async()=>({status:"READY_UNSIGNED_CALL",
  messageId:h("c"),destinationMailbox:address("2"),
  destinationChainId:8453,value:"0x0",data:processData})});
 await assert.rejects(()=>deliverManagedMessage(entry,o.params),/does not match/);
 assert.deepEqual(o.calls,[]);
});
test("failed destination tx requires human review, never automatic new gas nonce",async()=>{
 const o=options({getPreviousTx:async()=>"failed"});
 const result=await deliverManagedMessage({...entry,
  destinationTxHash:signed.hash,signedRawTransaction:signed.raw},o.params);
 assert.equal(result.status,"DESTINATION_REVERTED_MANUAL_REVIEW");
 assert.deepEqual(o.calls,["persist"]);
});
