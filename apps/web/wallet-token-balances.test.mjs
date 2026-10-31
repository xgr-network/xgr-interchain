import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selector} from "./keccak.js";
import {readWalletTokenBalances} from "./wallet-token-balances.js";

const catalog=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
const account="0x"+"a".repeat(40);
const ARB="0x912ce59144191c1204e64559fe8253a0e49e6548";
test("ARB Arbitrum source reads the original ERC-20 contract and labels balance ARB, not wARB",async()=>{
 const calls=[];
 const rpc=async(url,method,params)=>{
  calls.push({url,method,params});
  if(method==="eth_chainId")return "0xa4b1";
  if(method==="eth_call")return "0x"+(40504711910000000000n).toString(16).padStart(64,"0");
  throw Error("unexpected "+method);
 };
 const value=await readWalletTokenBalances({catalog,account,chains:["arbitrum"],rpc});
 assert.deepEqual(value["ARB:arbitrum"],{
  status:"ready",balanceRaw:"40504711910000000000",decimals:18,
  symbol:"ARB",chain:"arbitrum",representation:"collateral"});
 const actual=calls.filter(call=>call.method==="eth_call"&&call.params[0].to.toLowerCase()===ARB.toLowerCase());
 assert.equal(actual.length,1);
 assert.equal(actual[0].params[0].data.toLowerCase(),
  (selector("balanceOf(address)")+account.slice(2).padStart(64,"0")).toLowerCase());
});
test("BSC and XGRChain synthetic ARB use the receipt-backed router and wARB symbol",async()=>{
 for(const [chain,id] of [["bsc","0x38"],["xgrchain","0x66b"]]){
  const calls=[];
  const rpc=async(url,method,params)=>{
   if(method==="eth_chainId")return id;
   if(method==="eth_call"){calls.push(params[0].to.toLowerCase());return "0x"+"0".repeat(63)+"1";}
   throw Error("unexpected");
  };
  const record=await readWalletTokenBalances({catalog,account,chains:[chain],rpc});
  assert.equal(record["ARB:"+chain]?.symbol,"wARB");
  assert.equal(record["ARB:"+chain]?.representation,"synthetic");
  assert.equal(calls.length,1);
  assert.notEqual(calls[0],ARB.toLowerCase());
 }
});
test("absent or conflicting source representation fails closed instead of inventing token identity",async()=>{
 const modified=structuredClone(catalog);
 modified.assets.ARB.metadata.representations=modified.assets.ARB.metadata.representations.filter(r=>r.chain!=="arbitrum");
 let reads=0;
 const balances=await readWalletTokenBalances({catalog:modified,account,chains:["arbitrum"],
  rpc:async()=>{reads++;throw Error("must not read");}});
 assert.equal(balances["ARB:arbitrum"]?.status,"unavailable");
 assert.equal(reads,0);
});
