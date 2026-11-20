import test from "node:test";
import assert from "node:assert/strict";
import {nodeIndexSourceRead} from "./xgr-node-index-source.mjs";
const hash=x=>"0x"+x.repeat(64);
const address=x=>"0x"+x.repeat(40);
const route={sourceConfig:{chainId:56},destinationConfig:{chainId:1643}};
const txHash=hash("a"),blockHash=hash("b");
const operation={source:"bsc",destination:"xgr",messageId:hash("c"),
 sourceTxHash:txHash,sourceBlockNumber:100};
const evidence={
 sourceChainId:56,sourceBlockHash:blockHash,
 verifiedAs:"FINALIZED_SINGLE_OPERATOR_OBSERVATION_NOT_BLS_EVIDENCE",
 transaction:{hash:txHash,from:address("1")},
 receipt:{transactionHash:txHash,blockHash,blockNumber:"0x64",status:"0x1"},
 sourceBlock:{number:"0x64",hash:blockHash,timestamp:"0x65d1f190"},
 finalizedHeadBlock:{number:"0x66",hash:hash("d")}
};
test("index adapter serves only captured source observations; no external RPC",async()=>{
 const read=nodeIndexSourceRead({route,operation,evidence});
 assert.equal(await read(route.sourceConfig,"eth_chainId",[]),"0x38");
 assert.equal((await read(route.sourceConfig,"eth_getTransactionReceipt",[txHash])).blockHash,blockHash);
 assert.equal((await read(route.sourceConfig,"eth_getBlockByNumber",["finalized",false])).number,"0x66");
 assert.equal((await read(route.sourceConfig,"eth_getBlockByNumber",["0x64",false])).hash,blockHash);
 await assert.rejects(()=>read(route.destinationConfig,"eth_chainId",[]),/Destination state/);
 await assert.rejects(()=>read(route.sourceConfig,"eth_getLogs",[]),/Unindexed/);
});
test("index adapter fails closed on forged block hash or source head",()=>{
 assert.throws(()=>nodeIndexSourceRead({route,operation,
  evidence:{...evidence,sourceBlockHash:hash("f")}}),/canonically/);
 assert.throws(()=>nodeIndexSourceRead({route,operation,
  evidence:{...evidence,finalizedHeadBlock:{number:"0x63",hash:hash("d")}}}),/canonically/);
 assert.throws(()=>nodeIndexSourceRead({route,operation,
  evidence:{...evidence,verifiedAs:"BLS_CONFIRMED"}}),/canonically/);
});

test("native XGR feed is resolved solely against local XGR RPC, never a foreign chain",async()=>{
 const {projectXgrIndexedSource}=await import("./xgr-node-index-source.mjs");
 const {indexedRoutes}=await import("./transfer-index.mjs");
 const {readFileSync}=await import("node:fs");
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url)));
 const route=indexedRoutes(catalog).find(r=>r.sourceChain==="xgrchain"&&
  r.destinationChain==="base");
 assert.ok(route,"expected deployed XGR -> Base route");
 const operation={source:"xgr",destination:"base",routeId:route.routeId,
  gateway:route.gateway,messageId:hash("c"),sourceTxHash:hash("a"),sourceBlockNumber:100,
  sourceLogIndex:1};
 const evidence={sourceChainId:1643,sourceTxHash:operation.sourceTxHash,
  sourceBlockNumber:100,sourceBlockHash:hash("b"),
  verifiedAs:"FINALIZED_LOCAL_IBFT_OBSERVATION_NOT_BLS_EVIDENCE"};
 const methods=[];
 const xgrRpc=async(method,params)=>{
  methods.push(method);
  if(method==="eth_getBlockByNumber")return {number:"0x64",hash:hash("b"),timestamp:"0x65000000"};
  if(method==="eth_chainId")return "0x66b";
  throw Error("Unexpected local XGR RPC "+method);
 };
 const {event,record}=await projectXgrIndexedSource({catalog,operation,evidence,xgrRpc,
  verify:async({rpc,route,transactionHash})=>{
   assert.equal(transactionHash,operation.sourceTxHash);
   assert.equal(await rpc(route.sourceConfig,"eth_chainId",[]),"0x66b");
   await assert.rejects(()=>rpc(route.destinationConfig,"eth_chainId",[]),/Non-native/);
   return {messageId:operation.messageId,sourceTxHash:operation.sourceTxHash,
    routeId:route.routeId,delivered:null};
  }});
 assert.equal(event.blockNumber,100);
 assert.equal(record.delivered,null);
 assert.deepEqual(methods,["eth_getBlockByNumber","eth_chainId"]);
});
