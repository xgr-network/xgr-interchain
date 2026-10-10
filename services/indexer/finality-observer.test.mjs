import test from "node:test";
import assert from "node:assert/strict";
import {finalizedWindow,verifyLog,canonicalEvents,readConfirmedLogs} from "./finality-observer.mjs";
const H="0x"+"a".repeat(64),B="0x"+"b".repeat(64),T="0x"+"c".repeat(64),A="0x"+"d".repeat(40);
const log={address:A,blockNumber:"0x14",blockHash:B,transactionHash:H,logIndex:"0x0",
 topics:[T],data:"0x",removed:false};
test("confirmation depth and bounded ranges do not scan unsafe head",()=>{
 assert.deepEqual(finalizedWindow({latest:100,confirmations:12,fromBlock:85,limit:500}),
 {fromBlock:85,toBlock:88,finalizedHead:88});
 assert.equal(finalizedWindow({latest:10,confirmations:12,fromBlock:0}),null);
 assert.throws(()=>finalizedWindow({latest:-1,confirmations:0,fromBlock:0}));
});
test("only known contract and canonical block logs are accepted",()=>{
 const item=verifyLog(log,{address:A,topic0:T,fromBlock:20,toBlock:20});
 assert.equal(item.blockNumber,20);
 assert.throws(()=>verifyLog({...log,address:"0x"+"e".repeat(40)},{address:A,topic0:T,fromBlock:20,toBlock:20}));
 assert.throws(()=>verifyLog({...log,removed:true},{address:A,topic0:T,fromBlock:20,toBlock:20}));
 assert.throws(()=>canonicalEvents([item],{fromBlock:20,toBlock:20,blockHashes:[{number:20,hash:H}]}));
 assert.equal(canonicalEvents([item],{fromBlock:20,toBlock:20,blockHashes:[{number:20,hash:B}]}).length,1);
 assert.throws(()=>canonicalEvents([item,item],{fromBlock:20,toBlock:20,blockHashes:[{number:20,hash:B}]}));
});
test("read-only RPC reads finalized range and checks every block hash",async()=>{
 const calls=[];
 const rpc=async(method,params)=>{
  calls.push(method);
  if(method==="eth_blockNumber")return {result:"0x20"};
  if(method==="eth_getLogs")return {result:[log]};
  if(method==="eth_getBlockByNumber")return {result:{number:params[0],hash:B}};
  throw Error("Unexpected RPC call");
 };
 const scanned=await readConfirmedLogs({rpc,contract:A,topic0:T,fromBlock:20,confirmations:12,limit:1});
 assert.equal(scanned.events.length,1);
 assert.deepEqual(calls,["eth_blockNumber","eth_getLogs","eth_getBlockByNumber"]);
 const bad=async(method)=>({result:method==="eth_blockNumber"?"0x20":method==="eth_getLogs"?[log]:{number:"0x14",hash:H}});
 await assert.rejects(readConfirmedLogs({rpc:bad,contract:A,topic0:T,fromBlock:20,confirmations:12,limit:1}),/Orphaned/);
});
