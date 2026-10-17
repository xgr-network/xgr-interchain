import test from "node:test";
import assert from "node:assert/strict";
import {rotationCalldata,verifyOnChainWallets} from "./service-wallet-rotation.mjs";
import {selector} from "../../apps/web/keccak.mjs";
const address=x=>"0x"+x.repeat(40);
test("service wallet rotation is exactly one admin-signed EVM call",()=>{
 const tx=rotationCalldata(address("a"));
 assert.equal(tx,selector("setServiceWallet(address)")+("0".repeat(24))+"a".repeat(40));
 assert.equal(tx.length,74);
 assert.throws(()=>rotationCalldata("0x"+"0".repeat(40)),/Invalid/);
 assert.throws(()=>rotationCalldata("private-key-string"),/Invalid/);
});
test("recover only if connected wallet is owner and all three operational roles match",()=>{
 const state={admin:address("b"),recovery:address("b"),
  service:address("a"),recipient:address("a"),signer:address("a"),
  next:address("c")};
 assert.equal(verifyOnChainWallets(state),true);
 for(const change of [
  {recovery:address("d")},{next:address("a")},
  {next:address("b")},{signer:address("c")},
  {recipient:address("b")},{next:"0x"+"0".repeat(40)}
 ]){
  assert.throws(()=>verifyOnChainWallets({...state,...change}),/recovery administrator/);
 }
});
