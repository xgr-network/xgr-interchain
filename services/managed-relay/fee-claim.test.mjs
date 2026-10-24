import test from "node:test";
import assert from "node:assert/strict";
import {freshDeployedCatalog} from "./test-deployments.mjs";
import {Wallet,keccak256} from "ethers";
import {runClaimMonitor,claimAccruedFees,runConfiguredFeeClaims,documentedFeeClaimAdapters} from "./fee-claim.mjs";

test("aggregate fee claim monitor checks periodically, with no per-message claims",async()=>{
 let polls=0,sleeps=0;
 await runClaimMonitor({intervalMs:60000,
  run:async()=>{polls++;return {status:"disabled"};},
  shouldStop:()=>polls>=3,
  sleep:async ms=>{assert.equal(ms,60000);sleeps++;}
 });
 assert.equal(polls,3);
 assert.equal(sleeps,2);
});
test("unbounded aggressive claim polling is prohibited",async()=>{
 await assert.rejects(()=>runClaimMonitor({
  intervalMs:1000,shouldStop:()=>true
 }),/Unsafe aggregate claim monitor interval/);
});
test("invalid claim threshold cannot incur a live transaction",async()=>{
 let touched=false;
 const provider={getNetwork:async()=>{touched=true;throw Error("must not fetch RPC")}};
 await assert.rejects(()=>claimAccruedFees({
  provider,signer:{address:"0x"+"1".repeat(40)},
  adapterAddress:"0x"+"2".repeat(40),
  expectedChainId:8453,minClaimWei:"0"
 }),/Invalid fee claim configuration/);
 assert.equal(touched,false);
});

