import test from "node:test";
import assert from "node:assert/strict";
import {checkLiveActivation,pendingLiveRouteTasks} from "./route-live.mjs";
const addr=n=>"0x"+n.toString(16).padStart(40,"0");
const word=n=>BigInt(n).toString(16).padStart(64,"0");
const task={kind:"activation",id:"XGR:xgr_to_base:activate",asset:"XGR",
 chain:"xgrchain",routeId:"0x"+"a".repeat(64),destinationDomain:8453,
 gateway:addr(7),router:addr(9),blockers:[]};
const chain={name:"xgrchain",chainId:1643,rpcUrls:["https://xgr.invalid"]};
const infra={name:"xgrchain",components:[{key:"sourceRegistry",address:addr(10)}]};
function mock(enabled){
 return async(_url,method)=>{
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_call")return "0x"+[
   word(1643),word(1643),word(7),word(9),word(1),word(2),
   word(11),word(enabled?123:0),word(enabled?1:0)
  ].join("");
  throw Error("unexpected RPC method");
 };
}
test("receipt alone cannot mark route active; live Registry enabled flag is required",async()=>{
 const a=await checkLiveActivation(task,chain,infra,mock(false));
 assert.equal(a.enabled,false);
 const pending=await pendingLiveRouteTasks([task],[chain],[infra],mock(false));
 assert.equal(pending.length,1);
 assert.equal(pending[0].status,"requires-validator-quorum");
 const live=await pendingLiveRouteTasks([task],[chain],[infra],mock(true));
 assert.equal(live.length,0);
});
test("malformed route response and wrong source chain fail closed",async()=>{
 await assert.rejects(()=>checkLiveActivation(task,chain,infra,async()=> "0x"),/Malformed|RPC/);
 const wrong=async(_,method)=>method==="eth_chainId"?"0x2105":"0x";
 await assert.rejects(()=>checkLiveActivation(task,chain,infra,wrong),/chain identity/);
 const pending=await pendingLiveRouteTasks([task],[chain],[infra],wrong);
 assert.equal(pending.length,1);
 assert.equal(pending[0].status,"activation-state-unverified");
});
