import test from "node:test";
import assert from "node:assert/strict";
import {validatorRPCUrls,summarizeILNValidatorStatus,probeILNValidators} from "./validator-indexer-health.mjs";
test("Validator indexer health reports honest ready, lag and source outage separately",()=>{
 const now=1_800_000_000_000;
 const base={version:2,updatedUnix:now/1000,workerAlive:true,routes:[
  {route:"base_to_xgr",source:"base",destination:"xgr",state:"ok",sourceHead:100,
   scanCursor:100,blockLag:0}]};
 assert.equal(summarizeILNValidatorStatus(base,{now}).state,"ok");
 assert.equal(summarizeILNValidatorStatus({...base,routes:[{...base.routes[0],state:"catching-up",scanCursor:98,blockLag:2}]},{now}).state,"catching-up");
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
   version:2,workerAlive:true,updatedUnix:now/1000,routes:[
    {route:"base_to_xgr",source:"base",destination:"xgr",state:"ok",
     sourceHead:100,scanCursor:100,blockLag:0}]
  }})};
 };
 const result=await probeILNValidators({urls,fetcher,now});
 assert.equal(result[0].state,"ok");
 assert.equal(result[1].state,"unavailable");
 assert.equal(calls[0].body.method,"xgr_getILNIndexerStatus");
 assert.deepEqual(calls[0].body.params,[]);
});

test("Direct BLS health reports source block lag independently of quorum requests",()=>{
 const now=1_800_000_000_000;
 const data={version:2,updatedUnix:now/1000,workerAlive:true,
  routes:[{route:"arbitrum_to_xgr",source:"arbitrum",destination:"xgrchain",
   state:"catching-up",sourceHead:517200480,scanCursor:517200450,blockLag:30}]};
 const node=summarizeILNValidatorStatus(data,{now});
 assert.equal(node.state,"catching-up");
 assert.equal(node.routes[0].blockLag,30);
 assert.equal(node.routes[0].scanCursor,517200450);
 assert.equal(node.routes[0].leaves,undefined);
 assert.equal(summarizeILNValidatorStatus({...data,version:1},{now}).state,"unavailable");
});
test("XGRChain source alias is normalized at the RPC boundary, not mislabeled unreachable",()=>{
 const now=1_800_000_000_000;
 const status=summarizeILNValidatorStatus({version:2,updatedUnix:now/1000,
  workerAlive:true,routes:[{route:"iln_1643_8453",source:"xgr",destination:"base",
   state:"catching-up",sourceHead:100,scanCursor:97,blockLag:3}]},{now});
 assert.equal(status.state,"catching-up");
 assert.equal(status.routes[0].source,"xgrchain");
 assert.equal(status.routes[0].blockLag,3);
});
