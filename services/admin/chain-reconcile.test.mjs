import test from "node:test";
import assert from "node:assert/strict";
import {verifyChainBindings} from "./chain-reconcile.mjs";
import {selector} from "../../apps/web/keccak.mjs";
const addr=n=>"0x"+n.toString(16).padStart(40,"0");
const word=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
const chain={name:"polygon",chainId:137,domainId:137,blsVerifierFormat:"eip2537",defaultDestinationGasLimit:250000};
const infra={hyperlane:{mailbox:addr(1),merkleTreeHook:addr(2)},
 components:[{key:"validatorRegistry",address:addr(3)},{key:"ism",address:addr(4)}, {key:"nativeRouterDeployer",address:addr(6)},{key:"syntheticRouterDeployer",address:addr(7)}, {key:"collateralRouterDeployer",address:addr(8)},{key:"factory",address:addr(5)}]};
const bootstrap={proposedFeeWei:"100000000000"};
const values={
 "localChainId()":word(137),"localDomain()":word(137),
 "validatorRegistry()":word(3),"destinationIsm()":word(4),
 "initialSourceFeeWei()":word(100000000000n),
 "mailbox()":word(1),"merkleTreeHook()":word(2),
 "nativeDeployer()":word(6),"syntheticDeployer()":word(7),"collateralDeployer()":word(8),
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

test("SourceRegistry live BLS-governed fee overrides the original Factory constructor fee",async()=>{
 const signatures=new Map(Object.entries({
  "sourceChainId()":word(137),"sourceDomain()":word(137),
  "factory()":word(5),"governanceRegistry()":word(3),
  "validatorFeeWei()":word(900000000000n),"sourceFeeNonce()":word(2)
 }).map(([sig,v])=>[selector(sig),v]));
 const rpc=async(_url,method,args)=>{
  assert.equal(method,"eth_call");
  return signatures.get(args[0].data);
 };
 assert.equal(await verifyChainBindings({rpc,url:"https://test.invalid",
  component:"sourceRegistry",address:addr(10),chain,bootstrap,infra}),true);
});
test("initial SourceRegistry fee must equal deployed Factory when nonce zero",async()=>{
 const signatures=new Map(Object.entries({
  "sourceChainId()":word(137),"sourceDomain()":word(137),
  "factory()":word(5),"governanceRegistry()":word(3),
  "validatorFeeWei()":word(200),"sourceFeeNonce()":word(0),
  "initialSourceFeeWei()":word(100)
 }).map(([sig,v])=>[selector(sig),v]));
 await assert.rejects(()=>verifyChainBindings({rpc:async(_url,_method,args)=>signatures.get(args[0].data),
  url:"https://test.invalid",component:"sourceRegistry",address:addr(10),
  chain,bootstrap,infra}),/differs from on-chain Factory/);
});

test("every independent module reconciles without a bogus constructor-binding requirement",async()=>{
 for(const component of ["nativeRouterDeployer","syntheticRouterDeployer","collateralRouterDeployer"]){
  assert.equal(await verifyChainBindings({
   rpc:async()=>{throw Error("No getters exist on a stateless deployer")},
   url:"https://test.invalid",component,address:addr(11),chain,bootstrap,infra
  }),true);
 }
});
test("factory may not bind a substituted router deployment module",async()=>{
 const rpc=async(_url,_method,args)=>args[0].data===selector("nativeDeployer()")
   ?word(99):signatures.get(args[0].data);
 await assert.rejects(()=>verifyChainBindings({rpc,url:"https://test.invalid",
  component:"factory",address:addr(9),chain,bootstrap,infra}),/binding mismatch/);
});
test("factory must have all three independently documented router modules",async()=>{
 const incomplete={...infra,components:infra.components.filter(x=>x.key!=="collateralRouterDeployer")};
 await assert.rejects(()=>verifyChainBindings({
  rpc:async(_url,_method,args)=>signatures.get(args[0].data),
  url:"https://test.invalid",component:"factory",address:addr(9),chain,bootstrap,infra:incomplete
 }),/Unverified Factory module/);
});

test("receipt absence returns resumable pending without touching chain constructor",async()=>{
 const {reconcileDeployedContract}=await import("./chain-reconcile.mjs");
 const addr="0x"+"2".repeat(40),txHash="0x"+"f".repeat(64),wallet="0x"+"a".repeat(40);
 const entry={stage:"submitted",chainId:137,id:"polygon:blsVerifier",txHash,wallet,
  transaction:{from:wallet,to:null,nonce:"0x1",value:"0x0",data:"0x6001"}};
 const rpc=async(_url,method)=>{
  if(method==="eth_chainId")return "0x89";
  if(method==="eth_getTransactionByHash")return {from:wallet,to:null,nonce:"0x1",
    value:"0x0",input:"0x6001"};
  if(method==="eth_getTransactionReceipt")return null;
  throw Error("Unexpected side effect: "+method);
 };
 const result=await reconcileDeployedContract({
  root:process.cwd(),entry,chain:{name:"polygon",chainId:137},bootstrap:{},
  infrastructure:{},artifact:{component:"blsVerifier"},rpc,url:"https://rpc.invalid"
 });
 assert.deepEqual(result,{pending:true,reason:"receipt",txHash});
});
