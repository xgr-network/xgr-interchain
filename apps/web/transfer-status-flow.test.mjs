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
test("awaiting TX3 tells the wallet user exactly what is next",()=>{
 const record={...base,status:"awaiting-onward",delivered:true};
 const flow=deriveTransferFlow({journey,record});
 assert.equal(flow.heading,"Preparing next wallet transaction");
 assert.match(flow.message,/TX3 of 4/);
 assert.match(flow.message,/MetaMask will request your confirmation/);
 const preflight=deriveTransferFlow({journey,record,working:true,
  stage:"onward-preflight",notice:"Preparing XGRChain transaction"});
 assert.equal(preflight.heading,"Preparing MetaMask transaction");
 const signing=deriveTransferFlow({journey,record,working:true,
  stage:"onward-source-sign",notice:"Confirm transaction in MetaMask"});
 assert.equal(signing.heading,"Confirm transaction in MetaMask");
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
 assert.equal(signing.heading,"Confirm transaction in MetaMask");
 const pending=deriveTransferFlow({journey,record,working:true,stage:"first-delivery-pending"});
 assert.equal(pending.steps[2].state,"current");
 assert.equal(pending.verifiedWalletTx,1);
});

test("absent proof observer entry cannot render validator proof ready",()=>{
 const flow=deriveTransferFlow({journey,record:{...base,status:"awaiting-proof",delivered:false}});
 assert.equal(flow.canContinue,false);
 assert.equal(flow.heading,"Awaiting validator proof observation");
 assert.match(flow.message,/no backend validator-proof observation yet/);
});
test("persistent background proof observation waits without asking for wallet signature",()=>{
 const record={...base,status:"awaiting-final-proof",delivered:true,
  secondHopTxHash:"0x"+"d".repeat(64),secondHopMessageId:"0x"+"e".repeat(64),
  finalProofObservation:{state:"waiting",reason:"PROOF_PENDING"}};
 const flow=deriveTransferFlow({journey,record});
 assert.equal(flow.canContinue,false);
 assert.match(flow.heading,/automatically/);
 assert.match(flow.message,/backend continues even when this window is closed/);
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
 assert.match(flow.message,/Waiting for backend recovery/);
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
 assert.match(html,/Upfront gas grants submitted; awaiting confirmations/);
 assert.doesNotMatch(html,/All upfront native gas grants confirmed on chain/);
 assert.doesNotMatch(renderTransferFlow({journey,record,sponsorship:{enabled:false,status:"submitted"}}),
  /Optional gas sponsorship/);
 assert.doesNotMatch(renderTransferFlow({journey,record:{...record,confirmed:false},
  sponsorship:{enabled:true,status:"pending"}}),/Optional gas sponsorship/);
 const paid=renderTransferFlow({journey,record,
  sponsorship:{enabled:true,status:"confirmed"}});
 assert.match(paid,/All upfront native gas grants confirmed on chain/);
 assert.match(renderTransferFlow({journey,record,
  sponsorship:{enabled:true,status:"not-required"}}),/No sponsor grant required for a verified stage/);
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

test("disabled but promised gas warrants attention",()=>{
 const html=renderTransferFlow({journey,record:{...base,status:"awaiting-proof",delivered:false},sponsorship:{enabled:true,status:"disabled"}});
 assert.match(html,/operator attention required/);
});
test("pending gas sponsorship is not rendered as actively checking forever",()=>{
 const j={origin:"base",destination:"arbitrum",asset:"XGR",sourceTxHash};
 const record={...base,sourceChain:"base",destinationChain:"xgrchain",
  finalDestinationChain:"arbitrum",status:"awaiting-proof",confirmed:true,
  interchainFeeWei:"100",executionAdapter:"0x"+"3".repeat(40)};
 const html=renderTransferFlow({journey:j,record,
  sponsorship:{enabled:true,status:"pending"}});
 assert.match(html,/Waiting for all upfront gas grants before destination delivery/);
 assert.match(html,/ux-flow-step-state">Pending/);
});

test("no sponsor claim cannot be displayed as confirmed adequate gas",()=>{
 const record={...base,status:"awaiting-onward",delivered:true,
  executionAdapter:"0x"+"3".repeat(40),interchainFeeWei:"100"};
 const html=renderTransferFlow({journey,record,
  sponsorship:{enabled:true,status:"pending"}});
 assert.match(html,/Waiting for all upfront gas grants before destination delivery/);
 assert.doesNotMatch(html,/Wallet already has sufficient native gas/);
});

test("status modal never renders wallet, refresh, or proof action buttons",()=>{
 for(const status of ["awaiting-proof","awaiting-onward","awaiting-final-proof","delivery-unknown"]){
  const record={...base,status,delivered:status!=="awaiting-proof",
   secondHopTxHash:"0x"+"d".repeat(64),secondHopMessageId:"0x"+"e".repeat(64)};
  const html=renderTransferFlow({journey,record});
  assert.doesNotMatch(html,/id="xita-flow-(continue|refresh)"/);
  assert.match(html,/id="xita-flow-done"/);
  assert.match(html,/id="xita-flow-history"/);
 }
});

test("final-hop modal displays durable backend proof reason, stage and retry",()=>{
 const retry="2026-10-25T07:40:00.000Z";
 const row={...base,status:"awaiting-final-proof",delivered:true,
  secondHopTxHash:"0x"+"d".repeat(64),secondHopMessageId:"0x"+"e".repeat(64),
  finalProofObservation:{state:"waiting",reason:"PROOF_QUORUM_UNAVAILABLE",
   stage:"quorum",updatedAt:new Date().toISOString(),nextCheckAt:retry}};
 const html=renderTransferFlow({journey,record:row});
 assert.match(html,/Backend proof: waiting/);
 assert.match(html,/PROOF_QUORUM_UNAVAILABLE/);
 assert.match(html,/quorum/);
 assert.match(html,/next check/);
 assert.doesNotMatch(html,/id="xita-flow-(refresh|continue)"/);
});
