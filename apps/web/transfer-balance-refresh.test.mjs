import test from "node:test";
import assert from "node:assert/strict";
import {changedTransferBalanceChains} from "./transfer-balance-refresh.js";
const account="0x"+"a".repeat(40),txHash="0x"+"b".repeat(64),child="0x"+"c".repeat(64);
const row={account,txHash,sourceChain:"base",destinationChain:"xgrchain",status:"awaiting-proof",confirmed:true,delivered:false};
test("only verified new delivery refreshes destination wallet balance once",()=>{
 assert.deepEqual(changedTransferBalanceChains([row],[{...row,status:"delivered",delivered:true}],account),["xgrchain"]);
 assert.deepEqual(changedTransferBalanceChains([{...row,status:"delivered",delivered:true}],[{...row,status:"delivered",delivered:true}],account),[]);
 assert.deepEqual(changedTransferBalanceChains([],[{...row,status:"delivered",delivered:true}],account),[]);
});
test("source confirmation refreshes source only; transient unverified state never refreshes",()=>{
 assert.deepEqual(changedTransferBalanceChains([{...row,confirmed:false}], [row],account),["base"]);
 assert.deepEqual(changedTransferBalanceChains([row],[{...row,status:"delivery-unknown",delivered:null}],account),[]);
});
test("final linked two-hop delivery refreshes final spoke only with independently linked evidence",()=>{
 const parent={...row,finalDestinationChain:"arbitrum",status:"awaiting-final-proof",delivered:true,secondHopTxHash:txHash,secondHopMessageId:child};
 assert.deepEqual(changedTransferBalanceChains([parent],[{...parent,status:"journey-delivered",finalDelivered:true}],account),["arbitrum"]);
 assert.deepEqual(changedTransferBalanceChains([parent],[{...parent,status:"journey-delivered",finalDelivered:false}],account),[]);
});
