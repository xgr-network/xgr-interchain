import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {keccak256,selector} from "../../apps/web/keccak.mjs";
import {inspectFeeTreasury} from "./fee-treasury.mjs";
const root=new URL("../..",import.meta.url).pathname;
const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
const gateway=catalog.infrastructure.base.xitaV315.components.executionGateway;
const addr="0x"+"a".repeat(40);
const word=v=>"0x"+BigInt(v).toString(16).padStart(64,"0");
const addressWord=address=>"0x"+address.slice(2).padStart(64,"0");
const code="0x60006000";
const makeCatalog=()=>{
 const c=structuredClone(catalog);
 for(const name of ["xgrchain","polygon","arbitrum"]){
  c.infrastructure[name].xitaV315={components:{}};
 }
 c.infrastructure.base.xitaV315.components.executionGateway.runtimeCodeKeccak256=keccak256(
  Uint8Array.from(Buffer.from(code.slice(2),"hex")));
 return c;
};
function calls(override={}){
 const handlers={
  eth_chainId:()=> "0x2105",
  eth_getCode:()=>code,
  eth_getBalance:([address])=>address.toLowerCase()===addr.toLowerCase()?"0xde0b6b3a7640000":"0x100",
  eth_gasPrice:()=> "0x3b9aca00",
  eth_call:([{data}])=>{
   if(data===selector("serviceWallet()"))return addressWord(addr);
   if(data===selector("relayerOwner()"))return addressWord(addr);
   if(data===selector("interchainFeeRecipient()"))return addressWord(addr);
   if(data===selector("pendingInterchainFeesWei()"))return word(128);
   throw Error("Unexpected getter: "+data);
  },
  ...override
 };
 return async(url,method,params)=>handlers[method](params);
}
function receipt(path){
 const result=JSON.parse(readFileSync(new URL("../../"+path,import.meta.url),"utf8"));
 result.runtimeCodeKeccak256=keccak256(Uint8Array.from(Buffer.from(code.slice(2),"hex")));
 return result;
}
test("fee treasury shows exact raw wallet & claimable balances without signing or env",async()=>{
 const res=await inspectFeeTreasury({root,catalog:makeCatalog(),rpc:calls(),readReceipt:receipt});
 assert.equal(res.ok,true);assert.equal(res.readOnly,true);
 const base=res.chains.find(x=>x.chain==="base");
 assert.equal(base.status,"verified");assert.equal(base.serviceWallet,addr);
 assert.equal(base.serviceBalanceWei,"1000000000000000000");
 assert.equal(base.claimableWei,"128");
 assert.equal(base.contractBalanceWei,"256");
 assert.equal(base.minimumGasReserveWei,"1560000000000000");
 assert.equal(base.gasStatus,"sufficient");
 assert.equal(res.chains.find(x=>x.chain==="arbitrum").status,"not-deployed");
});
test("fee treasury reports low gas reserve distinctly",async()=>{
 const res=await inspectFeeTreasury({root,catalog:makeCatalog(),rpc:calls({
  eth_getBalance:([address])=>address.toLowerCase()===addr.toLowerCase()?"0x1":"0x100"
 }),readReceipt:receipt});
 assert.equal(res.chains.find(x=>x.chain==="base").gasStatus,"low");
});
test("RPC chain mismatch, wrong code, misleading beneficiary and unbacked claims never show verified balances",async()=>{
 for(const change of [
  {eth_chainId:()=> "0x1"},
  {eth_getCode:()=> "0x6001"},
  {eth_call:([{data}])=>data===selector("relayerOwner()")?addressWord("0x"+"b".repeat(40)):(
   data===selector("pendingInterchainFeesWei()")?word(128):addressWord(addr))},
  {eth_call:([{data}])=>data===selector("pendingInterchainFeesWei()")?word(257):addressWord(addr)}
 ]){
  const result=await inspectFeeTreasury({root,catalog:makeCatalog(),rpc:calls(change),readReceipt:receipt});
  assert.equal(result.chains.find(x=>x.chain==="base").status,"unavailable");
 }
});
test("receipt mismatch, missing hashes and unreachable fee RPC fail closed per-chain",async()=>{
 const c=makeCatalog();c.infrastructure.base.xitaV315.components.executionGateway.address="0x"+"f".repeat(40);
 let result=await inspectFeeTreasury({root,catalog:c,rpc:calls(),readReceipt:receipt});
 assert.equal(result.chains.find(x=>x.chain==="base").status,"unavailable");
 result=await inspectFeeTreasury({root,catalog:makeCatalog(),
  rpc:calls({eth_getCode:()=>{throw Error("RPC status 429")}}),readReceipt:receipt});
 assert.equal(result.chains.find(x=>x.chain==="base").status,"unavailable");
});
