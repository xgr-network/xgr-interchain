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
  {...open,status:"pending-source",confirmed:false}]}),0);
 assert.equal(pendingDeliveryCount({account:"0x"+"d".repeat(40),items:[open]}),0);
 assert.equal(pendingDeliveryCount({account:wallet,items:[open],indexedOpenCount:3}),3);
 assert.equal(pendingDeliveryCount({account:wallet,items:[],indexedOpenCount:-1}),0);
});
