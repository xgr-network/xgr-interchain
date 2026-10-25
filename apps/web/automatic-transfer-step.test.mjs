import test from "node:test";
import assert from "node:assert/strict";
import {nextVerifiedWalletStep,walletStepKey} from "./automatic-transfer-step.js";
const h=c=>"0x"+c.repeat(64),now=Date.parse("2026-10-25T06:00:00Z");
const parent={confirmed:true,messageId:h("a"),onwardRouteId:h("b"),
 status:"awaiting-onward",delivered:true,finalDestinationChain:"arbitrum"};
test("only verified wallet-ready transitions issue intent",()=>{
 assert.equal(nextVerifiedWalletStep({...parent,status:"awaiting-proof",delivered:false},{now}),null);
 assert.equal(nextVerifiedWalletStep({...parent,status:"awaiting-final-proof"},{now}),null);
 assert.equal(nextVerifiedWalletStep({...parent,confirmed:false},{now}),null);
 assert.equal(nextVerifiedWalletStep(parent,{now})?.kind,"onward-source");
 const proof={state:"ready",checkedAt:new Date(now).toISOString()};
 assert.equal(nextVerifiedWalletStep({...parent,status:"awaiting-proof",delivered:false,
  proofObservation:{state:"waiting"}},{now}),null);
 assert.equal(nextVerifiedWalletStep({...parent,status:"awaiting-proof",delivered:false,
  proofObservation:proof},{now})?.kind,"first-delivery");
 assert.equal(nextVerifiedWalletStep({...parent,status:"awaiting-final-proof",secondHopTxHash:h("c"),
  secondHopMessageId:h("d"),finalProofObservation:proof},{now})?.kind,"final-delivery");
 assert.equal(nextVerifiedWalletStep({...parent,status:"awaiting-final-proof",secondHopTxHash:h("c"),
  secondHopMessageId:h("d"),finalProofObservation:{...proof,checkedAt:new Date(now-200000).toISOString()}},{now}),null);
});
test("automatic step key binds wallet + original source + exact source message",()=>{
 const binding={key:"wallet:"+h("e"),sourceTxHash:h("e")};
 const step={kind:"final-delivery",identity:h("d")};
 assert.equal(walletStepKey(binding,step),"wallet:"+h("e")+":final-delivery:"+h("d"));
 assert.equal(walletStepKey(binding,{...step,identity:"invalid"}),null);
});
