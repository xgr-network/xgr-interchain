import test from "node:test";
import assert from "node:assert/strict";
import {encodeAbi} from "./abi-encoder.mjs";
import {chainDraft,simulateChainDraft} from "./chain-transaction-draft.mjs";
const addr=n=>"0x"+n.toString(16).padStart(40,"0");
const base={name:"base",chainId:8453,domainId:8453,blsVerifierFormat:"eip2537"};
const hub={name:"xgrchain",chainId:1643,domainId:1643,blsVerifierFormat:"compressed"};
const infra=(chain)=>({name:chain.name,chainId:chain.chainId,
 components:[{key:"factory",address:addr(10)}],
 hyperlane:{mailbox:addr(1),merkleTreeHook:addr(2)}});
test("ABI encoder handles dynamic bytes[] offsets and typed uint boundaries",()=>{
 assert.equal(encodeAbi(["uint64","address"],[8453,addr(1)]),
  "0x"+BigInt(8453).toString(16).padStart(64,"0")+addr(1).slice(2).padStart(64,"0"));
 const data=encodeAbi(["bytes[]"],[["0xaa","0xbbcc"]]);
 assert.ok(data.startsWith("0x"+(32n).toString(16).padStart(64,"0")));
 assert.match(data, /aa0{62}/);
 assert.throws(()=>encodeAbi(["uint8"],[256]),/exceeds/);
 assert.throws(()=>encodeAbi(["address"],["0x11"]),/address/);
 assert.throws(()=>encodeAbi(["bytes"],["0xg0"]),/bytes/);
});
test("native verifier cannot be accidentally deployed on XGRChain",()=>{
 assert.throws(()=>chainDraft({root:process.cwd(),chain:hub,infrastructure:infra(hub),
 bootstrap:{chain:"xgrchain"},component:"blsVerifier"}),/must never/);
});
test("factory registry is a call to existing verified Factory, not a new deployment",()=>{
 const r=chainDraft({root:process.cwd(),chain:base,infrastructure:infra(base),
 bootstrap:{chain:"base"},component:"sourceRegistry"});
 assert.equal(r.operation,"factory-call");
 assert.equal(r.transaction.to,addr(10));
 assert.equal(r.transaction.value,"0x0");
});
test("missing bootstrap and dependencies fail closed",()=>{
 assert.throws(()=>chainDraft({root:process.cwd(),chain:base,infrastructure:infra(base),
 bootstrap:{chain:"base",ready:false},component:"validatorRegistry",parameters:{minimumWei:"300",maxExecutorReimbursementWei:"100",perValidatorWei:"400"}}),/Independently verified/);
 assert.throws(()=>chainDraft({root:process.cwd(),chain:base,infrastructure:infra(base),
 bootstrap:{chain:"base"},component:"ism"}),/dependency/);
});
test("gas simulation checks chain, balance and gas before any signing",async()=>{
 const draft={chain:"polygon",chainId:137,component:"sourceRegistry",operation:"factory-call",
 transaction:{to:addr(10),data:"0xabcdef01",value:"0x0"}};
 const mock=(_url,method)=>({
  eth_chainId:"0x89",eth_estimateGas:"0x100000",
  eth_gasPrice:"0x5",eth_getBalance:"0x100000000"
 })[method];
 const result=await simulateChainDraft(draft,{rpc:mock,url:"https://polygon.example.org",from:addr(1)});
 assert.equal(result.simulated,true);
 assert.ok(BigInt(result.totalWorstCaseWei)>0n);
 await assert.rejects(()=>simulateChainDraft(draft,{rpc:async(_,m)=>m==="eth_chainId"?"0x2105":mock(_,m),
  url:"https://polygon.example.org",from:addr(1)}),/mismatch/);
 await assert.rejects(()=>simulateChainDraft(draft,{rpc:async(_,m)=>m==="eth_getBalance"?"0x0":mock(_,m),
  url:"https://polygon.example.org",from:addr(1)}),/Insufficient/);
});
