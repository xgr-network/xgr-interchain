import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {deploymentIntents} from "./deployment-intents.mjs";
const wallet="0x"+"a".repeat(40), hash="0x"+"b".repeat(64);
const input={id:"polygon:validatorRegistry",chainId:137,sourceCommit:"c".repeat(40),
 wallet,buildHash:"d".repeat(64),artifactHash:"e".repeat(64),
 parameters:{minimumWei:"300",maxExecutorReimbursementWei:"100"},
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

test("route Gateway and Router use the SAME persistent write-ahead journal",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-route-intent-"));
 try{
  const open=()=>deploymentIntents({directory:dir,chains:[{name:"base",chainId:8453}]});
  const route={...input,id:"base:XGR:gateway:base_to_xgr",chainId:8453,parameters:{},
   asset:"XGR",assetId:"0x"+"1".repeat(64),routeName:"base_to_xgr",
   routeId:"0x"+"2".repeat(64),factory:"0x"+"3".repeat(40),validatorSnapshot:null,
   transaction:{...input.transaction,to:"0x"+"3".repeat(40)}};
  open().prepare(route);
  assert.equal(open().read().entries[route.id].stage,"prepared");
  assert.throws(()=>open().prepare(route),/Existing deployment intent/);
  open().attachHash(route.id,hash);
  assert.equal(open().read().entries[route.id].stage,"submitted");
  assert.throws(()=>open().attachHash(route.id,"0x"+"f".repeat(64)),/replace/);
  open().confirm(route.id,hash,{contractAddress:wallet,runtimeKeccak:"0x"+"f".repeat(64)});
  assert.equal(open().read().entries[route.id].stage,"confirmed");
 }finally{rmSync(dir,{recursive:true,force:true})}
});


test("simulation-generated creation transaction is accepted by persistent journal",async()=>{
 const {simulateChainDraft}=await import("./chain-transaction-draft.mjs");
 const dir=mkdtempSync(join(tmpdir(),"xita-intent-creation-"));
 try{
  const simulation=await simulateChainDraft({
   chain:"polygon",chainId:137,component:"validatorRegistry",operation:"create",
   transaction:{to:null,data:"0x1234567890",value:"0x12c"}
  },{url:"https://polygon.example.org",from:wallet,rpc:async(_url,method)=>({
   eth_chainId:"0x89",eth_estimateGas:"0x500000",eth_gasPrice:"0x1",
   eth_getBalance:"0xffffffffffffffff"
  })[method]});
  const open=deploymentIntents({directory:dir,chains:[{name:"polygon",chainId:137}]});
  const saved=open.prepare({...input,transaction:{...simulation.transaction,nonce:"0x0"}});
  assert.equal(saved.transaction.to,null);
  assert.equal(open.read().entries[input.id].transaction.to,null);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
