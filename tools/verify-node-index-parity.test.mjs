import test from "node:test";
import assert from "node:assert/strict";
import {nodeChainName,makeNodeIndexRpc,readCompleteNodeSource}
 from "./verify-node-index-parity.mjs";
const hash=x=>"0x"+x.repeat(64);
const addr=x=>"0x"+x.repeat(40);
const mockOperation=(cursor,messageId)=>({
 source:"bsc",messageId,sourceTxHash:hash("c"),routeId:hash("d"),
 gateway:addr("1"),sourceBlockNumber:999,cursor,
 evidenceStatus:"UNTRUSTED_FINALITY_BOUNDED_HINT"
});
const coverage={version:1,source:"bsc",complete:true,state:"complete",
 indexedKnown:true,sourceHeadKnown:true,indexedTo:1000,sourceHead:1000};
test("node read-index adapter requires no external chain RPC",async()=>{
 assert.equal(nodeChainName("xgrchain"),"xgr");
 assert.equal(nodeChainName("bsc"),"bsc");
 assert.throws(()=>makeNodeIndexRpc({url:"http://example.com"}),/HTTPS or loopback/);
 assert.throws(()=>makeNodeIndexRpc({url:"https://user:pass@example.com"}),/HTTPS or loopback/);
 const calls=[];
 const rpc=makeNodeIndexRpc({url:"http://127.0.0.1:8545",fetcher:async(_url,options)=>{
  const request=JSON.parse(options.body);calls.push(request);
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:request.id,
   result:{version:1,source:"bsc",operations:[]}})};
 }});
 await assert.rejects(()=>rpc("eth_getLogs",[]),/Unexpected/);
 const result=await rpc("xgr_getILNIndexedOperations",["bsc","",100]);
 assert.deepEqual(result.operations,[]);
 assert.deepEqual(calls.map(c=>c.method),["xgr_getILNIndexedOperations"]);
});
test("node source feed ingests monotone identity pages, not message-hash order",async()=>{
 const first=mockOperation("00000000000000000001",hash("f"));
 const second=mockOperation("00000000000000000002",hash("a"));
 let pages=0;
 const rpc=async(method,params)=>{
  if(method==="xgr_getILNIndexedCoverage")return coverage;
  assert.equal(method,"xgr_getILNIndexedOperations");
  pages++;
  if(pages===1){
   assert.equal(params[1],"");
   return {version:1,source:"bsc",operations:[first,second]};
  }
  throw Error("Unexpected extra page");
 };
 const result=await readCompleteNodeSource({source:"bsc",rpc});
 assert.equal(result.operations.size,2);
 assert.deepEqual([...result.operations.keys()],[hash("f"),hash("a")]);
 assert.equal(pages,1);
});
test("missing coverage, bad cursor or malformed record blocks migration",async()=>{
 await assert.rejects(()=>readCompleteNodeSource({source:"bsc",
  rpc:async()=>({...coverage,complete:false})}),/incomplete/);
 const broken=mockOperation("00000000000000000001",hash("f"));
 const rpc=async(method)=>{
  if(method==="xgr_getILNIndexedCoverage")return coverage;
  return {version:1,source:"bsc",operations:[broken,{...broken,sourceTxHash:hash("e")}]};
 };
 await assert.rejects(()=>readCompleteNodeSource({source:"bsc",rpc}),/not monotone/);
});
