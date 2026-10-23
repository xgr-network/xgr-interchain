import test from "node:test";
import assert from "node:assert/strict";
import {routeIndexCoverage,indexedTransferRow,linkIndexedJourneys,readWalletTransferIndex} from "./transfer-index-store.mjs";
const addr=n=>"0x"+n.repeat(40),hash=n=>"0x"+n.repeat(64);
test("same directional route name across different token projects NEVER shares a cursor",()=>{
 const routes=[
  {sourceChain:"xgrchain",destinationChain:"base",routeName:"xgr_to_base",
   routeId:hash("a"),gateway:addr("1"),deploymentBlock:10},
  {sourceChain:"xgrchain",destinationChain:"base",routeName:"xgr_to_base",
   routeId:hash("b"),gateway:addr("2"),deploymentBlock:20}
 ];
 const when=new Date("2026-10-15T10:00:00Z"),now=when.getTime();
 const cursors=routes.map((r,i)=>({
  source_chain:r.sourceChain,route_name:r.routeName,route_id:r.routeId,
  gateway:r.gateway,deployment_block:r.deploymentBlock,
  scanned_to:50+i,finalized_head:50+i,updated_at:when
 }));
 const verified=routeIndexCoverage({},cursors,{routeList:routes,now});
 assert.equal(verified.complete,true);
 assert.equal(verified.indexedRoutes,2);
 const swapped=[{...cursors[0],route_id:hash("b")},cursors[1]];
 const ambiguous=routeIndexCoverage({},swapped,{routeList:routes,now});
 assert.equal(ambiguous.complete,false);
 assert.equal(ambiguous.indexedRoutes,1);
});
test("unknown target delivered state remains UNKNOWN and never invents successful mint",()=>{
 const base={account:addr("a"),asset:"XGR",source_chain:"xgrchain",
  destination_chain:"base",route_name:"xgr_to_base",route_id:hash("f"),
  gateway:addr("1"),source_tx_hash:hash("c"),message_id:hash("d"),
  source_block_number:50,amount_raw:"100",validator_fee_wei:"1"};
 assert.equal(indexedTransferRow({...base,delivered:null}).status,"delivery-unknown");
 assert.equal(indexedTransferRow({...base,delivered:false}).status,"awaiting-proof");
 assert.equal(indexedTransferRow({...base,delivered:true}).status,"delivered");
});

test("confirmed first hop with signed onward route stays open, never claims completion",()=>{
 const r={account:addr("a"),asset:"XGR",source_chain:"base",
  destination_chain:"xgrchain",route_name:"base_to_xgr",route_id:hash("e"),
  gateway:addr("1"),source_tx_hash:hash("c"),message_id:hash("d"),
  source_block_number:88,amount_raw:"100",validator_fee_wei:"2",
  execution_adapter:addr("2"),interchain_fee_wei:"5",
  final_destination_chain:"polygon",final_recipient:addr("a"),
  onward_route_id:hash("f"),delivered:true};
 const item=indexedTransferRow(r);
 assert.equal(item.status,"awaiting-onward");
 assert.equal(item.delivered,true); // Means XGR delivery, not final Polygon.
 assert.equal(item.finalDestinationChain,"polygon");
 assert.equal(item.onwardRouteId,hash("f"));
 assert.equal(item.interchainFeeWei,"5");
 assert.equal(indexedTransferRow({...r,delivered:false}).status,"awaiting-proof");
 assert.equal(indexedTransferRow({...r,delivered:null}).status,"delivery-unknown");
});

