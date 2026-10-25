import test from "node:test";
import assert from "node:assert/strict";
import {walletSigningQueue,walletSigningNotice} from "./wallet-action-attention.js";
const h=c=>"0x"+c.repeat(64),a="0x"+"1".repeat(40);
const now=Date.parse("2026-10-25T12:00:00Z");
const parent={account:a,txHash:h("a"),messageId:h("b"),confirmed:true,
 asset:"XGR",sourceChain:"arbitrum",destinationChain:"xgrchain",
 finalDestinationChain:"base",onwardRouteId:h("c"),executionAdapter:"0x"+"2".repeat(40),
 interchainFeeWei:"10",delivered:false,status:"awaiting-proof"};
const ready={state:"ready",checkedAt:new Date(now).toISOString()};
const q=(record,sponsorship=null)=>walletSigningQueue({account:a,items:[record],sponsorship,now});
test("backend proofs not ready means monitoring, not a signing request",()=>{
 assert.deepEqual(q({...parent,proofObservation:{state:"waiting"}}),[]);
 assert.deepEqual(q({...parent,proofObservation:ready}),[],"paid TX2 must honor immutable sponsorship lookup");
});
test("TX2 is offered only after verified zero grants or fully confirmed grants",()=>{
 const key="arbitrum:"+parent.messageId+":"+a;
 assert.equal(q({...parent,proofObservation:ready},{key,upfrontRequired:false,status:"not-required"}).length,1);
 assert.deepEqual(q({...parent,proofObservation:ready},{key,upfrontRequired:true,status:"pending"}),[]);
 assert.equal(q({...parent,proofObservation:ready},{key,upfrontRequired:true,status:"confirmed"})[0].step,"first-delivery");
});
test("TX3 and TX4 never recheck sponsorship and link to original source",()=>{
 const onward={...parent,status:"awaiting-onward",delivered:true};
 let queue=q(onward);
 assert.equal(queue[0].step,"onward-source");
 assert.match(walletSigningNotice(queue).label,/TX3/);
 assert.match(walletSigningNotice(queue).href,/resume=0x/);
 const final={...onward,status:"awaiting-final-proof",secondHopTxHash:h("d"),
  secondHopMessageId:h("e"),finalProofObservation:ready};
 queue=q(final);
 assert.equal(queue[0].step,"final-delivery");
 assert.match(walletSigningNotice(queue).label,/TX4/);
});
test("unverified or already delivered transfers never request wallet confirmation",()=>{
 assert.deepEqual(q({...parent,status:"journey-delivered",delivered:true}),[]);
 assert.deepEqual(q({...parent,confirmed:false,status:"awaiting-onward",delivered:true}),[]);
});
