import test from "node:test";
import assert from "node:assert/strict";
import {storeVerifiedOperation} from "./transfer-index-write.mjs";
const hash=x=>"0x"+x.repeat(64),addr=x=>"0x"+x.repeat(40);
const route={sourceChain:"bsc",destinationChain:"xgrchain",
 routeName:"bsc_to_xgr",gateway:addr("a"),routeId:hash("b")};
const event={txHash:hash("c"),messageId:hash("d"),blockNumber:1000,
 blockHash:hash("e"),logIndex:2,sourceBlockAt:"2026-11-20T00:00:00.000Z"};
const record={sourceChain:"bsc",destinationChain:"xgrchain",
 sourceTxHash:event.txHash,messageId:event.messageId,
 routeId:route.routeId,gateway:route.gateway,account:addr("f"),
 asset:"XGR",assetId:hash("0"),routeName:route.routeName,
 destinationMailbox:addr("1"),amountRaw:"10000000000",
 validatorFeeWei:"10000",quoteNonce:null,executionAdapter:null,
 interchainFeeWei:null,finalDestinationChain:null,
 finalRecipient:null,onwardRouteId:null,parentMessageId:null};
test("immutable Node receipt operation is persisted without any chain RPC",async()=>{
 const calls=[];
 const db={query:async arg=>{
  calls.push(arg);
  if(arg.text.includes("INSERT INTO xita_transfer_operations"))
   return {rows:[{message_id:event.messageId}]};
  throw Error("Unexpected SQL");
 }};
 await storeVerifiedOperation(db,{route,event,record});
 assert.equal(calls.length,1);
 assert.equal(calls[0].values[0],route.sourceChain);
 assert.equal(calls[0].values[1],event.messageId);
 assert.equal(calls[0].values[2],event.txHash);
 assert.ok(calls[0].text.includes("source_tx_hash=EXCLUDED.source_tx_hash"));
 assert.ok(calls[0].text.includes("source_block_hash=EXCLUDED.source_block_hash"));
 assert.ok(calls[0].text.includes("delivered=xita_transfer_operations.delivered"));
});
test("mismatched source identity can never reach the SQL writer",async()=>{
 let writes=0;
 await assert.rejects(()=>storeVerifiedOperation({
  query:async()=>{writes++;return {rows:[{message_id:event.messageId}]}},
 },{route,event,record:{...record,messageId:hash("f")}}),/do not match/);
 assert.equal(writes,0);
});
test("conflicting immutable historical operation is rejected, not overwritten",async()=>{
 const db={query:async()=>({rows:[]})};
 await assert.rejects(()=>storeVerifiedOperation(db,{route,event,record}),/Conflicting immutable/);
});
test("onward child cannot invent a second paid intermediary",async()=>{
 const child={...record,sourceChain:"xgrchain",destinationChain:"base",
 parentMessageId:hash("9"),executionAdapter:addr("4"),onwardRouteId:null,
 interchainFeeWei:"100"};
 const actual={...route,sourceChain:"xgrchain",destinationChain:"base"};
 await assert.rejects(()=>storeVerifiedOperation({query:async()=>{throw Error("must not write")}},
  {route:actual,event,record:child}),/Invalid cryptographically linked/);
});
test("paid fee receipts require quote nonce and never infer charge",async()=>{
 const paid={...record,executionAdapter:addr("9"),interchainFeeWei:"1000",
  quoteNonce:null};
 await assert.rejects(()=>storeVerifiedOperation({
  query:async()=>({rows:[{message_id:event.messageId}]}),
 },{route,event,record:paid}),/missing quote nonce/);
 const queries=[];
 await storeVerifiedOperation({query:async arg=>{
  queries.push(arg);
  return {rows:[{message_id:event.messageId}]};
 }},{route,event,record:{...paid,quoteNonce:"42"}});
 assert.equal(queries.length,2);
 assert.ok(queries[1].text.includes("xita_tax_charged_fees"));
 assert.ok(queries[1].text.includes("missing_quote"));
 assert.equal(queries[1].values[7],"42");
});
