import test from "node:test";
import assert from "node:assert/strict";
import {verifyChainBindings} from "./chain-reconcile.mjs";
import {selector} from "../../apps/web/keccak.mjs";
const addr=n=>"0x"+n.toString(16).padStart(40,"0");
const word=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
const chain={name:"polygon",chainId:137,domainId:137,blsVerifierFormat:"eip2537",defaultDestinationGasLimit:250000};
const infra={hyperlane:{mailbox:addr(1),merkleTreeHook:addr(2)},
 components:[{key:"validatorRegistry",address:addr(3)},{key:"ism",address:addr(4)},{key:"factory",address:addr(5)}]};
const bootstrap={proposedFeeWei:"100000000000"};
const values={
 "localChainId()":word(137),"localDomain()":word(137),
 "validatorRegistry()":word(3),"destinationIsm()":word(4),
 "initialSourceFeeWei()":word(100000000000n),
 "mailbox()":word(1),"merkleTreeHook()":word(2),
 "defaultDestinationGasLimit()":word(250000)
};
const signatures=new Map(Object.entries(values).map(([s,v])=>[selector(s),v]));
test("main-pinned Polygon Factory constructor getters verify without Base exceptions",async()=>{
 const rpc=async(_url,method,args)=>{
  assert.equal(method,"eth_call");
  return signatures.get(args[0].data);
 };
 assert.equal(await verifyChainBindings({rpc,url:"https://test.invalid",component:"factory",
  address:addr(9),chain,bootstrap,infra}),true);
});
test("unexpected fee or malicious constructor address fails closed",async()=>{
 const rpc=async(_url,_method,args)=>args[0].data===selector("initialSourceFeeWei()")
  ?word(1):signatures.get(args[0].data);
 await assert.rejects(()=>verifyChainBindings({rpc,url:"https://test.invalid",
  component:"factory",address:addr(9),chain,bootstrap,infra}),/binding mismatch/);
});
