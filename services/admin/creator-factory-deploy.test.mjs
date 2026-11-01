import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {creatorFactoryArtifact,creatorFactoryManifest,verifyCreatorFactoryReceipt,creatorFactoryDeployment} from "./creator-factory-deploy.mjs";
import {keccak256} from "../../apps/web/keccak.mjs";
const root=resolve(new URL("../../",import.meta.url).pathname),wallet="0x"+"a".repeat(40),
 address="0x"+"b".repeat(40),tx="0x"+"f".repeat(64),blockHash="0x"+"e".repeat(64);
const init="0x"+"60".repeat(120),code="0x"+"61".repeat(120);
const artifact={init,code,runtimeHash:keccak256(code)};
test("Factory artifact accepts sealed no-constructor bytecode only",()=>{
 const raw={abi:[{type:"constructor",inputs:[]}],bytecode:{object:init},
  deployedBytecode:{object:code,immutableReferences:{}}};
 assert.deepEqual(creatorFactoryArtifact(raw),artifact);
 assert.throws(()=>creatorFactoryArtifact({...raw,abi:[{type:"constructor",inputs:[{type:"address"}]}]}),/artifact/);
 assert.throws(()=>creatorFactoryArtifact({...raw,bytecode:{object:"0x__invalid__"}}),/artifact/);
 assert.throws(()=>creatorFactoryArtifact({...raw,deployedBytecode:{object:"0x"+"60".repeat(24577)}}),/EVM/);
});
function mockRpc({mined=true,corrupt=false}={}){
 return async (_url,method,params)=>{
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_estimateGas")return "0x100000";
  if(method==="eth_gasPrice")return "0x3b9aca00";
  if(method==="eth_getBalance")return "0x3635c9adc5dea00000";
  if(method==="eth_getTransactionCount")return "0x1";
  if(method==="eth_blockNumber")return "0x110";
  if(method==="eth_getTransactionReceipt")return mined?{
   transactionHash:tx,status:"0x1",from:wallet,to:null,contractAddress:address,
   blockNumber:"0x100",blockHash}:null;
  if(method==="eth_getTransactionByHash")return mined?{hash:tx,from:wallet,to:null,
   input:init,value:"0x0"}:null;
  if(method==="eth_getBlockByNumber")return {hash:blockHash};
  if(method==="eth_getCode")return corrupt?"0x6000":code;
  throw Error("Unexpected RPC "+method);
 };
}
test("Two independent RPCs prove the exact tx, creation receipt and matching runtime",async()=>{
 const urls=["https://rpc.xgr.network","https://rpc2.xgr.network"];
 const checked=await verifyCreatorFactoryReceipt({rpc:mockRpc(),urls,txHash:tx,init,code,wallet});
 assert.equal(checked.phase,"verified");
 assert.equal(checked.proof.address,address);
 assert.deepEqual(creatorFactoryManifest(checked.proof),{
  schemaVersion:1,kind:"xita-creator-factory-v1",status:"receipt-verified",chainId:1643,
  address,runtimeCodeKeccak256:keccak256(code),deploymentTxHash:tx});
 assert.equal((await verifyCreatorFactoryReceipt({rpc:mockRpc({mined:false}),urls,txHash:tx,init,code,wallet})).phase,"pending");
 await assert.rejects(()=>verifyCreatorFactoryReceipt({rpc:mockRpc({corrupt:true}),urls,txHash:tx,init,code,wallet}),/runtime/);
});
test("Creator Factory admin never signs twice, journals hash before publication and recovers PR",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"factory-admin-")),sourceCommit="a".repeat(40);
 let published=0,shouldPublish=true;
 const work=creatorFactoryDeployment({root,stateDir:dir,main:async()=>sourceCommit,
  artifactForCommit:()=>artifact,rpc:mockRpc(),
  publish:async({manifest})=>{
   published++;assert.equal(manifest.deploymentTxHash,tx);
   if(!shouldPublish)throw Error("GitHub temporary outage");
   return {number:505,url:"https://github.com/xgr-network/xgr-interchain/pull/505"};
  }});
 try{
  const prepared=await work.prepare({wallet});
  assert.equal(prepared.phase,"prepared");
  assert.equal(prepared.chainId,1643);
  assert.equal(prepared.transaction.data,init);
  assert.equal((await work.status()).phase,"prepared");
  await assert.rejects(()=>work.prepare({wallet}),/already|Existing/);
  await work.hash({txHash:tx});
  await assert.rejects(()=>work.hash({txHash:"0x"+"d".repeat(64)}),/replace/);
  shouldPublish=false;
  await assert.rejects(()=>work.reconcile(),/temporary outage/);
  const persisted=JSON.parse(readFileSync(join(dir,"creator-factory-deploy.json"),"utf8"));
  assert.equal(persisted.phase,"verified");
  assert.equal(persisted.proof.address,address);
  shouldPublish=true;
  const done=await work.reconcile();
  assert.equal(done.phase,"pr-created");
  assert.equal(done.pr.number,505);
  assert.equal((await work.reconcile()).phase,"pr-created");
  assert.equal(published,2);
  await assert.rejects(()=>work.prepare({wallet}),/Existing/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("Only exact unsent Factory preparation can be cancelled; no silent reset of signed TX",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"factory-cancel-"));
 const work=creatorFactoryDeployment({root,stateDir:dir,main:async()=>"c".repeat(40),
  artifactForCommit:()=>artifact,rpc:mockRpc(),publish:async()=>{throw Error("no publication")}});
 try{
  const prepared=await work.prepare({wallet});
  await assert.rejects(()=>work.cancel({createdAt:"wrong"}),/exact/);
  assert.equal((await work.cancel({createdAt:prepared.createdAt})).phase,"cancelled");
  assert.equal((await work.prepare({wallet})).phase,"prepared");
  await work.hash({txHash:tx});
  await assert.rejects(()=>work.cancel({createdAt:prepared.createdAt}),/unsigned/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
