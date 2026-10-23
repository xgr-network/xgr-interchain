import test from "node:test";
import assert from "node:assert/strict";
import {pendingDeliveryCount} from "./wallet-pending.js";
const wallet="0x"+"a".repeat(40),messageId="0x"+"b".repeat(64),txHash="0x"+"c".repeat(64);
const open={account:wallet,status:"awaiting-proof",delivered:false,
 confirmed:true,sourceChain:"xgrchain",messageId,txHash};
test("header alert only counts genuine confirmed locks without delivery",()=>{
 assert.equal(pendingDeliveryCount({account:wallet,items:[open]}),1);
 assert.equal(pendingDeliveryCount({account:wallet,items:[open,{...open}]}),1);
 assert.equal(pendingDeliveryCount({account:wallet,items:[
  {...open,status:"delivered",delivered:true},
  {...open,status:"delivery-unknown",delivered:null},
  {...open,status:"pending-source",confirmed:false}]}),1);
 assert.equal(pendingDeliveryCount({account:"0x"+"d".repeat(40),items:[open]}),0);
 assert.equal(pendingDeliveryCount({account:wallet,items:[open],indexedOpenCount:3}),3);
 assert.equal(pendingDeliveryCount({account:wallet,items:[],indexedOpenCount:-1}),0);
});

test("confirmed XGR transit delivery remains visibly unfinished until final journey proof",()=>{
 const onward={...open,sourceChain:"base",status:"awaiting-onward",
  delivered:true,onwardRouteId:"0x"+"e".repeat(64)};
 assert.equal(pendingDeliveryCount({account:wallet,items:[onward]}),1);
 assert.equal(pendingDeliveryCount({account:wallet,items:[{
  ...onward,onwardRouteId:null
 }]}),0);
});

test("confirmed source with unknown destination remains visibly pending",()=>{
 const unknown={...open,status:"delivery-unknown",delivered:null};
 assert.equal(pendingDeliveryCount({account:wallet,items:[unknown]}),1);
 assert.equal(pendingDeliveryCount({account:wallet,items:[
  {...unknown,status:"destination-not-deployed"}]}),1);
 assert.equal(pendingDeliveryCount({account:wallet,items:[
  {...unknown,confirmed:false}]}),0);
});

test("second-hop uncertain after XGR hub delivery is still pending",()=>{
 const parent={...open,sourceChain:"arbitrum",destinationChain:"xgrchain",
  finalDestinationChain:"base",onwardRouteId:"0x"+"e".repeat(64),
  delivered:true,status:"final-delivery-unknown"};
 assert.equal(pendingDeliveryCount({account:wallet,items:[parent]}),1);
 assert.equal(pendingDeliveryCount({account:wallet,items:[{...parent,status:"journey-ambiguous"}]}),1);
 assert.equal(pendingDeliveryCount({account:wallet,items:[{...parent,status:"journey-delivered"}]}),0);
});

test("one verified two-hop journey is exactly one pending wallet operation",()=>{
 const message="0x"+"e".repeat(64),tx="0x"+"f".repeat(64);
 const route="0x"+"9".repeat(64),account=wallet;
 const parent={...open,account,sourceChain:"arbitrum",destinationChain:"xgrchain",
  messageId:message,txHash:open.txHash,onwardRouteId:route,asset:"XGR",amountRaw:"100",
  finalDestinationChain:"base",finalRecipient:account,status:"awaiting-final-proof",
  delivered:true,secondHopTxHash:tx,secondHopMessageId:"0x"+"8".repeat(64)};
 const child={...open,account,sourceChain:"xgrchain",destinationChain:"base",
  txHash:tx,messageId:parent.secondHopMessageId,parentMessageId:message,
  routeId:route,asset:"XGR",amountRaw:"100",finalRecipient:account,
  executionAdapter:"0x"+"1".repeat(40),status:"awaiting-proof",delivered:false};
 assert.equal(pendingDeliveryCount({account,items:[parent,child]}),1);
 assert.equal(pendingDeliveryCount({account,items:[parent,child],indexedOpenCount:1}),1);
});
