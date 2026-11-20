import test from "node:test";
import assert from "node:assert/strict";
import {refreshNodeIndexedDeliveries,verifyIndexedDelivery}
 from "./xgr-node-index-delivery.mjs";
const hash=x=>"0x"+x.repeat(64),addr=x=>"0x"+x.repeat(40);
const route={sourceChain:"bsc",routeId:hash("a"),
 destinationConfig:{chainId:1643},destinationMailbox:addr("2")};
const row={source_chain:"bsc",route_id:route.routeId,message_id:hash("c")};
const evidence={version:1,messageId:row.message_id,destinationChainId:1643,
 destinationRouter:addr("3"),mailbox:route.destinationMailbox,
 finalizedBlockNumber:123,finalizedBlockHash:hash("b"),
 observedAt:new Date().toISOString(),delivered:true,
 evidenceStatus:"FINALIZED_READ_MODEL_NOT_BLS_EVIDENCE"};
test("Node delivery evidence is validated against the exact active destination",()=>{
 const valid=verifyIndexedDelivery({route,messageId:row.message_id,evidence});
 assert.equal(valid.delivered,true);
 assert.equal(valid.finalizedHead,123);
 assert.throws(()=>verifyIndexedDelivery({route,messageId:row.message_id,
  evidence:{...evidence,mailbox:addr("4")}}),/mismatched/);
 assert.throws(()=>verifyIndexedDelivery({route,messageId:row.message_id,
  evidence:{...evidence,delivered:false,observedAt:"2020-01-01T00:00:00Z"}}),/stale/);
});
test("SQL delivery update only occurs for finalized, indexed XGR status",async()=>{
 const queries=[],calls=[];
 const pool={query:async q=>{
  queries.push(q);
  if(q.text.includes("SELECT o.source_chain"))return {rows:[row]};
  return {rows:[]};
 }};
 const rpc=async(method,params)=>{calls.push({method,params});return evidence;};
 const result=await refreshNodeIndexedDeliveries({pool,routes:[route],rpc});
 assert.deepEqual(result,{checked:1,delivered:1,unknown:0});
 assert.deepEqual(calls,[{method:"xgr_getILNIndexedDelivery",params:["bsc",row.message_id]}]);
 assert.equal(queries.filter(q=>q.text.includes("delivered=$3")).length,1);
 const stmt=queries.find(q=>q.text.includes("delivered=$3"));
 assert.deepEqual(stmt.values.slice(0,3),[row.source_chain,row.message_id,true]);
});
test("stale Node evidence never changes existing pending delivery",async()=>{
 const statements=[],pool={query:async q=>{
  statements.push(q);
  if(q.text.includes("SELECT o.source_chain"))return {rows:[row]};
  return {rows:[]};
 }};
 const result=await refreshNodeIndexedDeliveries({pool,routes:[route],
  rpc:async()=>({...evidence,delivered:false,observedAt:"2020-01-01T00:00:00Z"})});
 assert.deepEqual(result,{checked:0,delivered:0,unknown:1});
 assert.equal(statements.filter(q=>q.text.includes("delivered=$3")).length,0);
 assert.equal(statements.filter(q=>q.text.includes("delivery_attempted_at=NOW()")).length,1);
});
