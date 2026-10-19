import test from "node:test";
import assert from "node:assert/strict";
import {OPERATION_TOPIC} from "../../apps/web/wallet-transfers.js";
import {inspectAnnouncedTx,reconcileAnnouncedBlocks,
 processTransferAnnouncements,reopenRecentlyRejectedAnnouncements} from "./transfer-index-worker.mjs";
const addr=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
const account=addr("a"),txHash=hash("b"),blockHash=hash("c"),id=hash("d"),routeId=hash("e");
const route={sourceChain:"xgrchain",destinationChain:"base",routeName:"xgr_to_base",
 routeId,gateway:addr("1"),deploymentBlock:100,asset:"XGR",assetId:hash("f"),
 destinationMailbox:addr("3"),sourceConfig:{chainId:1643,confirmations:2,
 rpcUrls:["https://rpc.example/xgr"]},destinationConfig:{chainId:8453}};
const hint={source_chain:"xgrchain",source_tx_hash:txHash,account,attempts:0,
 first_reported_at:new Date(Date.now()-1000)};
const transaction={hash:txHash,from:account,to:route.gateway};
const operation={address:route.gateway,transactionHash:txHash,blockHash,
 blockNumber:"0x80",logIndex:"0x0",topics:[OPERATION_TOPIC,routeId,id]};
const receipt={transactionHash:txHash,from:account,to:route.gateway,
 status:"0x1",blockHash,blockNumber:"0x80",logs:[operation]};
const mock=({tx=transaction,rcpt=receipt,head="0x90",canonical=blockHash}={})=>
 async(_chain,method)=>{
  if(method==="eth_getTransactionByHash")return tx;
  if(method==="eth_getTransactionReceipt")return rcpt;
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_blockNumber")return head;
  if(method==="eth_getBlockByNumber")return {hash:canonical};
  throw Error("Unexpected RPC "+method);
 };
const validProof=async()=>({sourceChain:"xgrchain",destinationChain:"base",
 messageId:id,sourceTxHash:txHash,account,asset:"XGR",assetId:route.assetId,
 routeName:route.routeName,routeId,gateway:route.gateway,
 destinationMailbox:route.destinationMailbox,amountRaw:"1",
 validatorFeeWei:"1",delivered:false});
