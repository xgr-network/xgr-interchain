import test from "node:test";
import assert from "node:assert/strict";
import {readManagedIndex,scanManagedWindow} from "./managed-indexer.mjs";
import {managedDispatchTopic} from "./managed-index.mjs";
const h=x=>"0x"+x.repeat(64),a=x=>"0x"+x.repeat(40);
const receipt={status:1,hash:h("1"),blockHash:h("2"),blockNumber:51,logs:[]};
const record={sourceChain:"xgrchain",messageId:h("3"),sourceTxHash:h("1"),
 sourceBlockHash:h("2"),gateway:a("c"),routeId:h("4"),payer:a("5"),
 serviceFeeWei:"22",destinationChain:"base",delivered:null};
function provider({wrongChain=false,missingReceipt=false,wrongHash=false}={}){
 const p={calls:[],getNetwork:async()=>({chainId:wrongChain?1n:1643n}),
 getBlockNumber:async()=>200,getBlock:async block=>({hash:wrongHash?h("a"):h("f")}),
 getTransactionReceipt:async()=>missingReceipt?null:receipt,
 getLogs:async filter=>{
  p.calls.push(filter);
  return filter.fromBlock<=51&&filter.toBlock>=51?[{
    removed:false,topics:[managedDispatchTopic,record.messageId],
    transactionHash:receipt.hash,blockHash:receipt.blockHash,
    address:a("b"),blockNumber:51
   }]:[];
 }};return p;
}
test("single operator address scans all token routes using ONE filtered chain window",async()=>{
 const rpc=provider();
 // No token-specific route scan; event ID and adapter address are sufficient.
 assert.equal((await readManagedIndex("/nonexistent/xita-operator-index-"+Date.now())).schema,
  "xita-managed-relay-index-v1");
 const catalog={chains:{xgrchain:{chainId:1643}}};
 const output=await scanManagedWindow({catalog,index:{
  schema:"xita-managed-relay-index-v1",cursors:{},operations:{}},
  sourceChain:"xgrchain",provider:rpc,executionAddress:a("b"),
  deploymentBlock:50,parseReceipt:()=>record,
  readFeeReceipt:async()=>({exists:true,payer:record.payer,
   gateway:record.gateway,relayerFeeWei:22n})});
 assert.equal(output.indexed,1);
 assert.equal(output.index.cursors.xgrchain.to,199);
 assert.equal(Object.keys(output.index.operations).length,1);
 assert.equal(rpc.calls.length,1);
 assert.equal(rpc.calls[0].address,a("b"));
 assert.deepEqual(rpc.calls[0].topics,[managedDispatchTopic]);
});
test("wrong-chain source endpoint fails before scanning any logs",async()=>{
 const rpc=provider({wrongChain:true}),catalog={chains:{xgrchain:{chainId:1643}}};
 await assert.rejects(()=>scanManagedWindow({catalog,
  index:{schema:"xita-managed-relay-index-v1",cursors:{},operations:{}},
  sourceChain:"xgrchain",provider:rpc,executionAddress:a("b"),deploymentBlock:50
 }),/wrong chain/);
 assert.equal(rpc.calls.length,0);
});
test("a stale contract identity never silently inherits another deployment cursor",async()=>{
 const index={schema:"xita-managed-relay-index-v1",operations:{},
  cursors:{xgrchain:{contract:a("9"),deploymentBlock:50,to:51,hash:h("f")}}};
 await assert.rejects(()=>scanManagedWindow({catalog:{chains:{xgrchain:{chainId:1643}}},
  index,sourceChain:"xgrchain",provider:provider(),executionAddress:a("b"),
  deploymentBlock:50}),/identity changed/);
});
test("missing state is reconstructed from deployment block rather than assuming empty",async()=>{
 const index={schema:"xita-managed-relay-index-v1",cursors:{},operations:{}};
 const rpc=provider();
 const out=await scanManagedWindow({catalog:{chains:{xgrchain:{chainId:1643}}},
  index,sourceChain:"xgrchain",provider:rpc,executionAddress:a("b"),
  deploymentBlock:100});
 assert.equal(out.scanned,true);
 assert.equal(out.from,100);
 assert.equal(out.indexed,0);
 assert.equal(out.index.cursors.xgrchain.to,200);
});
