import {blocksUnverifiedSourceRepeat} from "./wallet-transfer-selection.js";
import test from "node:test";
import assert from "node:assert/strict";
import {openWalletTransfers,selectedRecovery} from "./wallet-transfer-selection.js";
const owner="0x"+"a".repeat(40),other="0x"+"b".repeat(40),tx="0x"+"1".repeat(64);
const pending={account:owner,txHash:tx,sourceChain:"xgrchain",destinationChain:"base",status:"awaiting-proof"};
test("unfinished historical delivery never hijacks a new transfer implicitly",()=>{
 const items=[pending];
 assert.equal(openWalletTransfers(items,owner).length,1);
 assert.equal(selectedRecovery(items,owner,null),null);
 assert.equal(selectedRecovery(items,owner,""),null);
 assert.deepEqual(selectedRecovery(items,owner,tx),pending);
 assert.equal(selectedRecovery(items,other,tx),null);
 assert.equal(selectedRecovery([{...pending,status:"delivered"}],owner,tx),null);
});

test("resume URL cannot accidentally start a new lock while source is unverified or completed",()=>{
 const hash="0x"+"a".repeat(64);
 assert.equal(blocksUnverifiedSourceRepeat(hash,null),true);
 assert.equal(blocksUnverifiedSourceRepeat(hash,undefined),true);
 assert.equal(blocksUnverifiedSourceRepeat(null,null),false);
 assert.equal(blocksUnverifiedSourceRepeat(hash,{confirmed:true,status:"awaiting-proof"}),false);
});

test("safe-head or RPC-unavailable wallet transfers remain resumable by original hash",()=>{
 for(const status of ["confirming-native-finality","finality-unavailable"]){
  const item={...pending,status,confirmed:false};
  assert.deepEqual(selectedRecovery([item],owner,tx),item);
 }
});
