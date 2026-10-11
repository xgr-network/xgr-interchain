import test from "node:test";
import assert from "node:assert/strict";
import {approvedWorkInventory} from "./main-gate.mjs";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {infrastructureInventory,verifyChainInfrastructure} from "./chain-state.mjs";
import {formatNative} from "./wallet.js";
const root=new URL("../../",import.meta.url).pathname;
test("all main-approved chains derive deployment progress from documented component evidence",()=>{
 const inv=approvedWorkInventory(root),chains=infrastructureInventory(root,inv.chains);
 assert.equal(chains.length,4);
 assert.equal(chains.find(c=>c.name==="xgrchain").chainId,1643);
 assert.equal(chains.find(c=>c.name==="base").nativeCurrency.symbol,"ETH");
 assert.ok(chains.every(c=>c.required===(inv.chains.find(x=>x.name===c.name).blsVerifierFormat==="compressed"?7:8) && c.components.length===c.required));
 // A verified deployment receipt may now exist. Progress must be derived
 // from the currently documented, immutable per-chain component evidence.
 for(const chain of chains){
  const documented=chain.components.filter(p=>p.status==="documented").length;
  assert.equal(chain.documented,documented,chain.name+" documented count");
  assert.equal(chain.status,
   documented===chain.required?"documented":documented>0?"partial":"not-deployed",
   chain.name+" derived deployment status");
 }
 // No fixed "prelaunch" expectation: deployment receipts may be added after
 // each mainnet transaction, so these checks must work at any deployment stage.
 for(const chain of chains){
  const observed=JSON.parse(readFileSync(join(root,
   "deployments/mainnet/infrastructure/"+chain.name+".json"),"utf8"));
  for(const part of chain.components){
   assert.equal(part.status,observed.xitaV315.components[part.key]?"documented":"not-deployed",
    chain.name+" "+part.key+" must follow immutable deployment index");
  }
 }
});
test("non-XITA Hyperlane core cannot pass as new deployed contracts",async()=>{
 const inv=approvedWorkInventory(root),chains=infrastructureInventory(root,inv.chains);
 const rpc=async (_url,method)=>{
  if(method==="eth_chainId")return "0x2105";
  if(method==="eth_getCode")return "0x6001";
  throw Error("Unknown method");
 };
 const result=await verifyChainInfrastructure(chains.filter(c=>c.name==="base"),{rpc});
 assert.equal(result[0].rpc,true);
 assert.equal(result[0].core,true);
 assert.equal(result[0].status,"not-deployed");
});
test("wallet wei/ETH formatting keeps exact integer precision",()=>{
 assert.equal(formatNative("0xde0b6b3a7640000"),"1");
 assert.equal(formatNative("10000000000000000000000"),"10000");
 assert.equal(formatNative("1234567890000000000"),"1.23456");
 assert.throws(()=>formatNative("-5"),/Guthaben/);
});
