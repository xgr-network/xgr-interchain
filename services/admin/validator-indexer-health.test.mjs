import test from "node:test";
import assert from "node:assert/strict";
import {validatorRPCUrls,summarizeILNValidatorStatus,probeILNValidators} from "./validator-indexer-health.mjs";
test("Validator indexer health reports honest ready, lag and source outage separately",()=>{
 const now=1_800_000_000_000;
 const base={version:1,updatedUnix:now/1000,workerAlive:true,routes:[
  {route:"base_to_xgr",source:"base",destination:"xgr",state:"ok",sourceHead:100,
   checkpointBlock:96,leaves:6,localLeaves:6,lagLeaves:0}]};
 assert.equal(summarizeILNValidatorStatus(base,{now}).state,"ok");
 assert.equal(summarizeILNValidatorStatus({...base,routes:[{...base.routes[0],state:"catching-up",lagLeaves:2}]},{now}).state,"catching-up");
 assert.equal(summarizeILNValidatorStatus({...base,routes:[{...base.routes[0],state:"unavailable",error:"source RPC 503"}]},{now}).state,"degraded");
 assert.equal(summarizeILNValidatorStatus({...base,updatedUnix:now/1000-500},{now}).state,"stalled");
 assert.equal(summarizeILNValidatorStatus({...base,workerAlive:false},{now}).state,"stalled");
 assert.equal(summarizeILNValidatorStatus({},{now}).state,"unavailable");
});
test("Validator RPC targets are opt-in and validated before a request",()=>{
 assert.deepEqual(validatorRPCUrls({}),[]);
 assert.deepEqual(validatorRPCUrls({XITA_VALIDATOR_RPC_URLS:"http://127.0.0.1:8545,https://rpc.example.invalid,ftp://bad,https://evil@host"}),[
 "http://127.0.0.1:8545","https://rpc.example.invalid"
 ]);
});
test("Admin validator RPC probe keeps individual node outage visible",async()=>{
 const now=1_800_000_000_000;
 const urls=["http://127.0.0.1:8545","http://127.0.0.1:8546"];
 const calls=[];
 const fetcher=async(url,request)=>{
  calls.push({url,body:JSON.parse(request.body)});
  if(url.endsWith("8546"))throw Error("RPC unavailable");
  return {ok:true,text:async()=>JSON.stringify({jsonrpc:"2.0",id:1,result:{
   version:1,workerAlive:true,updatedUnix:now/1000,routes:[
    {route:"base_to_xgr",source:"base",destination:"xgr",state:"ok",
     sourceHead:100,checkpointBlock:96,leaves:1,localLeaves:1,lagLeaves:0}]
  }})};
 };
 const result=await probeILNValidators({urls,fetcher,now});
 assert.equal(result[0].state,"ok");
 assert.equal(result[1].state,"unavailable");
 assert.equal(calls[0].body.method,"xgr_getILNIndexerStatus");
 assert.deepEqual(calls[0].body.params,[]);
});

test("Merkle health preserves pending peer count without claiming final delivery",()=>{
 const now=1_800_000_000_000;
 const node=summarizeILNValidatorStatus({version:1,updatedUnix:now/1000,workerAlive:true,
  routes:[{route:"arbitrum_to_xgr",source:"arbitrum",destination:"xgrchain",
   state:"ok",sourceHead:517200480,checkpointBlock:517200480,
   leaves:1,localLeaves:1,lagLeaves:0,pendingPeers:2}]},{now});
 assert.equal(node.state,"ok");
 assert.equal(node.routes[0].pendingPeers,2);
 assert.equal(node.routes[0].checkpointBlock,517200480);
 assert.equal(node.routes[0].localLeaves,1);
});

test("XGR source alias is canonical and missing Arbitrum route cannot be healthy",()=>{
 const now=1800000000000;
 const raw={version:1,updatedUnix:now/1000,workerAlive:true,routes:[
  {route:"iln_xgr_base",source:"xgr",destination:"base",state:"ok",sourceHead:120,checkpointBlock:110,leaves:2,localLeaves:2,lagLeaves:0}]};
 const healthy=summarizeILNValidatorStatus(raw,{now,expectedSources:["xgrchain"]});
 assert.equal(healthy.state,"ok");
 assert.equal(healthy.routes[0].source,"xgrchain");
 const missing=summarizeILNValidatorStatus(raw,{now,expectedSources:["xgrchain","arbitrum"]});
 assert.equal(missing.state,"degraded");
 assert.deepEqual(missing.missingSources,["arbitrum"]);
});
