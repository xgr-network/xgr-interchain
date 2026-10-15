import test from "node:test";
import assert from "node:assert/strict";
import {selector} from "../../apps/web/keccak.js";
import {OPERATION_TOPIC} from "../../apps/web/wallet-transfers.js";
import {bridgeAmountFromTransaction,readRouteWindow,
 checkedDelivery,validateIndexedGatewayLog} from "./transfer-index.mjs";
import {routeIndexCoverage,indexedTransferRow,readWalletTransferIndex} from "./transfer-index-store.mjs";
import {commitWindow} from "./transfer-index-worker.mjs";
const address=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
const hex=n=>"0x"+BigInt(n).toString(16);
const word=n=>BigInt(n).toString(16).padStart(64,"0");
const SOURCE="sample-source",DEST="sample-destination";
const route={sourceChain:SOURCE,routeName:"source_to_dest",name:"source_to_dest",
 destinationChain:DEST,gateway:address("a"),routeId:hash("1"),
 deploymentBlock:100,asset:"T",assetId:hash("9"),destinationMailbox:address("b"),
 sourceConfig:{chainId:123,confirmations:2,rpcUrls:["https://rpc.invalid/src"]},
 destinationConfig:{chainId:456,domainId:456,confirmations:12,rpcUrls:["https://rpc.invalid/dst"]}};
