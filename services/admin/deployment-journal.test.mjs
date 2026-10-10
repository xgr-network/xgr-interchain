import test from "node:test";import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {deploymentJournal} from "./deployment-journal.mjs";
const base={id:"base:validatorRegistry",txHash:"0x"+"a".repeat(64),
 wallet:"0x"+"b".repeat(40),sourceCommit:"c".repeat(40),chainId:8453};
test("journal remains durable and never sends duplicate transactions",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-journal-"));
 try{
  const journal=deploymentJournal({dir});journal.record(base);
  const reopened=deploymentJournal({dir});
  assert.equal(reopened.read().entries[base.id].stage,"submitted");
  assert.throws(()=>reopened.record({...base,txHash:"0x"+"d".repeat(64)}),/already journaled/);
  assert.throws(()=>reopened.reconcile({id:base.id,txHash:base.txHash,stage:"documented"}),/Invalid journal transition/);
  reopened.reconcile({id:base.id,txHash:base.txHash,stage:"confirmed"});
  assert.throws(()=>reopened.reconcile({id:base.id,txHash:base.txHash,stage:"documented"}),/receipt reference/);
  reopened.reconcile({id:base.id,txHash:base.txHash,stage:"documented",evidence:{path:"deployments/mainnet/receipts/base/a.json"}});
  assert.equal(deploymentJournal({dir}).read().entries[base.id].stage,"documented");
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("malformed transaction or unknown chain is refused before recording",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-journal-"));
 try{
  assert.throws(()=>deploymentJournal({dir}).record({...base,chainId:137}),/Invalid journal chain/);
  assert.throws(()=>deploymentJournal({dir}).record({...base,txHash:"0x13"}),/Invalid transaction journal/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
