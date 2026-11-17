import {test} from "node:test";
import assert from "node:assert/strict";
import {computeXGRSetCommitment} from "./xdc-genesis-evidence.mjs";

test("XGR commitment deterministic and sensitive to canonical order",()=>{
 const a=[
  {address:"0x"+"01".repeat(20),blsPublicKeyCompressed:"0x"+"11".repeat(48)},
  {address:"0x"+"02".repeat(20),blsPublicKeyCompressed:"0x"+"22".repeat(48)},
  {address:"0x"+"03".repeat(20),blsPublicKeyCompressed:"0x"+"33".repeat(48)}
 ];
 const hash=computeXGRSetCommitment(a);
 assert.match(hash,/^0x[a-f0-9]{64}$/);
 assert.equal(hash,computeXGRSetCommitment(a));
 assert.notEqual(hash,computeXGRSetCommitment([a[1],a[0],a[2]]));
 assert.throws(()=>computeXGRSetCommitment(a.slice(0,2)),/Invalid XGR/);
 assert.throws(()=>computeXGRSetCommitment([{...a[0],blsPublicKeyCompressed:"0x00"},a[1],a[2]]),/Invalid XGR/);
});

import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {encodeAbi} from "./abi-encoder.mjs";
import {selector,keccak256} from "../../apps/web/keccak.mjs";
import {readXDCGenesisFromXGR} from "./xdc-genesis-evidence.mjs";

// A full ABI/RPC fixture, not just a unit hash: this asserts real XGR V3
// getValidatorSet() offsets, current epoch commitment, runtime and two-RPC
// reconciliation across the exact Admin genesis reader used before wallet signing.
function genesisFixture(t){
 const folder=mkdtempSync(join(tmpdir(),"xita-xdc-mainnet-"));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 for(const p of ["config/chains/xgrchain","deployments/chains"])
  mkdirSync(join(folder,p),{recursive:true});
 const urls=["https://xgr-source-one.invalid","https://xgr-source-two.invalid"];
 const code="0x60006000";
 const address="0x"+"a1".repeat(20);
 const rootHash=keccak256(Buffer.from(code.slice(2),"hex"));
 const validators=[
  {address:"0x"+"11".repeat(20),blsPublicKeyCompressed:"0x"+"a1".repeat(48)},
  {address:"0x"+"22".repeat(20),blsPublicKeyCompressed:"0x"+"b2".repeat(48)},
  {address:"0x"+"33".repeat(20),blsPublicKeyCompressed:"0x"+"c3".repeat(48)}
 ];
 const commitment=computeXGRSetCommitment(validators);
 const genesisId="7";
 const encoded=encodeAbi(["address[]","bytes[]","uint64"],[
  validators.map(x=>x.address),validators.map(x=>x.blsPublicKeyCompressed),genesisId
 ]);
 writeFileSync(join(folder,"config/chains/xgrchain/chain.json"),
  JSON.stringify({chainId:1643,domainId:1643,rpcUrls:urls}));
 writeFileSync(join(folder,"deployments/chains/xgrchain.json"),
  JSON.stringify({xitaV315:{components:{validatorRegistry:{
   address,runtimeCodeKeccak256:rootHash,receiptPath:
    "deployments/receipts/xgrchain/"+"a".repeat(64)+"-"+"a1".repeat(20)+".json"
  }}}}));
 const ms=1_800_000_000_000;
 const blockHash="0x"+"cd".repeat(32);
 const block={number:"0x62",hash:blockHash,timestamp:"0x"+Math.floor(ms/1000-5).toString(16)};
 const rpc=async(url,method,params)=>{
  assert.ok(urls.includes(url),"unexpected XGR provider");
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_blockNumber")return "0x64";
  if(method==="eth_getBlockByNumber"){
   assert.equal(params[0],"0x62");return block;
  }
  if(method==="eth_getCode"){
   assert.equal(params[0],address);assert.equal(params[1],"0x62");return code;
  }
  if(method==="eth_call"){
   assert.equal(params[0].to,address);assert.equal(params[1],"0x62");
   const sel=params[0].data.slice(0,10);
   const quantity=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
   if(sel===selector("registryVersion()"))return quantity(3);
   if(sel===selector("destinationDomain()"))return quantity(1643);
   if(sel===selector("originChainId()"))return quantity(1643);
   if(sel===selector("setId()"))return quantity(genesisId);
   if(sel===selector("getValidatorSet()"))return encoded;
   if(sel===selector("validatorSetCommitment(uint64)"))return commitment;
  }
  throw Error("Unexpected source RPC method "+method);
 };
 return {folder,urls,validators,genesisId,commitment,blockHash,ms,rpc};
}
test("full XGR Mainnet V3 ABI receipt-pin and two-RPC epoch produce XDC genesis",async t=>{
 const f=genesisFixture(t);
 const actual=await readXDCGenesisFromXGR(f.folder,{rpc:f.rpc,now:()=>f.ms});
 assert.equal(actual.setId,f.genesisId);
 assert.equal(actual.commitment,f.commitment);
 assert.deepEqual(actual.validators,f.validators);
 assert.equal(actual.xgrBlockNumber,98);
 assert.equal(actual.xgrBlockHash,f.blockHash);
});
test("XDC genesis rejects disagreement, stale heads, invalid roots or bytecode",async t=>{
 const f=genesisFixture(t);
 await assert.rejects(
  ()=>readXDCGenesisFromXGR(f.folder,{rpc:async(u,m,p)=>
   m==="eth_chainId"&&u===f.urls[1]?"0x32":f.rpc(u,m,p),now:()=>f.ms}),
  /XGR mainnet chain\/head/);
 await assert.rejects(
  ()=>readXDCGenesisFromXGR(f.folder,{rpc:async(u,m,p)=>
   m==="eth_blockNumber"&&u===f.urls[1]?"0x10":f.rpc(u,m,p),now:()=>f.ms}),
  /too far apart/);
 await assert.rejects(
  ()=>readXDCGenesisFromXGR(f.folder,{rpc:async(u,m,p)=>
   m==="eth_getCode"&&u===f.urls[1]?"0x6001":f.rpc(u,m,p),now:()=>f.ms}),
  /fingerprint/);
 await assert.rejects(
  ()=>readXDCGenesisFromXGR(f.folder,{rpc:async(u,m,p)=>
   m==="eth_call"&&p[0]?.data?.startsWith(selector("validatorSetCommitment(uint64)"))&&u===f.urls[1]
    ?"0x"+"00".repeat(32):f.rpc(u,m,p),now:()=>f.ms}),
  /root not canonical/);
 await assert.rejects(
  ()=>readXDCGenesisFromXGR(f.folder,{rpc:f.rpc,now:()=>f.ms+600_000}),
  /fingerprint or canonical header/);
});