test("only the exact canonical onward parent message and route completes a two-hop journey",()=>{
 const payer=addr("a"),firstId=hash("a"),nextId=hash("b");
 const parent={account:payer,asset:"XGR",routeId:hash("1"),messageId:firstId,
  assetId:hash("f"),sourceChain:"base",destinationChain:"xgrchain",
  finalDestinationChain:"polygon",finalRecipient:payer,
  onwardRouteId:hash("2"),amountRaw:"100",confirmed:true,delivered:true,status:"awaiting-onward"};
 const child={...parent,messageId:nextId,txHash:hash("c"),sourceChain:"xgrchain",
  destinationChain:"polygon",parentMessageId:firstId,routeId:parent.onwardRouteId,
  onwardRouteId:null,executionAdapter:addr("d"),confirmed:true,delivered:true};
 let linked=linkIndexedJourneys([parent],[child])[0];
 assert.equal(linked.status,"journey-delivered");
 assert.equal(linked.secondHopTxHash,hash("c"));
 assert.equal(linked.finalDelivered,true);
 for(const corrupt of [
  {routeId:hash("5")},{amountRaw:"99"},{account:addr("f")},
  {parentMessageId:hash("d")},{finalRecipient:addr("e")},
  {destinationChain:"base"},{executionAdapter:null}
 ]){
  linked=linkIndexedJourneys([parent],[{...child,...corrupt}])[0];
  assert.equal(linked.status,"awaiting-onward",
   "mismatched child must NEVER mark parent delivered");
 }
 for(const [flag,status] of [[false,"awaiting-final-proof"],
    [null,"final-delivery-unknown"],[true,"journey-delivered"]]){
  linked=linkIndexedJourneys([parent],[{...child,delivered:flag}])[0];
  assert.equal(linked.status,status);
 }
 linked=linkIndexedJourneys([parent],[child,{...child,messageId:hash("e")}])[0];
 assert.equal(linked.status,"journey-ambiguous");
});

test("only RPC-observed unconfirmed source hints appear and cannot count as deliveries",async()=>{
 const wallet=addr("a"),txHash=hash("5");
 let stagedState="reported";
 const pool={query:async arg=>{
  const sql=typeof arg==="string"?arg:arg.text;
  if(sql.includes("xita_transfer_index_cursors"))return {rows:[]};
  if(sql.includes("COUNT(*) FILTER"))return {rows:[{open:"0",unknown:"0"}]};
  if(sql.includes("FROM xita_transfer_announcements a"))
   return {rows:[{source_chain:"xgrchain",source_tx_hash:txHash,
    account:wallet,state:stagedState}]};
  return {rows:[]};
 }};
 const params={pool,routeList:[],limit:5};
 let result=await readWalletTransferIndex({},wallet,params);
 assert.deepEqual(result.items,[],"Never publish an unverified browser claim");
 stagedState="observed";
 result=await readWalletTransferIndex({},wallet,params);
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].status,"pending-source");
 assert.equal(result.items[0].confirmed,false);
 assert.equal(result.items[0].messageId,null);
 assert.equal(result.openCount,0,"Unconfirmed source is not a mint/unlock");
});

test("wallet history prioritizes older unfinished transfers before newer completed history",async()=>{
 const wallet=addr("a"),calls=[];
 const pool={query:async arg=>{
  const sql=typeof arg==="string"?arg:arg.text;
  calls.push(sql);
  if(sql.includes("xita_transfer_index_cursors"))return {rows:[]};
  if(sql.includes("COUNT(*) FILTER"))return {rows:[{open:"1",unknown:"0"}]};
  if(sql.includes("FROM xita_transfer_announcements"))return {rows:[]};
  return {rows:[]};
 }};
 await readWalletTransferIndex({},wallet,{pool,routeList:[],limit:100});
 const sql=calls.find(x=>x.includes("FROM xita_transfer_operations p")&&x.includes("ORDER BY"));
 assert.ok(sql,"wallet query must have a deterministic worklist ordering");
 assert.match(sql,/ORDER BY CASE WHEN/);
 assert.match(sql,/p.delivered IS DISTINCT FROM TRUE/);
 assert.match(sql,/p.onward_route_id IS NOT NULL AND NOT/);
 assert.match(sql,/p.source_indexed_at DESC,p.source_tx_hash DESC LIMIT/);
});
