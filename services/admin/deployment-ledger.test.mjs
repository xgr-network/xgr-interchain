import test from "node:test";
import assert from "node:assert/strict";
import {keccak256} from "../../apps/web/keccak.mjs";
import {verifyDeploymentReceipt,deploymentReceiptPath,publishDeploymentBatch,updatedDeploymentWebCatalog} from "./deployment-ledger.mjs";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const loadFixtureInfrastructure=()=>structuredClone(JSON.parse(updatedDeploymentWebCatalog(process.cwd())).infrastructure.xgrchain);
const SHA="a".repeat(40), TX="0x"+"b".repeat(64), BLOCK="0x"+"c".repeat(64);
const ADDRESS="0x"+"1".repeat(40),WALLET="0x"+"2".repeat(40);
const BYTECODE="0x6001600055", HASH=keccak256(Uint8Array.from(Buffer.from(BYTECODE.slice(2),"hex")));
const params={sourceCommit:SHA,chain:"base",asset:null,routeName:null,
 component:"blsVerifier",contractAddress:ADDRESS,txHash:TX,
 expectedRuntimeKeccak256:HASH,expectedDeployer:WALLET,provenance:{kind:"create"}};
function rpcWith(change={}){
 return async (_url,method,_args)=>{
  if(method==="eth_chainId")return change.chainId||"0x2105";
  if(method==="eth_blockNumber")return "0x70";
  if(method==="eth_getTransactionReceipt")return {
   status:"0x1",transactionHash:TX,from:WALLET,contractAddress:ADDRESS,
   to:null,blockHash:BLOCK,blockNumber:"0x60",logs:[],...(change.receipt||{})
  };
  if(method==="eth_getBlockByNumber")return {hash:BLOCK,number:"0x60",...(change.block||{})};
  if(method==="eth_getCode")return change.code||BYTECODE;
  throw Error("Unexpected RPC "+method);
 };
}
test("receipt verifies canonical block, correct chain and artifact runtime keccak",async()=>{
 const r=await verifyDeploymentReceipt(process.cwd(),params,{rpc:rpcWith(),now:()=>"2026-10-10T00:00:00Z"});
 assert.equal(r.status,"onchain-deployment-verified");
 assert.equal(r.runtimeCodeKeccak256,HASH);
 assert.equal(r.approval.sourceCommit,SHA);
 assert.match(deploymentReceiptPath(r),/^deployments\/receipts\/base\/[0-9a-f]{64}-[0-9a-f]{40}\.json$/);
});
test("spoofed chain, failed tx, noncanonical block and altered runtime all fail",async()=>{
 await assert.rejects(()=>verifyDeploymentReceipt(process.cwd(),params,{rpc:rpcWith({chainId:"0x89"})}),/network/);
 await assert.rejects(()=>verifyDeploymentReceipt(process.cwd(),params,{rpc:rpcWith({receipt:{status:"0x0"}})}),/not successful/);
 await assert.rejects(()=>verifyDeploymentReceipt(process.cwd(),params,{rpc:rpcWith({block:{hash:"0x"+"d".repeat(64)}})}),/canonical/);
 await assert.rejects(()=>verifyDeploymentReceipt(process.cwd(),params,{rpc:rpcWith({code:"0x6002600055"})}),/code hash/);
});
test("cannot publish fake receipt, no GitHub token or mismatched main",async()=>{
 await assert.rejects(()=>publishDeploymentBatch(process.cwd(),[params],{token:null}),/writer token/);
 await assert.rejects(()=>publishDeploymentBatch(process.cwd(),[{...params,sourceCommit:"d".repeat(40)}],{
  token:"test-token",
  git:a=>a[0]==="symbolic-ref"?"main":a[0]==="rev-parse"?SHA:"",
  fetcher:async()=>({ok:true,json:async()=>({object:{sha:SHA}})})
 }),/not authorized/);
});

test("atomic deployment catalog includes new infrastructure component and asset receipts",()=>{
 const {parse}=JSON;
 const infrastructure=loadFixtureInfrastructure();
 const original=JSON.parse(updatedDeploymentWebCatalog(process.cwd()));
 assert.deepEqual(original.infrastructure.xgrchain.xitaV315,infrastructure.xitaV315);
 const file="deployments/receipts/xgrchain/"+ "a".repeat(64)+"-"+"b".repeat(40)+".json";
 infrastructure.xitaV315.components.factory={
  address:"0x"+"b".repeat(40),runtimeCodeKeccak256:"0x"+"c".repeat(64),receiptPath:file
 };
 infrastructure.xitaV315.receiptPaths.push(file);
 const asset=structuredClone(original.assets.XGR.deployment);
 const assetReceipt="deployments/receipts/xgrchain/"+ "d".repeat(64)+"-"+"e".repeat(40)+".json";
 asset.receiptPaths.push(assetReceipt);
 asset.representations.push({chain:"xgrchain",component:"nativeRouter",
   address:"0x"+"e".repeat(40),runtimeCodeKeccak256:"0x"+"f".repeat(64),receiptPath:assetReceipt});
 const updated=parse(updatedDeploymentWebCatalog(process.cwd(),{
  infrastructure:new Map([["xgrchain",infrastructure]]),
  assets:new Map([["XGR",asset]])
 }));
 assert.equal(updated.infrastructure.xgrchain.xitaV315.components.factory.address,"0x"+"b".repeat(40));
 assert.ok(updated.assets.XGR.deployment.receiptPaths.includes(assetReceipt));
 assert.deepEqual(parse(updatedDeploymentWebCatalog(process.cwd())).assets.XGR.deployment,original.assets.XGR.deployment);
});
test("deployment catalog generation fails closed on invalid overrides",()=>{
 const bad={schemaVersion:1,components:{factory:{address:"INVALID",runtimeCodeKeccak256:"0x"+"f".repeat(64),receiptPath:"invalid"}},receiptPaths:["invalid"]};
 assert.throws(()=>updatedDeploymentWebCatalog(process.cwd(),{infrastructure:new Map([["xgrchain",{
  ...loadFixtureInfrastructure(),xitaV315:bad
 }]])}),/invalid component deployment binding/);
 assert.throws(()=>updatedDeploymentWebCatalog(process.cwd(),{assets:new Map([["UNKNOWN",{}]])}),/Unknown deployment asset/);
});

test("receipt proof NEVER requests archived contract state; immutable runtime read at latest",async()=>{
 const queried=[];
 const r=await verifyDeploymentReceipt(process.cwd(),params,{rpc:async(url,method,args)=>{
   if(method==="eth_getCode"){queried.push(args[1]);if(args[1]!=="latest")throw Error("historical state unavailable");}
   return rpcWith()(url,method,args);
 }});
 assert.equal(r.status,"onchain-deployment-verified");
 assert.deepEqual(queried,["latest"]);
});
