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
