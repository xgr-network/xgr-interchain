import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {deploymentIntents} from "./deployment-intents.mjs";
const wallet="0x"+"a".repeat(40), hash="0x"+"b".repeat(64);
const input={id:"polygon:validatorRegistry",chainId:137,sourceCommit:"c".repeat(40),
 wallet,buildHash:"d".repeat(64),artifactHash:"e".repeat(64),
 parameters:{minimumWei:"300",maxExecutorReimbursementWei:"100",perValidatorWei:"400"},
 validatorSnapshot:{validators:[{address:"0x"+"1".repeat(40)},{address:"0x"+"2".repeat(40)},{address:"0x"+"3".repeat(40)}]},
 transaction:{from:wallet,to:null,data:"0x1234567890",value:"0x0",nonce:"0x0",gas:"0x100000"}};
test("write-ahead wallet intent is persistent and cannot be broadcast twice",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-intent-"));
 try{
  const open=()=>deploymentIntents({directory:dir,chains:[{name:"polygon",chainId:137}]});
  open().prepare(input);
  assert.equal(open().read().entries[input.id].stage,"prepared");
  assert.throws(()=>open().prepare(input),/Existing deployment intent/);
  open().attachHash(input.id,hash);
  assert.equal(open().read().entries[input.id].txHash,hash);
  assert.throws(()=>open().attachHash(input.id,"0x"+"f".repeat(64)),/replace/);
  assert.throws(()=>open().document(input.id,"deployments/mainnet/receipts/polygon/x.json"),/canonical/);
  open().confirm(input.id,hash,{contractAddress:wallet,runtimeKeccak:"0x"+"f".repeat(64)});
  assert.equal(open().read().entries[input.id].stage,"confirmed");
  assert.throws(()=>open().prepare(input),/Existing deployment intent/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("unapproved chain, malformed nonce and sender mismatch fail before journaling",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-intent-"));
 try{
  const s=deploymentIntents({directory:dir,chains:[{name:"base",chainId:8453}]});
  assert.throws(()=>s.prepare(input),/no longer approved/);
  const p=deploymentIntents({directory:dir,chains:[{name:"polygon",chainId:137}]});
  assert.throws(()=>p.prepare({...input,transaction:{...input.transaction,nonce:"-1"}}),/Malformed/);
  assert.throws(()=>p.prepare({...input,transaction:{...input.transaction,from:"0x"+"f".repeat(40)}}),/sender differ/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
