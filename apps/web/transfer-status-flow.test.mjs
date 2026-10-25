import test from "node:test";
import assert from "node:assert/strict";
import {deriveTransferFlow,renderTransferFlow} from "./transfer-status-flow.js";
const account="0x"+"1".repeat(40),sourceTxHash="0x"+"a".repeat(64),messageId="0x"+"b".repeat(64);
const base={account,asset:"XGR",sourceChain:"arbitrum",destinationChain:"xgrchain",
 finalDestinationChain:"base",txHash:sourceTxHash,messageId,confirmed:true,
 onwardRouteId:"0x"+"c".repeat(64)};
const journey={origin:"arbitrum",destination:"base",asset:"XGR",sourceTxHash};
test("spoke-to-spoke opens six status stages but only four MetaMask transactions",()=>{
 const flow=deriveTransferFlow({journey});
 assert.equal(flow.twoHop,true);assert.equal(flow.steps.length,6);
 assert.equal(flow.totalWalletTx,4);assert.equal(flow.verifiedWalletTx,0);
 assert.match(renderTransferFlow({journey}),/Arbitrum → XGRChain → Base/);
});
test("source confirmed is not mistaken for successful two-hop delivery",()=>{
 const flow=deriveTransferFlow({journey,record:{...base,status:"awaiting-proof",delivered:false}});
 assert.equal(flow.delivered,false);assert.equal(flow.steps[0].state,"complete");
 assert.notEqual(flow.steps[2].state,"complete");
 assert.equal(flow.verifiedWalletTx,1);
});
test("first XGR delivery never advertises Base delivery",()=>{
 const flow=deriveTransferFlow({journey,record:{...base,status:"awaiting-onward",delivered:true}});
 assert.equal(flow.delivered,false);assert.equal(flow.steps[2].state,"complete");
 assert.equal(flow.steps[3].state,"current");assert.equal(flow.verifiedWalletTx,2);
 assert.equal(flow.continueLabel,"Continue onward from XGRChain");
});
test("linked onward source requires real second-hop hash and message",()=>{
 const flow=deriveTransferFlow({journey,record:{...base,status:"awaiting-final-proof",delivered:true,
  secondHopTxHash:"0x"+"d".repeat(64),secondHopMessageId:"0x"+"e".repeat(64)}});
 assert.equal(flow.steps[3].state,"complete");
 assert.equal(flow.steps[5].state,"pending");
 assert.equal(flow.verifiedWalletTx,3);
});
test("only canonical journey-delivered proves full Base delivery",()=>{
 const flow=deriveTransferFlow({journey,record:{...base,status:"journey-delivered",delivered:true,
  secondHopTxHash:"0x"+"d".repeat(64),secondHopMessageId:"0x"+"e".repeat(64)}});
 assert.equal(flow.delivered,true);assert.equal(flow.verifiedWalletTx,4);
 assert.ok(flow.steps.every(x=>x.state==="complete"));
 assert.doesNotMatch(renderTransferFlow({journey,record:{...base,status:"awaiting-onward",delivered:true}}),/Transfer complete/);
});
test("RPC unknown and proof failure are never complete",()=>{
 for(const status of ["delivery-unknown","final-delivery-unknown","journey-ambiguous"]){
  const flow=deriveTransferFlow({journey,record:{...base,status,delivered:false},error:"RPC unavailable"});
  assert.equal(flow.delivered,false);assert.equal(flow.needsAttention,true);
  assert.doesNotMatch(flow.heading,/complete/i);
 }
});
test("direct XGR to Base uses three statuses and two wallet transactions",()=>{
 const j={origin:"xgrchain",destination:"base",asset:"XGR"};
 const f=deriveTransferFlow({journey:j,record:{...base,sourceChain:"xgrchain",
  destinationChain:"base",status:"delivered",delivered:true}});
 assert.equal(f.twoHop,false);assert.equal(f.totalWalletTx,2);
 assert.equal(f.steps.length,3);assert.equal(f.verifiedWalletTx,2);
});
test("status content escapes errors and hashes safely",()=>{
 const html=renderTransferFlow({journey,notice:"<script>evil</script>"});
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});

test("mined but unfinalized Arbitrum parent stays at first step and shows count",()=>{
 const record={...base,confirmed:false,status:"confirming",delivered:null,
  confirmationsObserved:41,requiredConfirmations:64,finalDestinationChain:"base"};
 const flow=deriveTransferFlow({journey,record,stage:"first-proof-wait",working:true,
  notice:"Indexer synchronized across all finalized deployed routes."});
 assert.equal(flow.twoHop,true);
 assert.equal(flow.steps[0].state,"current");
 assert.equal(flow.steps[1].state,"pending");
 assert.equal(flow.verifiedWalletTx,0);
 assert.match(flow.message,/41 \/ 64 confirmations/);
 assert.doesNotMatch(flow.message,/Indexer synchronized/);
});

test("verified validator proof advances to MetaMask delivery before source receipt changes",()=>{
 const record={...base,status:"awaiting-proof",delivered:false};
 const signing=deriveTransferFlow({journey,record,working:true,stage:"first-delivery-sign"});
 assert.equal(signing.steps[1].state,"complete");
 assert.equal(signing.steps[2].state,"current");
 assert.equal(signing.verifiedWalletTx,1);
 assert.equal(signing.heading,"MetaMask action required");
 const pending=deriveTransferFlow({journey,record,working:true,stage:"first-delivery-pending"});
 assert.equal(pending.steps[2].state,"current");
 assert.equal(pending.verifiedWalletTx,1);
});

