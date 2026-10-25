import test from "node:test";
import assert from "node:assert/strict";
import {nextVerifiedWalletStep,walletStepKey,automaticWalletPreflightKey} from "./automatic-transfer-step.js";
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

test("paid but unsponsored source starts preflight when proof is ready",()=>{
 const record={...parent,status:"awaiting-proof",delivered:false,
  executionAdapter:"0x"+"1".repeat(40),interchainFeeWei:"1000000",
  proofObservation:{state:"ready",checkedAt:new Date(now).toISOString()}};
 const binding={key:"wallet:"+h("e"),sourceTxHash:h("e"),record};
 const key=automaticWalletPreflightKey({binding,open:true,now});
 assert.match(key,/first-delivery/);
 assert.equal(automaticWalletPreflightKey({binding,open:false,now}),null);
 assert.equal(automaticWalletPreflightKey({binding,open:true,scanning:true,now}),null);
 assert.equal(automaticWalletPreflightKey({binding,open:true,working:true,now}),null);
 assert.equal(automaticWalletPreflightKey({binding,open:true,attemptedKeys:new Set([key]),now}),null);
 assert.equal(automaticWalletPreflightKey({binding:{...binding,record:{...record,
  proofObservation:{state:"waiting"}}},open:true,now}),null);
});
