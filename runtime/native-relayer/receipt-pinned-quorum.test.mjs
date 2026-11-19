import test from "node:test";
import assert from "node:assert/strict";
import {requestReceiptPinnedILNQuorum} from "./recover-iln.mjs";

const H=x=>"0x"+x.repeat(64);
const route="iln_56_1643_"+("a".repeat(64));

test("quorum source receipt locator is forwarded exactly, never trusted as signature",async()=>{
 const calls=[];
 const xgr={send:async (method,args)=>{calls.push({method,args});return {status:"PENDING"}}};
 const messageId=H("b"),tx=H("c");
 const response=await requestReceiptPinnedILNQuorum(xgr,route,messageId,134450134,tx);
 assert.deepEqual(response,{status:"PENDING"});
 assert.deepEqual(calls,[{
  method:"xgr_requestILNQuorumWithSourceTx",
  args:[route,messageId,134450134,tx]
 }]);
});

test("no invalid or absent source transaction hash may be admitted",async()=>{
 const xgr={send:async()=>{throw Error("Invalid input must never reach RPC")}};
 await assert.rejects(requestReceiptPinnedILNQuorum(xgr,route,H("b"),1,null),/transaction hash/);
 await assert.rejects(requestReceiptPinnedILNQuorum(xgr,route,H("b"),1,H("0")) ,/transaction hash/);
 await assert.rejects(requestReceiptPinnedILNQuorum(xgr,route,H("0"),1,H("c")) ,/Message ID/);
 await assert.rejects(requestReceiptPinnedILNQuorum(xgr,route,H("b"),0,H("c")),/source block/);
 await assert.rejects(requestReceiptPinnedILNQuorum(xgr,"",H("b"),1,H("c")),/route/);
});

test("missing upgraded validator RPC fails closed; no legacy unsafe fallback",async()=>{
 const xgr={send:async(method)=>{assert.equal(method,"xgr_requestILNQuorumWithSourceTx");throw Error("Method not found")}};
 await assert.rejects(requestReceiptPinnedILNQuorum(xgr,route,H("b"),134450134,H("c")),/Method not found/);
});