function rpc(methodMap){
 return async (chain,method,args)=>{
  const fn=methodMap[method];
  if(!fn)throw Error("Unexpected RPC "+method);
  return fn(chain,args);
 };
}
test("decode canonical Gateway.bridge amount without rounding or trusting arbitrary calldata",()=>{
 const sender=address("e");
 const input=selector("bridge(uint32,bytes32,uint256)")+word(456)+
  sender.slice(2).padStart(64,"0")+word(12000000000000000000n);
 const tx={to:route.gateway,input};
 assert.equal(bridgeAmountFromTransaction(tx,route),"12000000000000000000");
 assert.equal(bridgeAmountFromTransaction({...tx,to:address("f")},route),null);
 assert.equal(bridgeAmountFromTransaction({...tx,input:"0xbad"},route),null);
 assert.equal(bridgeAmountFromTransaction({...tx,
   input:selector("bridge(uint32,bytes32,uint256)")+word(999)+
   sender.slice(2).padStart(64,"0")+word(10)},route),null);
});
test("a finalized source scan only accepts canonical Gateway operation logs",async()=>{
 const topic=hash("c");
 const log={address:route.gateway,topics:[OPERATION_TOPIC,route.routeId,topic,hash("2")],
  transactionHash:hash("d"),blockHash:hash("e"),blockNumber:hex(101),logIndex:"0x0",data:word(2)};
 const reader=rpc({
  eth_chainId:()=>hex(123),
  eth_blockNumber:()=>hex(110),
  eth_getLogs:()=>[log],
  eth_getBlockByNumber:(_,[height])=>({number:height,hash:hash("e")})
 });
 const result=await readRouteWindow({route,cursor:null,rpc:reader,limit:4});
 assert.equal(result.from,100);
 assert.equal(result.to,103);
 assert.equal(result.finalizedHead,108);
 assert.equal(result.events.length,1);
 assert.equal(result.events[0].messageId,topic);
 assert.throws(()=>validateIndexedGatewayLog({...log,removed:true},route,100,103),/Untrusted/);
 assert.throws(()=>validateIndexedGatewayLog({...log,address:address("f")},route,100,103),/Untrusted/);
});
test("known endpoint block hash mismatch forces reindex, not silent cursor advance",async()=>{
 const reader=rpc({
  eth_chainId:()=>hex(123),
  eth_blockNumber:()=>hex(110),
  eth_getBlockByNumber:(_,[height])=>({number:height,hash:hash("f")})
 });
 const result=await readRouteWindow({route,cursor:{scannedTo:106,scannedHash:hash("e")},
  rpc:reader});
 assert.equal(result.reorg,true);
 assert.equal(result.from,100);
});
test("destination delivery is read at finalized block and never guessed from latest",async()=>{
 let at=null;
 const reader=rpc({
  eth_chainId:()=>hex(456),
  eth_blockNumber:()=>hex(212),
  eth_call:(_,[call,block])=>{at=block;assert.equal(call.to,route.destinationMailbox);return "0x"+word(1);}
 });
 const result=await checkedDelivery({route,messageId:hash("d"),rpc:reader});
 assert.equal(result.delivered,true);
 assert.equal(result.finalizedHead,200);
 assert.equal(at,hex(200));
 await assert.rejects(()=>checkedDelivery({route,messageId:hash("d"),
  rpc:rpc({eth_chainId:()=>hex(999)})}),/mismatch/);
});
test("wallet index requires every configured route cursor current and reconciled",()=>{
 const now=new Date("2026-01-01T10:00:00Z").getTime();
 const routes=[route],base={
  source_chain:SOURCE,route_name:route.routeName,gateway:route.gateway,
  route_id:route.routeId,deployment_block:100,scanned_to:208,finalized_head:208,
  updated_at:new Date(now).toISOString()};
 assert.equal(routeIndexCoverage({},[base],{routeList:routes,now}).complete,true);
 assert.equal(routeIndexCoverage({},[],{routeList:routes,now}).complete,false);
 assert.equal(routeIndexCoverage({},[{...base,scanned_to:207}],{routeList:routes,now}).complete,false);
 assert.equal(routeIndexCoverage({},[{...base,updated_at:new Date(now-999999).toISOString()}],
  {routeList:routes,now}).complete,false);
});
test("DB row with unknown delivery is never advertised as pending mint",()=>{
 const row={source_chain:SOURCE,destination_chain:DEST,route_name:route.name,
  route_id:route.routeId,gateway:route.gateway,source_tx_hash:hash("3"),
  message_id:hash("4"),account:address("d"),asset:"T",source_block_number:"101",
  amount_raw:null,validator_fee_wei:null,delivered:null};
 assert.equal(indexedTransferRow(row).status,"delivery-unknown");
 assert.equal(indexedTransferRow({...row,delivered:false}).status,"awaiting-proof");
 assert.equal(indexedTransferRow({...row,delivered:true}).status,"delivered");
});
test("wallet API filters by normalized address and counts open events beyond pagination",async()=>{
 const now=Date.now(),wallet=address("d");
 const cursors=[{source_chain:SOURCE,route_name:route.name,gateway:route.gateway,route_id:route.routeId,
  deployment_block:100,scanned_to:111,finalized_head:111,
  updated_at:new Date(now).toISOString()}];
 const row={source_chain:SOURCE,destination_chain:DEST,route_name:route.name,
  route_id:route.routeId,gateway:route.gateway,source_tx_hash:hash("3"),
  message_id:hash("4"),account:wallet,asset:"T",source_block_number:"101",
  amount_raw:"42",validator_fee_wei:"10",delivered:false};
 const seen=[];
 const pool={query:async arg=>{
  const text=typeof arg==="string"?arg:arg.text;seen.push(arg);
  if(text.includes("FROM xita_transfer_index_cursors"))return {rows:cursors};
  if(text.includes("COUNT(*) FILTER"))return {rows:[{open:"7",unknown:"2"}]};
  return {rows:[row]};
 }};
 const out=await readWalletTransferIndex({},wallet.toUpperCase().replace("0X","0x"),
  {pool,routeList:[route],now,limit:1,onlyPending:true});
 assert.equal(out.status,"complete");
 assert.equal(out.openCount,7);
 assert.equal(out.unknownCount,2);
 assert.equal(out.items[0].status,"awaiting-proof");
 assert.equal(out.truncated,true);
 assert.equal(seen.find(x=>typeof x==="object"&&x.values?.length===3).values[0],wallet);
});
test("atomically persist verified canonical event and cursor, roll back on mismatched message",async()=>{
 const calls=[];
 const client={query:async arg=>{
  const text=typeof arg==="string"?arg:arg.text;
  calls.push(text);
  if(text.includes("FOR UPDATE"))return {rows:[]};
  if(text.includes("INSERT INTO xita_transfer_operations"))return {rows:[{message_id:hash("4")}]};
  return {rows:[]};
 },release:()=>{}};
 const pool={connect:async()=>client};
 const event={txHash:hash("3"),messageId:hash("4"),blockHash:hash("7"),
  logIndex:0,blockNumber:100};
 const w={from:100,to:100,events:[event],hash:hash("7"),finalizedHead:100};
 const row={sourceChain:SOURCE,destinationChain:DEST,routeName:route.name,routeId:route.routeId,
 gateway:route.gateway,asset:"T",assetId:hash("9"),account:address("d"),
 destinationMailbox:route.destinationMailbox,sourceTxHash:hash("3"),
 messageId:hash("4"),amountRaw:"1",validatorFeeWei:"1",delivered:false};
 const out=await commitWindow({pool,route,window:w,records:[row]});
 assert.equal(out.indexed,1);
 assert.equal(calls.at(-1),"COMMIT");
 const bad={...row,messageId:hash("f")};
 await assert.rejects(()=>commitWindow({pool,route,window:w,records:[bad]}),
  /do not match/);
 assert.equal(calls.at(-1),"ROLLBACK");
});
