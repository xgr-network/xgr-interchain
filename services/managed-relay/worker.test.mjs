import test from "node:test";
import assert from "node:assert/strict";
import {Wallet} from "ethers";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./worker.mjs",import.meta.url),"utf8");
test("operator does not scan token routes: only its own ExecutionGateway emitter",()=>{
 assert.match(source,/scanManagedWindow/);
 assert.match(source,/executionAddress:service\.address/);
 assert.doesNotMatch(source,/eth_getLogs\(.*route\.gateway/);
});
test("operator preserves verified gateway, fee, ILN and canonical destination binding",()=>{
 assert.match(source,/verifiedManagedReceipt/);
 assert.match(source,/feeReceipt\(entry\.messageId/);
 assert.match(source,/destinationMailbox:mailbox/);
 assert.match(source,/runRecoveryProcess\(recovery\)/);
});
test("write-ahead destination tx signing checks gas, chain ID, and fresh mailbox state",()=>{
 assert.match(source,/gasLimit\*gasPrice\*2n/);
 assert.match(source,/getTransactionCount\(signer\.address,"pending"\)/);
 assert.match(source,/wallet\.signTransaction\(values\)/);
 assert.match(source,/finalizedDelivered/);
});