const catalog=()=>freshDeployedCatalog({names:["base","xgrchain"]});
const walletKey="0x"+"11".repeat(32);
const walletAddress=new Wallet(walletKey).address;
test("canonical catalog discovers deployed fee gateways and checks actual receipt files",()=>{
 const fixture=catalog(),targets=documentedFeeClaimAdapters(fixture.catalog,{readReceipt:fixture.readReceipt});
 assert.ok(targets.some(x=>x.name==="base"));
 assert.ok(targets.some(x=>x.name==="xgrchain"));
 for(const row of targets){
  assert.equal(row.chain.chainId,Number(row.chain.chainId));
  assert.match(row.address,/^0x[0-9a-f]{40}$/i);
  assert.match(row.runtimeCodeKeccak256,/^0x[0-9a-f]{64}$/i);
 }
});
test("ENV cannot replace the receipt-backed claim adapter and all thresholds validate before any claim",async()=>{
 const fixture=catalog(),c=fixture.catalog,targets=documentedFeeClaimAdapters(c,{readReceipt:fixture.readReceipt}),seen=[];
 const env={
  XITA_INTERCHAIN_CLAIM_ENABLED:"true",
  XITA_INTERCHAIN_FEE_PRIVATE_KEY:walletKey,
  XITA_INTERCHAIN_FEE_ADDRESS:walletAddress,
  XITA_INTERCHAIN_BASE_ADAPTER:"0x"+"f".repeat(40)
 };
 for(const t of targets)env["XITA_INTERCHAIN_"+t.name.toUpperCase()+"_MIN_CLAIM_WEI"]="1000";
 const result=await runConfiguredFeeClaims({env,catalog:c,readReceipt:fixture.readReceipt,
  providerForChain:chain=>({chainId:chain.chainId}),
  claim:async opts=>{
   seen.push(opts);
   return {status:"nothing-to-claim",accruedWei:"0"};
  }});
 assert.equal(result.status,"ok");
 assert.equal(seen.length,targets.length);
 for(let i=0;i<targets.length;i++){
  assert.equal(seen[i].adapterAddress,targets[i].address);
  assert.equal(seen[i].expectedRuntimeCodeKeccak256,targets[i].runtimeCodeKeccak256);
  assert.equal(seen[i].minClaimWei,"1000");
 }
 assert.notEqual(seen.find(x=>x.expectedChainId===8453)?.adapterAddress,
  env.XITA_INTERCHAIN_BASE_ADAPTER);
 delete env["XITA_INTERCHAIN_"+targets.at(-1).name.toUpperCase()+"_MIN_CLAIM_WEI"];
 let executed=0;
 await assert.rejects(()=>runConfiguredFeeClaims({env,catalog:c,readReceipt:fixture.readReceipt,
  claim:async()=>{executed++}
 }),/Missing XITA_INTERCHAIN_/);
 assert.equal(executed,0,"no earlier chain may claim before thresholds for all chains are checked");
});
test("tampered address, hash, receipt path or receipt body abort all automatic claims",async()=>{
 const fixture=catalog(),original=fixture.catalog;
 for(const change of [
  item=>{item.address="0x"+"f".repeat(40)},
  item=>{item.runtimeCodeKeccak256="0x"+"f".repeat(64)},
  item=>{item.receiptPath="../private/secret.json"},
  item=>{item.receiptPath="deployments/receipts/xgrchain/"+item.receiptPath.split("/").at(-1)}
 ]){
  const c=structuredClone(original);
  change(c.infrastructure.base.xitaV315.components.executionGateway);
  assert.throws(()=>documentedFeeClaimAdapters(c,{readReceipt:fixture.readReceipt}),/deployment receipt|receipt mismatch/);
 }
 const env={
  XITA_INTERCHAIN_CLAIM_ENABLED:"true",
  XITA_INTERCHAIN_FEE_PRIVATE_KEY:walletKey,
  XITA_INTERCHAIN_FEE_ADDRESS:walletAddress
 };
 let claims=0;
 const c=structuredClone(original);
 c.infrastructure.xgrchain.xitaV315.components.executionGateway.runtimeCodeKeccak256="0x"+"f".repeat(64);
 await assert.rejects(()=>runConfiguredFeeClaims({env,catalog:c,readReceipt:fixture.readReceipt,
  claim:async()=>{claims++}
 }),/receipt mismatch/);
 assert.equal(claims,0);
 const first=original.infrastructure.base.xitaV315.components.executionGateway;
 assert.throws(()=>documentedFeeClaimAdapters(original,{
  readReceipt:()=>({kind:"xita-v315-deployment-receipt",
   network:"mainnet",status:"onchain-deployment-verified",
   component:"executionGateway",chain:"base",chainId:1,
   transactionHash:"0x"+first.receiptPath.split("/").at(-1).slice(0,64),
   address:first.address,runtimeCodeKeccak256:first.runtimeCodeKeccak256})
 }),/receipt mismatch/);
});
test("deactivated claims do not require a private key, thresholds or RPC",async()=>{
 let calls=0;
 const c=catalog().catalog;
 assert.deepEqual(await runConfiguredFeeClaims({
  env:{XITA_INTERCHAIN_CLAIM_ENABLED:"false"},catalog:c,
  providerForChain:()=>{calls++;throw Error("unexpected RPC")},
  claim:async()=>{calls++;throw Error("unexpected claim")}
 }),{status:"disabled"});
 assert.equal(calls,0);
});
test("claim refuses wrong deployed runtime before connecting wallet or estimating gas",async()=>{
 let signerConnects=0;
 const provider={
  getNetwork:async()=>({chainId:8453n}),
  getCode:async()=> "0x60006000"
 };
 const signer={
  address:walletAddress,
  connect:()=>{signerConnects++;throw Error("should not connect")}
 };
 await assert.rejects(()=>claimAccruedFees({
  provider,signer,adapterAddress:"0x"+"1".repeat(40),expectedChainId:8453,
  expectedRuntimeCodeKeccak256:keccak256("0x6000"),minClaimWei:"100"
 }),/runtime differs/);
 assert.equal(signerConnects,0);
});
