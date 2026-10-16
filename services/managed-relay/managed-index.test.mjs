import test from "node:test";
import assert from "node:assert/strict";
import {Interface,keccak256,zeroPadValue} from "ethers";
import {managedAbi,managedDispatchTopic,verifiedManagedReceipt,mergeIndexedMessage}
 from "./managed-index.mjs";
const addr=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
const iface=new Interface(managedAbi);
const g=new Interface(["event ILNOperation(bytes32 indexed routeId,bytes32 indexed messageId,uint32 indexed destinationDomain,uint256 validatorFeeWei)"]);
const m=new Interface(["event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)"]);
const payload="0x"+"a1".repeat(120),id=keccak256(payload);
function manifest(){
 const chains=["xgrchain","base"],core={};
 const comp=(chain,i)=>({address:addr(i),runtimeCodeKeccak256:hash("f"),
 receiptPath:"deployments/receipts/"+chain+"/"+("b".repeat(64))+"-"+addr(i).slice(2)+".json"});
 for(const chain of chains){
  const components={};for(const [i,name] of ["factory","sourceRegistry","mailbox","ism","validatorRegistry"].entries())
   components[name]=comp(chain,(i+1).toString(16));
  core[chain]={present:true,chainId:chain==="base"?8453:1643,
   xitaV315:{components,receiptPaths:Object.values(components).map(c=>c.receiptPath)}};
 }
 const representations=[{chain:"xgrchain",component:"nativeRouter",...comp("xgrchain","7")},
 {chain:"base",component:"syntheticRouter",...comp("base","8")}];
 const gateway=comp("xgrchain","9"),feeVault=comp("xgrchain","a");
 return {
 chains:{xgrchain:{chainId:1643,domainId:1643},base:{chainId:8453,domainId:8453}},
 infrastructure:core,
 assets:{XGR:{metadata:{assetId:hash("c")},
 routes:{routes:[{name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"}]},
 deployment:{present:true,assetId:hash("c"),representations,
 routeDeployments:[{routeName:"xgr_to_base",routeId:hash("d"),
 sourceChain:"xgrchain",destinationChain:"base",components:{gateway,feeVault}}],
 receiptPaths:[...representations.map(r=>r.receiptPath),gateway.receiptPath,feeVault.receiptPath]}}}
 };
}
function log(abi,name,values,address){
 const fragment=abi.getEvent(name),data=abi.encodeEventLog(fragment,values);
 return {...data,address};
}
function receipt(){
 const sourceGateway=addr("9"),sourceRouter=addr("7"),sourceMailbox=addr("3");
 const execution=addr("e"),targetRouter=addr("8"),rid=hash("d");
 return {status:1,hash:hash("1"),blockHash:hash("2"),blockNumber:1300,
  logs:[
   log(g,"ILNOperation",[rid,id,8453,1n],sourceGateway),
   log(m,"Dispatch",[sourceRouter,8453,zeroPadValue(targetRouter,32),payload],sourceMailbox),
   log(iface,"ManagedDispatch",[
    id,addr("b"),sourceGateway,rid,8453,zeroPadValue(addr("c"),32),
    1000n,1n,150n,70n,11n
   ],execution)
  ]};
}
test("single adapter source event recovers canonical Gateway operation and Dispatch",()=>{
 assert.match(managedDispatchTopic,/^0x[0-9a-f]{64}$/);
 const evidence=verifiedManagedReceipt({catalog:manifest(),sourceChain:"xgrchain",
  executionAddress:addr("e"),receipt:receipt()});
 assert.equal(evidence.messageId,id.toLowerCase());
 assert.equal(evidence.serviceFeeWei,"70");
 assert.equal(evidence.sourceTxHash,hash("1"));
 assert.equal(evidence.destinationTxHash,null);
 assert.equal(evidence.destinationChain,"base");
});
test("never trusts arbitrary relayer TX, fake adapter, wrong route or event mismatch",()=>{
 const params={catalog:manifest(),sourceChain:"xgrchain",executionAddress:addr("e"),receipt:receipt()};
 for(const change of [
  {executionAddress:addr("f")},
  {receipt:{...receipt(),status:0}},
  {receipt:{...receipt(),logs:receipt().logs.slice(0,2)}},
  {receipt:{...receipt(),logs:[...receipt().logs,receipt().logs[2]]}},
  {receipt:{...receipt(),logs:receipt().logs.filter(x=>x.address!==addr("9"))}},
  {receipt:{...receipt(),logs:receipt().logs.filter(x=>x.address!==addr("3"))}},
 ]){
  assert.throws(()=>verifiedManagedReceipt({...params,...change}));
 }
});
test("duplicated message is idempotent but divergent source hash never overwrites evidence",()=>{
 const record=verifiedManagedReceipt({catalog:manifest(),sourceChain:"xgrchain",
  executionAddress:addr("e"),receipt:receipt()});
 const first=mergeIndexedMessage({},record);
 assert.equal(first.added,true);
 assert.equal(mergeIndexedMessage(first.state,record).added,false);
 assert.throws(()=>mergeIndexedMessage(first.state,{...record,sourceTxHash:hash("f")}),/Conflicting/);
});
