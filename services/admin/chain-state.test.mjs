import test from "node:test";
import assert from "node:assert/strict";
import {approvedWorkInventory} from "./main-gate.mjs";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {infrastructureInventory,verifyChainInfrastructure} from "./chain-state.mjs";
import {formatNative} from "./wallet.js";
import {loadChainDeployment} from "../../tools/manifest-layout.mjs";
const root=new URL("../../",import.meta.url).pathname;
test("all main-approved chains derive deployment progress from documented component evidence",()=>{
 const inv=approvedWorkInventory(root),chains=infrastructureInventory(root,inv.chains);
 assert.equal(chains.length,inv.chains.length);
 assert.equal(chains.find(c=>c.name==="optimism")?.chainId,10);
 assert.equal(chains.find(c=>c.name==="optimism")?.status,"documented");
 assert.equal(chains.find(c=>c.name==="bsc").chainId,56);
 assert.equal(chains.find(c=>c.name==="bsc").status,"documented");
 assert.equal(chains.find(c=>c.name==="xgrchain").chainId,1643);
 assert.equal(chains.find(c=>c.name==="base").nativeCurrency.symbol,"ETH");
 assert.ok(chains.every(c=>c.required===(inv.chains.find(x=>x.name===c.name).blsVerifierFormat==="compressed"?8:9) && c.components.length===c.required+1 && c.components.filter(x=>x.optional).length===1));
 // A verified deployment receipt may now exist. Progress must be derived
 // from the currently documented, immutable per-chain component evidence.
 for(const chain of chains){
  const documented=chain.components.filter(p=>!p.optional&&p.status==="documented").length;
  assert.equal(chain.documented,documented,chain.name+" documented count");
  assert.equal(chain.status,
   documented===chain.required?"documented":documented>0?"partial":"not-deployed",
   chain.name+" derived deployment status");
 }
 // No fixed "prelaunch" expectation: deployment receipts may be added after
 // each mainnet transaction, so these checks must work at any deployment stage.
 for(const chain of chains){
  const observed=loadChainDeployment(root,inv.chains.find(c=>c.name===chain.name));
  for(const part of chain.components){
   assert.equal(part.status,observed.xitaV315.components[part.key]?"documented":"not-deployed",
    chain.name+" "+part.key+" must follow immutable deployment index");
  }
 }
});
test("Base observes only documented XITA contracts, not undeployed legacy core",async()=>{
 const inv=approvedWorkInventory(root),chains=infrastructureInventory(root,inv.chains);
 const base=chains.find(c=>c.name==="base");
 assert.ok(base,"Base must remain an approved spoke");
 const rpc=async (_url,method)=>{
  if(method==="eth_chainId")return "0x2105";
  if(method==="eth_getCode")return "0x6001";
  throw Error("Unknown method");
 };
 const [observed]=await verifyChainInfrastructure([base],{rpc});
 assert.equal(observed.rpc,true);
 // Read the Direct-BLS transport deployed under verified GitHub receipts.
 // The old 'merkleTreeHook' property belongs to the removed architecture;
 // here the fresh transport binds mailbox, dispatchHook and requiredHook.
 // Never infer deployment or live core from an unverified legacy address.
 const trustedCore=Boolean(base.hyperlane.mailbox&&base.hyperlane.dispatchHook&&
  base.hyperlane.requiredHook&&base.hyperlane.transportBundle);
 assert.equal(observed.core,trustedCore);
 const documented=base.components.filter(c=>!c.optional&&c.status==="documented");
 assert.equal(observed.components.filter(c=>c.live).length,
  base.components.filter(c=>c.status==="documented").length);
 assert.equal(observed.status,
  documented.length===base.required&&trustedCore?"observed-complete":
   documented.length?"observed-partial":"not-deployed");
 // In particular, a chain with no XITA receipts must remain undeployed even
 // when an RPC would return code for arbitrary historical Hyperlane addresses.
 const unverified={...base,documented:0,
  components:base.components.map(c=>({...c,address:null,status:"not-deployed"})),
  hyperlane:{mailbox:null,dispatchHook:null,requiredHook:null,transportBundle:null}};
 const [legacy]=await verifyChainInfrastructure([unverified],{rpc});
 assert.equal(legacy.status,"not-deployed");
 assert.equal(legacy.core,false);
});
test("wallet wei/ETH formatting keeps exact integer precision",()=>{
 assert.equal(formatNative("0xde0b6b3a7640000"),"1");
 assert.equal(formatNative("10000000000000000000000"),"10000");
 assert.equal(formatNative("1234567890000000000"),"1.23456");
 assert.throws(()=>formatNative("-5"),/Guthaben/);
});
