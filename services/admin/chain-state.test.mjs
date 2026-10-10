import test from "node:test";
import assert from "node:assert/strict";
import {approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory,verifyChainInfrastructure} from "./chain-state.mjs";
import {formatNative} from "./wallet.js";
const root=new URL("../../",import.meta.url).pathname;
test("all four main-approved chains carry explicit v3.1.5 deployment gaps",()=>{
 const inv=approvedWorkInventory(root),chains=infrastructureInventory(root,inv.chains);
 assert.equal(chains.length,4);
 assert.equal(chains.find(c=>c.name==="xgrchain").chainId,1643);
 assert.equal(chains.find(c=>c.name==="base").nativeCurrency.symbol,"ETH");
 assert.ok(chains.every(c=>c.required===(inv.chains.find(x=>x.name===c.name).blsVerifierFormat==="compressed"?4:5) && c.components.length===c.required));
 assert.ok(chains.every(c=>c.status==="not-deployed"));
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
