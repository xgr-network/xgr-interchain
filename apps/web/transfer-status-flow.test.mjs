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
