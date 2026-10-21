import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {deploymentIntents} from "./deployment-intents.mjs";
import {persistWalletBroadcastHash,observeCommittedWalletTransaction} from "./deployment-wallet-transaction.mjs";
const wallet="0x"+"a".repeat(40),hash="0x"+"b".repeat(64);
const entry={id:"base:blsVerifier",chainId:8453,sourceCommit:"c".repeat(40),
 wallet,buildHash:"d".repeat(64),artifactHash:"e".repeat(64),
 parameters:{},transaction:{from:wallet,to:null,data:"0x6001600055",nonce:"0x7",gas:"0x500000",value:"0x0"}};
test("persist wallet hash synchronously before any RPC lookup; idempotent recovery",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-hash-"));
 try{
  const open=()=>deploymentIntents({directory:dir,chains:[{name:"base",chainId:8453}]});
  open().prepare(entry);
  const saved=persistWalletBroadcastHash({journal:open(),id:entry.id,txHash:hash});
  assert.equal(saved.stage,"submitted");
  assert.equal(saved.rpcVerification,"pending");
  assert.equal(open().read().entries[entry.id].txHash,hash);
  assert.equal(persistWalletBroadcastHash({journal:open(),id:entry.id,txHash:hash}).stage,"submitted");
  assert.throws(()=>persistWalletBroadcastHash({journal:open(),id:entry.id,
    txHash:"0x"+"f".repeat(64)}),/replace/);
  assert.throws(()=>open().prepare(entry),/Unresolved deployment intent/);
 }finally{rmSync(dir,{force:true,recursive:true})}
});
test("matching transaction can proceed to independent receipt verification",async()=>{
 const seen=[];
 const result=await observeCommittedWalletTransaction({url:"https://base.example",entry:{...entry,stage:"submitted",txHash:hash},
  rpc:async(_url,method,params)=>{
   seen.push(method);
   assert.equal(params[0],hash);
   return {from:wallet,hash,input:entry.transaction.data,nonce:entry.transaction.nonce,
    value:entry.transaction.value,to:null,chainId:"0x2105"};
  }});
 assert.equal(result.pending,false);
 assert.deepEqual(seen,["eth_getTransactionByHash"]);
});
test("RPC propagation gaps and outages are pending, not failed",async()=>{
 for(const value of [null,new Error("429")]){
  const result=await observeCommittedWalletTransaction({url:"https://base.example",
   entry:{...entry,stage:"submitted",txHash:hash},
   rpc:async()=>{if(value instanceof Error)throw value;return value}});
  assert.equal(result.pending,true);
  assert.equal(result.reason,value===null?"transaction-not-visible":"transaction-rpc-unavailable");
 }
});
test("wrong wallet, calldata, chain or target is permanently rejected",async()=>{
 for(const wrong of [{from:"0x"+"1".repeat(40)},{input:"0x11"},{chainId:"0x1"},{to:"0x"+"2".repeat(40)}]){
  await assert.rejects(()=>observeCommittedWalletTransaction({url:"https://base.example",
   entry:{...entry,stage:"submitted",txHash:hash},
   rpc:async()=>({from:wallet,input:entry.transaction.data,nonce:entry.transaction.nonce,
    value:entry.transaction.value,to:null,chainId:"0x2105",...wrong})}),/differs from prepared request/);
 }
});
test("original tx is recovered from its receipt block when hash indexing has expired",async()=>{
 const seen=[];
 const result=await observeCommittedWalletTransaction({
  url:"https://base.example",entry:{...entry,stage:"submitted",txHash:hash},
  rpc:async(_url,method,params)=>{
   seen.push(method);
   if(method==="eth_getTransactionByHash")return null;
   if(method==="eth_getTransactionReceipt")return {status:"0x1",blockNumber:"0x18"};
   if(method==="eth_getBlockByNumber"){
    assert.deepEqual(params,["0x18",true]);
    return {transactions:[{from:wallet,hash,input:entry.transaction.data,
     nonce:entry.transaction.nonce,value:entry.transaction.value,to:null,chainId:"0x2105"}]};
   }
   throw Error("Unexpected RPC call");
  }
 });
 assert.equal(result.pending,false);
 assert.deepEqual(seen,["eth_getTransactionByHash","eth_getTransactionReceipt","eth_getBlockByNumber"]);
});

test("MetaMask may assign a newer nonce without invalidating the exact returned hash",async()=>{
 const sent={...entry,stage:"submitted",txHash:hash};
 const actual={from:wallet,hash,input:entry.transaction.data,nonce:"0x8",
  value:entry.transaction.value,to:null,chainId:"0x2105"};
 const x=await observeCommittedWalletTransaction({
  url:"https://base.example",entry:sent,rpc:async()=>actual
 });
 assert.equal(x.pending,false);
 assert.equal(x.nonceChanged,true);
 assert.equal(x.observedNonce,"0x8");
});
test("wallet-assigned nonce does not override wrong destination or calldata",async()=>{
 const sent={...entry,stage:"submitted",txHash:hash};
 await assert.rejects(()=>observeCommittedWalletTransaction({
  url:"https://base.example",entry:sent,rpc:async()=>({
   from:wallet,hash,input:"0xdead",nonce:"0x8",value:"0x0",
   to:"0x"+"1".repeat(40),chainId:"0x2105"
  })
 }),/calldata, destination/);
});

test("Base smart wallet envelope accepts exact target and calldata, but rejects substituted payloads",async()=>{
 const {compareCommittedWalletTransaction}=await import("./deployment-wallet-transaction.mjs");
 const target="0xa3018e0560113fe3206aadeb1ee9553fd1e76370";
 const data="0x0b33cbaa";
 const e={...entry,id:"base:sourceRegistry",transaction:{...entry.transaction,to:target,data,value:"0x0"}};
 const tx={
  hash,from:wallet,to:"0xdb9b1e94b5b69df7e401ddbede43491141047db3",
  chainId:"0x2105",nonce:"0x7",value:"0x0",
  input:"0xcef6d209"+"00".repeat(100)+target.slice(2)+"00".repeat(32)+data.slice(2)+"00".repeat(20)
 };
 assert.equal(compareCommittedWalletTransaction({...e,txHash:hash},tx).matched,true);
 assert.deepEqual(compareCommittedWalletTransaction({...e,txHash:hash},{...tx,input:tx.input.replace(data.slice(2),"deadbeef")}).mismatched,["calldata","destination"]);
 assert.equal(compareCommittedWalletTransaction({...e,txHash:hash},{...tx,to:"0x"+"3".repeat(40)}).matched,false);
 const router={...e,transaction:{...e.transaction,to:target,data:"0xabcd1234"+("aa".repeat(80))}};
 assert.equal(compareCommittedWalletTransaction({...router,txHash:hash},tx).matched,false);
});
