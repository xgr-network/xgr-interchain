import test from "node:test";
import assert from "node:assert/strict";
import {encodeAbi} from "./abi-encoder.mjs";
import {selector} from "../../apps/web/keccak.mjs";
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
 bootstrap:{chain:"base",ready:false},component:"validatorRegistry",parameters:{minimumWei:"300",maxExecutorReimbursementWei:"100",perValidatorWei:"300"}}),/Independently verified/);
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


test("real constructor simulation journals explicit null recipient and factory call keeps address",async()=>{
 const from=addr(7);
 const mock=async (_url,method,params)=>{
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_estimateGas"){
   if(params[0].to!==undefined&&params[0].to!==addr(10))
    throw Error("Unexpected simulation recipient");
   return "0x500000";
  }
  if(method==="eth_gasPrice")return "0x1";
  if(method==="eth_getBalance")return "0xfffffffffffffff";
  throw Error("Unexpected RPC method "+method);
 };
 const creation={chain:"xgrchain",chainId:1643,component:"validatorRegistry",operation:"create",
  transaction:{to:null,data:"0x1234567890",value:"0x100"}};
 const created=await simulateChainDraft(creation,{rpc:mock,url:"https://xgr.example.org",from});
 assert.equal(created.transaction.to,null);
 assert.equal(created.transaction.from,from);
 const registryCall={...creation,component:"sourceRegistry",operation:"factory-call",
  transaction:{...creation.transaction,to:addr(10),value:"0x0"}};
 const called=await simulateChainDraft(registryCall,{rpc:mock,url:"https://xgr.example.org",from});
 assert.equal(called.transaction.to,addr(10));
});

test("Base EIP2537 contract creation quote accounts for L1 data and operator fees",async()=>{
 const draft={chain:"base",chainId:8453,component:"blsVerifier",operation:"create",
  transaction:{to:null,data:"0x"+"12".repeat(100),value:"0x0"}};
 const rpc=async(_,method,params)=>{
  if(method==="eth_chainId")return "0x2105";
  if(method==="eth_estimateGas")return "0x186a0";
  if(method==="eth_gasPrice")return "0x2540be400";
  if(method==="eth_getBalance")return "0xffffffffffffffff";
  if(method==="eth_call"){
   if(params[0].data.startsWith(selector("getL1FeeUpperBound(uint256)")))
    return "0x"+(90000000000000n).toString(16).padStart(64,"0");
   if(params[0].data.startsWith(selector("getOperatorFee(uint256)")))
    return "0x"+(5000000000000n).toString(16).padStart(64,"0");
   throw Error("Unexpected Base Oracle method");
  }
  throw Error("Unexpected RPC method "+method);
 };
 const result=await simulateChainDraft(draft,{rpc,url:"https://base-rpc.example",from:addr(3)});
 const expected=BigInt(result.gasLimit)*10000000000n+90000000000000n+5000000000000n;
 assert.equal(result.totalWorstCaseWei,expected.toString());
 assert.equal(result.l1DataFeeUpperBoundWei,"90000000000000");
 assert.equal(result.operatorFeeWei,"5000000000000");
 const broken=async(url,method,params)=>method==="eth_call"?"0x":rpc(url,method,params);
 await assert.rejects(()=>simulateChainDraft(draft,{rpc:broken,url:"https://base-rpc.example",from:addr(3)}),/GasPriceOracle/);
});

test("Base Registry create draft deposits three exact, independently specified validator reserves",()=>{
 const validators=[addr(1),addr(2),addr(3)].map(address=>({
  address,blsPublicKeyCompressed:"0x"+"11".repeat(48),
  blsPublicKeyEIP2537:"0x"+"22".repeat(128),possessionProof:"0x"+"33".repeat(256)
 }));
 const draft=chainDraft({root:process.cwd(),chain:base,
  infrastructure:{...infra(base),components:[{key:"blsVerifier",address:addr(55)}]},
  bootstrap:{chain:"base",validatorCount:3,expectedValidatorCount:3,
    initialValidators:validators.map(x=>x.address),validatorSnapshot:{validators}},
  component:"validatorRegistry",parameters:{
    minimumWei:"1000",maxExecutorReimbursementWei:"500",perValidatorWei:"2000"},
  artifact:{component:"validatorRegistry",creation:"0x60006000"}
 });
 assert.equal(BigInt(draft.transaction.value),6000n);
 assert.notEqual(BigInt(draft.transaction.value),3000n);
});

test("one optional Interchain Fee Gateway per chain uses one service wallet and separate recovery admin",()=>{
 const service=addr(77),recovery=addr(88),registry=addr(91);
 for(const chain of [
  hub,base,
  {name:"polygon",chainId:137,domainId:137,blsVerifierFormat:"eip2537"},
  {name:"arbitrum",chainId:42161,domainId:42161,blsVerifierFormat:"eip2537"}
 ]){
  const cfg={...infra(chain),components:[{key:"sourceRegistry",address:registry}]};
  const artifact={component:"executionGateway",creation:"0x"+ "6000".repeat(70)};
  const proposal=chainDraft({root:process.cwd(),chain,infrastructure:cfg,
   bootstrap:{chain:chain.name},component:"executionGateway",
   parameters:{serviceWallet:service,recoveryAdmin:recovery},artifact});
  assert.equal(proposal.chain,chain.name);
  assert.equal(proposal.chainId,chain.chainId);
  assert.equal(proposal.contract,"XITAExecutionGateway");
  assert.equal(proposal.transaction.to,null);
  assert.equal(proposal.transaction.value,"0x0");
  assert.ok(proposal.transaction.data.endsWith(
   encodeAbi(["address","address","address"],[registry,service,recovery]).slice(2)),
    chain.name+" has incorrect immutable recipient constructor data");
  assert.throws(()=>chainDraft({root:process.cwd(),chain,
   infrastructure:{...cfg,components:[...cfg.components,{key:"executionGateway",address:addr(22)}]},
   bootstrap:{chain:chain.name},component:"executionGateway",
   parameters:{serviceWallet:service,recoveryAdmin:recovery},artifact}),
    /already documented/);
  assert.throws(()=>chainDraft({root:process.cwd(),chain,
   infrastructure:{...cfg,components:[]},bootstrap:{chain:chain.name},
   component:"executionGateway",parameters:{serviceWallet:service,recoveryAdmin:recovery},
   artifact}),/dependency/);
 }
});
