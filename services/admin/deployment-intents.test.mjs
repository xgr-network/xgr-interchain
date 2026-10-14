import {CHAIN_COMPONENTS} from "./chain-transaction-draft.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync,mkdirSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {deploymentIntents} from "./deployment-intents.mjs";
const wallet="0x"+"a".repeat(40), hash="0x"+"b".repeat(64);
const input={id:"polygon:validatorRegistry",chainId:137,sourceCommit:"c".repeat(40),
 wallet,buildHash:"d".repeat(64),artifactHash:"e".repeat(64),
 parameters:{minimumWei:"300",maxExecutorReimbursementWei:"100",perValidatorWei:"300"},
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
  assert.throws(()=>open().document(input.id,"deployments/receipts/polygon/x.json"),/canonical/);
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

test("new XITA Registry V3 starts with a clean unarchived wallet journal",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-fresh-start-"));
 try{
  const open=()=>deploymentIntents({directory:dir,chains:[{name:"xgrchain",chainId:1643}]});
  assert.deepEqual(open().read(),{version:1,entries:{}});
  open().prepare({...input,id:"xgrchain:validatorRegistry",chainId:1643});
  const state=JSON.parse(readFileSync(join(dir,"intents.json"),"utf8"));
  assert.deepEqual(Object.keys(state).sort(),["entries","version"]);
  assert.equal(state.entries["xgrchain:validatorRegistry"].stage,"prepared");
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("unexpected journal metadata is rejected rather than retained",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-clean-journal-"));
 try{
  writeFileSync(join(dir,"intents.json"),JSON.stringify({version:1,entries:{},unexpected:{}}));
  const store=deploymentIntents({directory:dir,chains:[{name:"xgrchain",chainId:1643}]});
  assert.throws(()=>store.read(),/schema mismatch/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test("successful repository publication deletes the local completion record",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-published-"));
 try{
  const store=deploymentIntents({directory:dir,chains:[{name:"polygon",chainId:137}]});
  store.prepare(input);
  store.attachHash(input.id,hash);
  store.confirm(input.id,hash,{contractAddress:wallet,runtimeKeccak:"0x"+"1".repeat(64)});
  const receipt="deployments/receipts/polygon/"+hash.slice(2)+"-"+wallet.slice(2)+".json";
  assert.deepEqual(store.document(input.id,receipt),{stage:"documented",receiptPath:receipt});
  assert.deepEqual(store.read(),{version:1,entries:{}});
  assert.deepEqual(JSON.parse(readFileSync(join(dir,"intents.json"),"utf8")),{version:1,entries:{}});
  assert.doesNotThrow(()=>store.prepare(input));
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test("first journal read removes old documented Registry entry without manual path cleanup",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-prelaunch-auto-clean-"));
 try{
  const store=deploymentIntents({directory:dir,chains:[{name:"polygon",chainId:137}]});
  store.prepare(input);
  store.attachHash(input.id,hash);
  store.confirm(input.id,hash,{contractAddress:wallet,runtimeKeccak:"0x"+"1".repeat(64)});
  const old=store.read().entries[input.id];
  const receipt="deployments/receipts/polygon/"+hash.slice(2)+"-"+wallet.slice(2)+".json";
  writeFileSync(join(dir,"intents.json"),JSON.stringify({version:1,entries:{
   [input.id]:{...old,stage:"documented",receiptPath:receipt}
  }}));
  assert.deepEqual(store.read(),{version:1,entries:{}});
  assert.deepEqual(JSON.parse(readFileSync(join(dir,"intents.json"),"utf8")),{version:1,entries:{}});
  assert.doesNotThrow(()=>store.prepare(input));
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test("completed-record cleanup preserves all unresolved router and route transactions",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-keep-unresolved-"));
 try{
  const store=deploymentIntents({directory:dir,chains:[{name:"polygon",chainId:137}]});
  const route={...input,id:"polygon:XGR:gateway:polygon_to_xgr",asset:"XGR",
   factory:"0x"+"3".repeat(40),validatorSnapshot:null,parameters:{},
   transaction:{...input.transaction,to:"0x"+"3".repeat(40)}};
  store.prepare(route);
  store.attachHash(route.id,hash);
  store.prepare(input);
  store.attachHash(input.id,hash);
  store.confirm(input.id,hash,{contractAddress:wallet,runtimeKeccak:"0x"+"1".repeat(64)});
  const completed=store.read().entries[input.id];
  const pending=store.read().entries[route.id];
  const receipt="deployments/receipts/polygon/"+hash.slice(2)+"-"+wallet.slice(2)+".json";
  writeFileSync(join(dir,"intents.json"),JSON.stringify({version:1,entries:{
   [input.id]:{...completed,stage:"documented",receiptPath:receipt},
   [route.id]:pending
  }}));
  const current=store.read();
  assert.equal(current.entries[input.id],undefined);
  assert.equal(current.entries[route.id].stage,"submitted");
  assert.throws(()=>store.prepare(route),/Existing deployment intent/);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir,"intents.json"),"utf8")).entries),[route.id]);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test("cancel only a matching prepared draft, not a submitted tx",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-cancel-"));
 try{
  const st=deploymentIntents({directory:dir,chains:[{name:"polygon",chainId:137}]});
  const e=st.prepare(input);
  assert.throws(()=>st.cancelPrepared(e.id,"wrong"),/Only the exact/);
  assert.deepEqual(st.cancelPrepared(e.id,e.createdAt),{discarded:true});
  st.prepare(input);st.attachHash(e.id,hash);
  assert.throws(()=>st.cancelPrepared(e.id,st.read().entries[e.id].createdAt),/Only the exact/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test("every deployable chain component can be journaled before its FIRST wallet signing",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-intent-all-chain-components-"));
 try{
  const open=deploymentIntents({directory:dir,chains:[{name:"xgrchain",chainId:1643}]});
  for(const component of CHAIN_COMPONENTS){
   const parameters=component==="validatorRegistry"
    ?input.parameters:component==="factory"
    ?{sourceFeeWei:"1"}:{};
   const entry={...input,id:"xgrchain:"+component,chainId:1643,parameters,
    validatorSnapshot:component==="validatorRegistry"?input.validatorSnapshot:null,
    transaction:{...input.transaction,to:component==="sourceRegistry"?wallet:null}};
   const prepared=open.prepare(entry);
   assert.equal(prepared.stage,"prepared",component);
   assert.equal(open.read().entries[entry.id].id,entry.id,component);
  }
  assert.equal(Object.keys(open.read().entries).length,CHAIN_COMPONENTS.length);
  assert.throws(()=>open.prepare({...input,id:"xgrchain:unknownComponent",chainId:1643,parameters:{}}),
   /Malformed deployment intent identity/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("fresh XITA transport bundle intent survives journal transitions and remains non-rebroadcastable",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-intent-transport-bundle-"));
 try{
  const open=deploymentIntents({directory:dir,chains:[{name:"xgrchain",chainId:1643}]});
  const entry={...input,id:"xgrchain:transportBundle",chainId:1643,
   parameters:{},validatorSnapshot:null,transaction:{...input.transaction,to:null}};
  const prepared=open.prepare(entry);
  assert.equal(prepared.txHash,null);
  assert.throws(()=>open.prepare(entry),/Existing deployment intent/);
  open.attachHash(entry.id,hash);
  assert.equal(open.read().entries[entry.id].stage,"submitted");
  open.confirm(entry.id,hash,{contractAddress:wallet,
   runtimeKeccak:"0x"+"f".repeat(64)});
  assert.equal(open.read().entries[entry.id].stage,"confirmed");
  const receipt="deployments/receipts/xgrchain/"+hash.slice(2)+"-"+wallet.slice(2)+".json";
  open.document(entry.id,receipt);
  assert.equal(open.read().entries[entry.id],undefined);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