function db(){
 const calls=[];
 const connection={query:async arg=>{
  const str=typeof arg==="string"?arg:arg.text;calls.push({str,values:arg?.values});
  return str.includes("INSERT INTO xita_transfer_operations")?
   {rows:[{message_id:id}]}:{rows:[]};
 },release(){}};
 return {calls,query:connection.query,connect:async()=>connection};
}
test("source receipt missing means OBSERVED wallet transaction, not verified lock",async()=>{
 const pool=db();
 const state=await inspectAnnouncedTx({catalog:{},routes:[route],hint,pool,
  rpc:mock({rcpt:null})});
 assert.equal(state.status,"observed");
 assert.ok(pool.calls.some(c=>c.str.includes("UPDATE xita_transfer_announcements")));
 assert.ok(!pool.calls.some(c=>c.str.includes("INSERT INTO xita_transfer_operations")));
});
test("a claimed wallet must match independent RPC tx.from",async()=>{
 const pool=db();
 const state=await inspectAnnouncedTx({catalog:{},routes:[route],hint,pool,
  rpc:mock({tx:{...transaction,from:addr("9")}})});
 assert.equal(state.status,"rejected");
 assert.ok(!pool.calls.some(c=>c.str.includes("INSERT INTO xita_transfer_operations")));
});
test("RPC uncertainty and insufficient finality never publish a source operation",async()=>{
 const pool=db();
 const state=await inspectAnnouncedTx({catalog:{},routes:[route],hint,pool,
  rpc:mock({head:"0x80"})});
 assert.equal(state.status,"observed");
 assert.ok(!pool.calls.some(c=>c.str.includes("INSERT INTO xita_transfer_operations")));
 const retry=await inspectAnnouncedTx({catalog:{},routes:[route],hint,pool,
  rpc:mock({canonical:hash("9")})});
 assert.equal(retry.status,"reported");
});
test("exact canonical Gateway receipt fast-tracks an operation WITHOUT advancing cursor",async()=>{
 const pool=db();
 const state=await inspectAnnouncedTx({catalog:{},routes:[route],hint,pool,
  rpc:mock(),verify:validProof});
 assert.equal(state.status,"indexed");assert.equal(state.messageId,id);
 const insert=pool.calls.find(c=>c.str.includes("INSERT INTO xita_transfer_operations"));
 assert.ok(insert);assert.equal(insert.values[2],txHash);
 assert.equal(insert.values[3],128);assert.equal(insert.values[4],blockHash);
 assert.ok(pool.calls.some(c=>c.str==="COMMIT"));
 assert.equal(pool.calls.some(c=>c.str.includes("INSERT INTO xita_transfer_index_cursors")),false);
});
test("invalid or ambiguous Gateway evidence cannot become a confirmed transfer",async()=>{
 const pool=db();
 const none=await inspectAnnouncedTx({catalog:{},routes:[route],hint,pool,
  rpc:mock({rcpt:{...receipt,logs:[]}}),verify:validProof});
 assert.equal(none.status,"rejected");
 const duplicate=await inspectAnnouncedTx({catalog:{},routes:[route],hint,pool,
  rpc:mock({rcpt:{...receipt,logs:[operation,operation]}}),verify:validProof});
 assert.equal(duplicate.status,"rejected");
 assert.ok(!pool.calls.some(c=>c.str.includes("INSERT INTO xita_transfer_operations")));
});
test("source reorg retracts ONLY matching derived hash and restages it",async()=>{
 const row={source_chain:"xgrchain",source_tx_hash:txHash,account,
  route_id:routeId,verified_block_number:128,
  verified_block_hash:blockHash,verified_message_id:id};
 const pool=db();const orig=pool.query;
 pool.query=async arg=>{
  if(arg.text?.includes("SELECT a.source_chain"))return {rows:[row]};
  return orig(arg);
 };
 const result=await reconcileAnnouncedBlocks({pool,routes:[route],
  rpc:mock({canonical:hash("9")})});
 assert.equal(result.retracted,1);
 assert.ok(pool.calls.some(c=>c.str.includes("DELETE FROM xita_transfer_operations")));
 assert.ok(pool.calls.some(c=>c.str.includes("state='reported'")));
});
test("missing RPC block response is unknown, NEVER a reorg deletion",async()=>{
 const row={source_chain:"xgrchain",source_tx_hash:txHash,account,
  route_id:routeId,verified_block_number:128,
  verified_block_hash:blockHash,verified_message_id:id};
 const pool=db();const orig=pool.query;
 pool.query=async arg=>{
  if(arg.text?.includes("SELECT a.source_chain"))return {rows:[row]};
  return orig(arg);
 };
 const result=await reconcileAnnouncedBlocks({pool,routes:[route],
  rpc:mock({canonical:null})});
 assert.equal(result.retracted,0);
 assert.equal(pool.calls.some(c=>c.str.includes("DELETE FROM xita_transfer_operations")),false);
});
test("untrusted hash queue is strictly bounded",async()=>{
 const pool={query:async()=>({rows:[]})};
 const x=await processTransferAnnouncements({catalog:{},routes:[route],
  pool,rpc:mock(),limit:12});
 assert.equal(x.selected,0);
 await assert.rejects(()=>processTransferAnnouncements({
  catalog:{},routes:[route],pool,rpc:mock(),limit:100}),/Unsafe/);
});

test("wrapped wallet target is accepted only with matching fee adapter evidence",async()=>{
 const wrapper=addr("9"),feeAdapter=addr("2"),configured={...route,executionAdapter:feeAdapter};
 const tx={...transaction,to:wrapper},rcpt={...receipt,to:wrapper};
 const success=await inspectAnnouncedTx({catalog:{},routes:[configured],hint,pool:db(),
  rpc:mock({tx,rcpt}),verify:async()=>({...await validProof(),
   executionAdapter:feeAdapter,interchainFeeWei:"20"})});
 assert.equal(success.status,"indexed");
 const failure=await inspectAnnouncedTx({catalog:{},routes:[configured],hint,pool:db(),
  rpc:mock({tx,rcpt}),verify:validProof});
 assert.equal(failure.status,"rejected");
 const pending=await inspectAnnouncedTx({catalog:{},routes:[configured],hint,pool:db(),
  rpc:mock({tx,rcpt:null})});
 assert.equal(pending.status,"reported");
});

test("recently rejected announcements can be restaged without trusting them",async()=>{
 const calls=[],pool={query:async arg=>{calls.push(arg);return {rows:[{source_tx_hash:txHash}]}}};
 assert.equal(await reopenRecentlyRejectedAnnouncements({pool}),1);
 assert.match(calls[0].text,/state='rejected'/);
 assert.match(calls[0].text,/NOT EXISTS/);
 assert.match(calls[0].text,/state='reported'/);
 await assert.rejects(()=>reopenRecentlyRejectedAnnouncements({pool,limit:201}),/Unsafe repair limit/);
});
