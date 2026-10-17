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
 "nativeDeployer()":word(6),"syntheticDeployer()":word(7),"collateralDeployer()":word(8)
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

test("RPC indexing delay after wallet returned hash is an ordinary resumable pending state",async()=>{
 const {reconcileDeployedContract}=await import("./chain-reconcile.mjs");
 const wallet="0x"+"a".repeat(40),txHash="0x"+"b".repeat(64);
 const entry={stage:"submitted",chainId:8453,id:"base:blsVerifier",
  txHash,wallet,transaction:{from:wallet,to:null,nonce:"0x3",value:"0x0",data:"0x6001"}};
 const result=await reconcileDeployedContract({
  root:process.cwd(),entry,chain:{name:"base",chainId:8453},bootstrap:{},
  infrastructure:{},artifact:{component:"blsVerifier"},url:"https://base.invalid",
  rpc:async(_url,method)=>{
   if(method==="eth_chainId")return "0x2105";
   if(method==="eth_getTransactionByHash")return null;
   if(method==="eth_getTransactionReceipt")return null;
   throw Error("No receipt read before transaction visibility");
  }
 });
 assert.deepEqual(result,{pending:true,reason:"transaction-not-visible",txHash});
});
test("RPC outage during transaction indexing never triggers another broadcast",async()=>{
 const {reconcileDeployedContract}=await import("./chain-reconcile.mjs");
 const wallet="0x"+"a".repeat(40),txHash="0x"+"b".repeat(64);
 const result=await reconcileDeployedContract({
  root:process.cwd(),entry:{stage:"submitted",chainId:8453,id:"base:blsVerifier",
   txHash,wallet,transaction:{from:wallet,to:null,nonce:"0x0",value:"0x0",data:"0x6001"}},
  chain:{name:"base",chainId:8453},bootstrap:{},infrastructure:{},
  artifact:{component:"blsVerifier"},url:"https://base.invalid",
  rpc:async(_url,method)=>{
   if(method==="eth_chainId")return "0x2105";
   if(method==="eth_getTransactionByHash")throw Error("429 rate limited");
   throw Error("No receipt read before transaction visibility");
  }
 });
 assert.deepEqual(result,{pending:true,reason:"transaction-rpc-unavailable",txHash});
});

test("Base Registry V3 checks initial reserve per validator against signed value",async()=>{
 const registry=addr(77),validators=[addr(101),addr(102),addr(103)];
 const boot={initialValidators:validators,reserve:{
  minimumWei:"1000",maxExecutorReimbursementWei:"500",perValidatorWei:"2000"}};
 const responses=new Map(Object.entries({
  "originChainId()":word(1643),"destinationDomain()":word(8453),
  "verifier()":word(BigInt(addr(55))),"verifierKeyFormat()":word(2),
  "setId()":word(1),"minimumDeactivationReserveWei()":word(1000),
  "maxExecutorReimbursementWei()":word(500),"quorumThreshold()":word(2)
 }).map(([s,v])=>[selector(s),v]));
 let liveReserve=2000n;
 const rpc=async(_url,method,args)=>{
  assert.equal(method,"eth_call");
  const s=args[0].data.slice(0,10);
  if(s===selector("getValidatorStatus(address)"))return word(1)+word(1).slice(2);
  if(s===selector("getValidator(address)"))
   return word(1)+word(96).slice(2)+word(liveReserve).slice(2)+word(48).slice(2)+"ab".repeat(48)+"00".repeat(16);
  return responses.get(s);
 };
 const args={rpc,url:"https://base.example",component:"validatorRegistry",address:registry,
   chain:{name:"base",chainId:8453,domainId:8453,blsVerifierFormat:"eip2537"},
   bootstrap:boot,infra:{components:[{key:"blsVerifier",address:addr(55)}]}};
 assert.equal(await verifyChainBindings(args),true);
 liveReserve=1000n;
 await assert.rejects(()=>verifyChainBindings(args),/initial reserve differs/);
});

test("fee contract deployment must bind all three service roles to ONE address",async()=>{
 const service=addr(12),recovery=addr(13),registry=addr(14);
 const manifest={...infra,components:[...infra.components,{key:"sourceRegistry",address:registry}]};
 const methods={"sourceRegistry()":registry,"serviceWallet()":service,
  "relayerOwner()":service,"interchainFeeRecipient()":service,
  "owner()":recovery,"MAX_QUOTE_LIFETIME()":90,"quoteLifetimeSeconds()":90};
 const reads=new Map(Object.entries(methods).map(([signature,value])=>[
  selector(signature),typeof value==="number"?word(value):word(BigInt(value))
 ]));
 const rpc=async(_url,method,params)=>{
  assert.equal(method,"eth_call");
  return reads.get(params[0].data);
 };
 const params={serviceWallet:service,recoveryAdmin:recovery};
 assert.equal(await verifyChainBindings({rpc,url:"https://test.invalid",
  component:"executionGateway",address:addr(22),chain,bootstrap,
  infra:manifest,parameters:params}),true);
 reads.set(selector("relayerOwner()"),word(BigInt(addr(16))));
 await assert.rejects(()=>verifyChainBindings({rpc,url:"https://test.invalid",
  component:"executionGateway",address:addr(22),chain,bootstrap,
  infra:manifest,parameters:params}),/binding mismatch/);
});

test("per-chain fee gateway verifies one service wallet for signer, beneficiary and gas sponsorship",async()=>{
 const service=addr(60),recovery=addr(61),sourceRegistry=addr(62);
 const infraWithSource={...infra,components:[
  ...infra.components,{key:"sourceRegistry",address:sourceRegistry}]};
 const map=new Map(Object.entries({
  "sourceRegistry()":word(62),"owner()":word(61),
  "serviceWallet()":word(60),"relayerOwner()":word(60),
  "interchainFeeRecipient()":word(60),
  "quoteLifetimeSeconds()":word(90),"MAX_QUOTE_LIFETIME()":word(90)
 }).map(([sig,result])=>[selector(sig),result]));
 const rpc=async(_url,method,args)=>{
  assert.equal(method,"eth_call");
  return map.get(args[0].data);
 };
 const opts={rpc,url:"https://rpc.invalid",component:"executionGateway",
  address:addr(63),chain,bootstrap,infra:infraWithSource,
  parameters:{serviceWallet:service,recoveryAdmin:recovery}};
 assert.equal(await verifyChainBindings(opts),true);
 map.set(selector("interchainFeeRecipient()"),word(99));
 await assert.rejects(()=>verifyChainBindings(opts),/binding mismatch/);
 map.set(selector("interchainFeeRecipient()"),word(60));
 map.set(selector("owner()"),word(60));
 await assert.rejects(()=>verifyChainBindings(opts),/binding mismatch/);
 await assert.rejects(()=>verifyChainBindings({...opts,
  parameters:{serviceWallet:service,recoveryAdmin:service}}),/Different public/);
});