test("persistent background proof observation waits without asking for wallet signature",()=>{
 const record={...base,status:"awaiting-final-proof",delivered:true,
  secondHopTxHash:"0x"+"d".repeat(64),secondHopMessageId:"0x"+"e".repeat(64),
  finalProofObservation:{state:"waiting",reason:"PROOF_PENDING"}};
 const flow=deriveTransferFlow({journey,record});
 assert.equal(flow.canContinue,false);
 assert.match(flow.heading,/automatically/);
 assert.match(flow.message,/background/);
 assert.equal(flow.steps[5].state,"pending");
 const ready=deriveTransferFlow({journey,record:{...record,
  finalProofObservation:{state:"ready",checkedAt:new Date().toISOString()}}});
 assert.equal(ready.canContinue,true);
 assert.match(ready.continueLabel,/final delivery/);
 assert.equal(ready.verifiedWalletTx,3);
});
test("unavailable proof never says Base was delivered",()=>{
 const record={...base,status:"awaiting-final-proof",delivered:true,
  secondHopTxHash:"0x"+"d".repeat(64),secondHopMessageId:"0x"+"e".repeat(64),
  finalProofObservation:{state:"unavailable",reason:"PROOF_RPC_UNAVAILABLE"}};
 const flow=deriveTransferFlow({journey,record});
 assert.equal(flow.delivered,false);
 assert.match(flow.message,/PROOF_RPC_UNAVAILABLE/);
});

test("stale server observer does not permanently disable independent manual recovery",()=>{
 const record={...base,status:"awaiting-proof",delivered:false,
  proofObservation:{state:"checking",updatedAt:"2026-01-01T00:00:00Z"}};
 const flow=deriveTransferFlow({journey,record});
 assert.equal(flow.canContinue,true);
 assert.equal(flow.needsAttention,true);
 assert.match(flow.message,/not updated recently/);
 assert.equal(flow.verifiedWalletTx,1);
});

test("optional sponsorship appears strictly after confirmed initial fee payment",()=>{
 const journey={origin:"xgrchain",destination:"base",asset:"XGR"};
 const record={...base,sourceChain:"xgrchain",destinationChain:"base",
  status:"awaiting-proof",delivered:false,executionAdapter:"0x"+"3".repeat(40),
  interchainFeeWei:"100",confirmed:true};
 const html=renderTransferFlow({journey,record,sponsorship:{enabled:true,status:"submitted"}});
 const source=html.indexOf("Source transaction"),sponsor=html.indexOf("Optional gas sponsorship"),
  quorum=html.indexOf("Validator verification");
 assert.ok(source>=0&&source<sponsor&&sponsor<quorum);
 assert.match(html,/Gas grant submitted; awaiting confirmation/);
 assert.doesNotMatch(html,/Native gas grant confirmed on chain/);
 assert.doesNotMatch(renderTransferFlow({journey,record,sponsorship:{enabled:false,status:"submitted"}}),
  /Optional gas sponsorship/);
 assert.doesNotMatch(renderTransferFlow({journey,record:{...record,confirmed:false},
  sponsorship:{enabled:true,status:"pending"}}),/Optional gas sponsorship/);
 const paid=renderTransferFlow({journey,record,
  sponsorship:{enabled:true,status:"confirmed"}});
 assert.match(paid,/Native gas grant confirmed on chain/);
 assert.match(renderTransferFlow({journey,record,
  sponsorship:{enabled:true,status:"not-required"}}),/Wallet already has sufficient native gas/);
});

test("12 of 12 confirmations does not claim Base safe finality or unlock delivery",()=>{
 const j={origin:"base",destination:"arbitrum",asset:"XGR",sourceTxHash};
 const record={account,sourceChain:"base",destinationChain:"xgrchain",
  finalDestinationChain:"arbitrum",txHash:sourceTxHash,confirmed:false,
  confirmationsObserved:12,requiredConfirmations:12,
  status:"confirming-native-finality",sourceSafeHeadBlock:123};
 const safe=deriveTransferFlow({journey:j,record});
 assert.equal(safe.verifiedWalletTx,0);
 assert.equal(safe.steps[0].state,"current");
 assert.match(safe.heading,/Base safe finality/);
 assert.match(safe.message,/safe head #123/);
 const unavailable=deriveTransferFlow({journey:j,record:{...record,status:"finality-unavailable"}});
 assert.equal(unavailable.needsAttention,true);
 assert.match(unavailable.message,/native safe head is unavailable/);
 assert.equal(unavailable.canContinue,false);
});

test("pending gas sponsorship is not rendered as actively checking forever",()=>{
 const j={origin:"base",destination:"arbitrum",asset:"XGR",sourceTxHash};
 const record={...base,sourceChain:"base",destinationChain:"xgrchain",
  finalDestinationChain:"arbitrum",status:"awaiting-proof",confirmed:true,
  interchainFeeWei:"100",executionAdapter:"0x"+"3".repeat(40)};
 const html=renderTransferFlow({journey:j,record,
  sponsorship:{enabled:true,status:"pending"}});
 assert.match(html,/Gas sponsorship decision pending/);
 assert.match(html,/ux-flow-step-state">Pending/);
});
