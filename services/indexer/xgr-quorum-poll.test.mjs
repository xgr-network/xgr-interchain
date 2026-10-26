import test from "node:test";
import assert from "node:assert/strict";
import {pollLocalQuorum,quorumPollDecision} from "./xgr-quorum-poll.mjs";
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
