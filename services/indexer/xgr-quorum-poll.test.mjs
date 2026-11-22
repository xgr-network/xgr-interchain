import test from "node:test";
import assert from "node:assert/strict";
import {pollLocalQuorum,requestIndexedQuorum,quorumPollDecision} from "./xgr-quorum-poll.mjs";
const messageId="0x"+"a".repeat(64),route="iln_8453_1643_"+"b".repeat(64);
test("local-only quorum poll calls the XGR RPC method and never requests L2 data",async()=>{
 const methods=[];
 const status=await pollLocalQuorum({route,messageId,url:"http://127.0.0.1:8545",
  fetcher:async (url,options)=>{
   assert.equal(url,"http://127.0.0.1:8545");
   const body=JSON.parse(options.body);
   methods.push(body.method);
   assert.deepEqual(body.params,[route,messageId]);
   return {ok:true,json:async()=>({result:{route,messageId,status:"PARTIAL_QUORUM"}})};
  }});
 assert.equal(status,"PARTIAL_QUORUM");
 assert.deepEqual(methods,["xgr_getILNQuorum"]);
 assert.equal(quorumPollDecision(status,{lastFullCheckMs:100000,now:110000}),"wait");
 assert.equal(quorumPollDecision("AVAILABLE_UNVERIFIED",{lastFullCheckMs:100000,now:110000}),"verify");
});
test("public L2 RPC URLs are forbidden and untrusted status is rejected",async()=>{
 await assert.rejects(pollLocalQuorum({route,messageId,url:"https://mainnet.base.org"}));
 await assert.rejects(pollLocalQuorum({route,messageId,fetcher:async()=>({ok:true,json:async()=>({result:{route,messageId,status:"READY"}})})}));
 assert.equal(quorumPollDecision("EXPIRED_RETRY",{lastFullCheckMs:100000,now:110000}),"wait");
 assert.equal(quorumPollDecision("PENDING",{lastFullCheckMs:100000,now:300000}),"verify");
});

test("indexed canonical locator is admitted only through loopback XGR, no external RPC",async()=>{
 const hashTx="0x"+"c".repeat(64),block=134450134,calls=[];
 const result=await requestIndexedQuorum({route,messageId,sourceBlock:block,sourceTxHash:hashTx,
  url:"http://127.0.0.1:8545",fetcher:async(url,options)=>{
   assert.equal(url,"http://127.0.0.1:8545");
   const body=JSON.parse(options.body);
   calls.push(body);
   assert.equal(body.method,"xgr_requestILNQuorumWithSourceTx");
   assert.deepEqual(body.params,[route,messageId,block,hashTx]);
   return {ok:true,json:async()=>({result:{route,messageId,sourceBlockNumber:block,status:"PENDING"}})};
  }});
 assert.equal(result,"PENDING");
 assert.equal(calls.length,1);
});
test("untrusted or invalid indexed locators cannot reach the validator",async()=>{
 const hashTx="0x"+"c".repeat(64);
 let called=0;
 const fetcher=async()=>{called++;throw Error("must not reach RPC");};
 for(const invalid of [
  {sourceBlock:0},{sourceBlock:1.1},{sourceBlock:Number.MAX_SAFE_INTEGER+1},
  {sourceTxHash:"0x"+"0".repeat(64)},{messageId:"0x"+"0".repeat(64)},
  {route:"iln_56_1643_"+("0".repeat(64))+"bad"},
  {url:"https://rpc.xgr.network"}
 ]){
  await assert.rejects(requestIndexedQuorum({route,messageId,sourceBlock:134450134,
   sourceTxHash:hashTx,url:"http://127.0.0.1:8545",fetcher,...invalid}));
 }
 assert.equal(called,0);
});
test("local admission must not accept incorrect identity or method success",async()=>{
 await assert.rejects(requestIndexedQuorum({route,messageId,sourceBlock:134450134,
  sourceTxHash:"0x"+"c".repeat(64),fetcher:async()=>({
   ok:true,json:async()=>({result:{route,messageId,sourceBlockNumber:134450133,status:"PENDING"}})
  })}),/Invalid local ILN quorum admission/);
});
