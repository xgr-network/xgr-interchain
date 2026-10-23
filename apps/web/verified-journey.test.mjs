import test from "node:test";
import assert from "node:assert/strict";
import {mergeWalletObservation,linkIndexedJourneys,walletJourneys} from "./verified-journey.js";
const hash=n=>"0x"+n.repeat(64),addr=n=>"0x"+n.repeat(40);
const parent={account:addr("a"),asset:"XGR",sourceChain:"arbitrum",
 destinationChain:"xgrchain",finalDestinationChain:"base",
 finalRecipient:addr("a"),routeId:hash("1"),gateway:addr("1"),
 txHash:hash("a"),messageId:hash("b"),onwardRouteId:hash("2"),
 amountRaw:"50",confirmed:true,delivered:true,status:"awaiting-onward"};
const child={account:addr("a"),asset:"XGR",sourceChain:"xgrchain",
 destinationChain:"base",finalRecipient:addr("a"),routeId:hash("2"),
 gateway:addr("2"),txHash:hash("c"),messageId:hash("d"),
 parentMessageId:hash("b"),amountRaw:"50",executionAdapter:addr("e"),
 confirmed:true,delivered:false,status:"awaiting-proof"};
test("one canonical two-hop journey with only one visible pending card",()=>{
 const all=linkIndexedJourneys([parent,child],[parent,child]);
 assert.equal(all[0].status,"awaiting-final-proof");
 assert.equal(all[0].secondHopTxHash,child.txHash);
 assert.deepEqual(walletJourneys(all),[all[0]]);
});
test("a delayed first-hop SQL observation never hides the already verified second hop",()=>{
 const linked=linkIndexedJourneys([parent],[child])[0];
 const old={...parent,status:"awaiting-onward"};
 assert.deepEqual(mergeWalletObservation(linked,old),linked);
 const done=linkIndexedJourneys([parent],[{...child,delivered:true}])[0];
 assert.equal(mergeWalletObservation(done,old).status,"journey-delivered");
});
test("fresh canonical progress can advance but cannot revoke the first hop",()=>{
 const earlier={...parent,delivered:false,status:"awaiting-proof"};
 assert.equal(mergeWalletObservation(earlier,parent).status,"awaiting-onward");
 assert.deepEqual(mergeWalletObservation(parent,{...earlier,delivered:null,status:"delivery-unknown"}),parent);
});
test("an immutable message or onward tx disagreement fails closed",()=>{
 const linked=linkIndexedJourneys([parent],[child])[0];
 assert.equal(mergeWalletObservation(parent,{...parent,messageId:hash("f")}).status,"journey-ambiguous");
 assert.equal(mergeWalletObservation(linked,{...linked,secondHopTxHash:hash("f")}).status,"journey-ambiguous");
});
test("an unverified child cannot collapse a pending card",()=>{
 const unverified={...child,confirmed:false};
 const listed=linkIndexedJourneys([parent,unverified],[unverified]);
 assert.equal(listed[0].status,"awaiting-onward");
 assert.equal(walletJourneys(listed).length,2);
});

test("indexed parent absorbs same independently verified onward TX from stale browser state",()=>{
 const indexed=linkIndexedJourneys([parent],[child])[0];
 const browserChild={...child,parentMessageId:null};
 assert.equal(indexed.secondHopTxHash,child.txHash);
 assert.deepEqual(walletJourneys([indexed,browserChild]),[indexed]);
});
test("an unrelated, unconfirmed, mismatched or ambiguous child is never hidden",()=>{
 const indexed=linkIndexedJourneys([parent],[child])[0];
 for(const wrong of [
  {...child,parentMessageId:null,txHash:hash("e")},
  {...child,parentMessageId:null,routeId:hash("f")},
  {...child,parentMessageId:null,confirmed:false},
  {...child,parentMessageId:null,amountRaw:"51"}
 ]){
  assert.equal(walletJourneys([indexed,wrong]).length,2);
 }
 assert.equal(walletJourneys([{...indexed,status:"journey-ambiguous"},{...child,parentMessageId:null}]).length,2);
});
