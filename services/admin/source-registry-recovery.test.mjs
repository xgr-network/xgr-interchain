import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {createChainOperator} from "./chain-operator.mjs";
import {deploymentIntents} from "./deployment-intents.mjs";
import {selector,keccak256} from "../../apps/web/keccak.mjs";
import {verifyFactoryRegistryReceipt} from "./registry-event-proof.mjs";
import {verifyExistingSourceRegistry} from "./source-registry-recovery.mjs";
import {deploymentReceiptPath} from "./deployment-ledger.mjs";

const root=new URL("../../",import.meta.url).pathname;
const manifest=JSON.parse(readFileSync(join(root,"deployments/chains/arbitrum.json"),"utf8"));
const components=manifest.xitaV315.components;
const factory=components.factory.address,governance=components.validatorRegistry.address;
const registry="0x"+"9".repeat(40),wallet="0x"+"6".repeat(40),executor="0x"+"7".repeat(40);
const hash="0x"+"a".repeat(64),blockHash="0x"+"b".repeat(64);
const topic=keccak256("RegistryDeployed(address)");
const word=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
const event={address:factory,transactionHash:hash,blockHash,blockNumber:"0x70",
 topics:[topic,word(registry)],removed:false};
const receipt={transactionHash:hash,from:wallet,to:executor,status:"0x1",
 blockHash,blockNumber:"0x70",logs:[event]};
const chain={name:"arbitrum",chainId:42161,domainId:42161,
 confirmations:2,rpcUrls:["https://arbitrum.example"]};
const infra={components:[{key:"factory",address:factory,status:"documented"},
 {key:"validatorRegistry",address:governance,status:"documented"}]};
const artifact={component:"sourceRegistry",runtime:"0x600160",immutableSpans:[]};
const getters=new Map([
 ["registry()",registry],
 ["sourceChainId()",42161],["sourceDomain()",42161],
 ["factory()",factory],["governanceRegistry()",governance],
 ["validatorFeeWei()",100],["sourceFeeNonce()",0],["initialSourceFeeWei()",100]
].map(([s,v])=>[selector(s),word(v)]));
const baseTx={hash,from:wallet,to:executor,input:"0x12345678",value:"0x0",
 chainId:"0xa4b1",nonce:"0x8"};
const fakeRpc=(options={})=>async(_url,method,params)=>{
 switch(method){
  case "eth_call":return getters.get(params[0].data);
  case "eth_chainId":return "0xa4b1";
  case "eth_blockNumber":return "0x200";
  case "eth_getLogs":return [options.event??event];
  case "eth_getTransactionReceipt":return options.receipt??receipt;
  case "eth_getTransactionByHash":return options.transaction??baseTx;
  case "eth_getCode":return "0x600160";
  case "eth_getBlockByNumber":return {hash:blockHash,number:"0x70"};
  default:throw Error("Unexpected RPC "+method);
 }
};
const recover=rpc=>verifyExistingSourceRegistry({
 root,chain,infrastructure:infra,bootstrap:{},artifact,
 sourceCommit:"a".repeat(40),factoryDeploymentBlock:100,rpc
});

test("Arbitrum smart-wallet outer calldata/target does not prevent receipt-verified Registry adoption",async()=>{
 const result=await recover(fakeRpc());
 assert.equal(result.address,registry);
 assert.equal(result.txHash,hash);
 assert.equal(result.deployer,wallet);
 assert.equal(result.verified.status,"onchain-deployment-verified");
 assert.equal(result.verified.provenance.kind,"factory-registry");
 assert.equal(result.input.expectedDeployer,wallet);
 assert.match(deploymentReceiptPath(result.verified),
  /^deployments\/receipts\/arbitrum\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/);
});
test("same Registry event works for direct MetaMask Factory transaction",async()=>{
 const transaction={...baseTx,to:factory,input:selector("deployRegistry()")};
 const result=await recover(fakeRpc({transaction,receipt:{...receipt,to:factory}}));
 assert.equal(result.verified.provenance.factory,factory);
});
test("event proof rejects failed receipts and foreign Registry events",()=>{
 assert.throws(()=>verifyFactoryRegistryReceipt({
  factory,registry,txHash:hash,event,transaction:baseTx,
  receipt:{...receipt,status:"0x0"}}),/not successful/);
 assert.throws(()=>verifyFactoryRegistryReceipt({
  factory,registry,txHash:hash,transaction:baseTx,event,
  receipt:{...receipt,logs:[{...event,address:executor}]}}),/not emitted/);
 assert.throws(()=>verifyFactoryRegistryReceipt({
  factory,registry,txHash:hash,transaction:baseTx,event,
  receipt:{...receipt,blockHash:"0x"+"c".repeat(64)}}),/canonical receipt block/);
});
test("Factory.registry zero means a new wallet-confirmed Registry call is still needed",async()=>{
 const empty=async(...args)=>{
  const r=await fakeRpc()(...args);
  return args[1]==="eth_call"&&args[2][0].data===selector("registry()")?word(0):r;
 };
 assert.equal(await recover(empty),null);
});

test("normal chain reconcile documents original Factory deployment despite unrelated latest MetaMask transaction",async()=>{
 const stateDir=mkdtempSync(join(tmpdir(),"xita-registry-reconcile-"));
 try{
  const sourceCommit="a".repeat(40);
  const factoryBlock=JSON.parse(readFileSync(join(root,components.factory.receiptPath),"utf8")).blockNumber;
  const creationBlock="0x"+(factoryBlock+2).toString(16);
  const head="0x"+(factoryBlock+200).toString(16);
  const creationEvent={...event,blockNumber:creationBlock};
  const creationReceipt={...receipt,blockNumber:creationBlock,logs:[creationEvent]};
  const rpc=async(url,method,params)=>{
   if(method==="eth_blockNumber")return head;
   if(method==="eth_getLogs")return [creationEvent];
   if(method==="eth_getTransactionReceipt")return params[0]===hash?creationReceipt:null;
   if(method==="eth_getBlockByNumber")return {hash:blockHash,number:creationBlock};
   return fakeRpc()(url,method,params);
  };
  const journal=deploymentIntents({directory:join(stateDir,"wallet-intents"),
   chains:[{name:"arbitrum",chainId:42161}]});
  const intent="arbitrum:sourceRegistry";
  journal.prepare({
   id:intent,chainId:42161,sourceCommit,wallet,buildHash:"c".repeat(64),
   artifactHash:"d".repeat(64),parameters:{},
   transaction:{from:wallet,to:factory,data:selector("deployRegistry()"),
    nonce:"0x8",gas:"0x100000",value:"0x0"}
  });
  const unrelatedHash="0x"+"e".repeat(64);
  journal.attachHash(intent,unrelatedHash);
  let published=null;
  const operator=createChainOperator({root,stateDir,publicEvidenceDir:stateDir,rpc,
   mainCheck:async()=>sourceCommit,
   build:async()=>({artifacts:{sourceRegistry:artifact}}),
   publish:async(_root,items)=>{published=items;return {commit:sourceCommit};}
  });
  const result=await operator.reconcile({id:intent});
  assert.equal(result.stage,"documented");
  assert.equal(result.txHash,hash);
  assert.equal(published?.[0].txHash,hash);
  assert.equal(published?.[0].component,"sourceRegistry");
  assert.equal(journal.read().entries[intent],undefined);
 }finally{rmSync(stateDir,{recursive:true,force:true})}
});
