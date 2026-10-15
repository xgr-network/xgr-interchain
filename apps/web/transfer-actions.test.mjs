import test from "node:test";
import assert from "node:assert/strict";
import {selector,keccak256} from "./keccak.js";
import {amountToUnits,quoteCalldata,bridgeCalldata,startTransfer,resumeDelivery} from "./transfer-actions.js";
import {DISPATCH_TOPIC,OPERATION_TOPIC} from "./wallet-transfers.js";
const address=n=>"0x"+n.repeat(40),hash=n=>"0x"+n.repeat(64);
const account=address("e"),srcRouter=address("6"),dstRouter=address("7");
const gateway=address("8"),reverseGateway=address("9"),srcMailbox=address("3"),dstMailbox=address("4");
const routeId=hash("a"),reverseId=hash("b"),sourceTx=hash("c"),targetTx=hash("d");
const word=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
function item(chain,addr){
 return {address:addr,runtimeCodeKeccak256:hash("f"),receiptPath:
  "deployments/receipts/"+chain+"/"+hash("a").slice(2)+"-"+addr.slice(2)+".json"};
}
function infrastructure(chain){
 const ids={factory:"1",sourceRegistry:"2",mailbox:chain==="xgrchain"?"3":"4",
  ism:"5",validatorRegistry:"a"};
 const components=Object.fromEntries(Object.entries(ids).map(([name,n])=>
  [name,item(chain,address(n))]));
 return {present:true,chainId:chain==="xgrchain"?1643:8453,
  xitaV315:{components,receiptPaths:Object.values(components).map(c=>c.receiptPath)}};
}
function catalog(){
 const routers=[{chain:"xgrchain",component:"nativeRouter",...item("xgrchain",srcRouter)},
 {chain:"base",component:"syntheticRouter",...item("base",dstRouter)}];
 const getRoute=(routeName,sourceChain,destinationChain,routeId,gateway,n)=>
  ({routeName,sourceChain,destinationChain,routeId,components:{
    gateway:item(sourceChain,gateway),feeVault:item(sourceChain,address(n))}});
 const deployments=[
  getRoute("xgr_to_base","xgrchain","base",routeId,gateway,"b"),
  getRoute("base_to_xgr","base","xgrchain",reverseId,reverseGateway,"c")];
 return {chains:{
  xgrchain:{name:"xgrchain",chainId:1643,domainId:1643,confirmations:1,rpcUrls:["https://rpc.example/xgr"]},
  base:{name:"base",chainId:8453,domainId:8453,confirmations:1,rpcUrls:["https://rpc.example/base"]}
 },infrastructure:{xgrchain:infrastructure("xgrchain"),base:infrastructure("base")},
 assets:{XGR:{metadata:{assetId:hash("f"),decimals:18},
  routes:{routes:[
    {name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"},
    {name:"base_to_xgr",sourceChain:"base",destinationChain:"xgrchain"}]},
  deployment:{present:true,assetId:hash("f"),representations:routers,
   routeDeployments:deployments,receiptPaths:[
    ...routers.map(r=>r.receiptPath),...deployments.flatMap(d=>
    [d.components.gateway.receiptPath,d.components.feeVault.receiptPath])]}}}};
}
function sourceProvider(sends,overrides={}){
 return {request:async({method,params=[]})=>{
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_accounts")return [account];
  if(method==="eth_call"){
   const data=params[0]?.data?.slice(0,10);
   if(data===selector("warpRouter()"))return word(BigInt(srcRouter));
   if(data===selector("warpToken()"))return word(0);
   if(data===selector("routeId()"))return routeId;
   if(data===selector("destinationDomain()"))return word(8453);
   if(data===selector("quoteILN(uint32,bytes32,uint256)")){
    const amount=100000000000000000n,fee=100000000000000n;
    return word(fee)+word(amount).slice(2)+word(amount+fee).slice(2)+word(0).slice(2);
   }
  }
  if(method==="eth_estimateGas")return "0x5208";
  if(method==="eth_getBalance")return "0x"+(1n*10n**18n).toString(16);
  if(method==="eth_gasPrice")return "0x3b9aca00";
  if(method==="eth_getTransactionCount")return overrides.pendingNonce&&params[1]==="pending"?"0x2":"0x1";
  if(method==="eth_sendTransaction"){sends.push(params[0]);return sourceTx;}
  if(overrides[method])return overrides[method]({params});
  throw Error("Unexpected wallet method: "+method);
 }};
}
const rpcResponse=(result)=>({ok:true,json:async()=>({jsonrpc:"2.0",id:1,result})});
const testFetch=(result="0x"+(1n*10n**18n).toString(16))=>async(url,options)=>{
 if(url==="/api/xeta/v1/transfer/health")return {ok:true,json:async()=>({ok:true,proofBuilder:"installed"})};
 return rpcResponse(JSON.parse(options.body).method==="eth_chainId"?"0x2105":result);
};
test("amount conversion and Gateway ABI are fixed, with no floating point",()=>{
 assert.equal(amountToUnits("1.125",18),1125000000000000000n);
 assert.throws(()=>amountToUnits("0",18),/positive/);
 assert.throws(()=>amountToUnits("1e12",18),/valid/);
 assert.throws(()=>amountToUnits("1.0000000000000000001",18),/decimal/);
 assert.equal(quoteCalldata(8453,account,1n).slice(0,10),selector("quoteILN(uint32,bytes32,uint256)"));
 assert.equal(bridgeCalldata(8453,account,1n).slice(0,10),selector("bridge(uint32,bytes32,uint256)"));
});
test("source bridge quotes, checks native gas and sends exactly one canonical Gateway call",async()=>{
 const sends=[];
 const fetcher=testFetch();
 const result=await startTransfer({catalog:catalog(),account,asset:"XGR",source:"xgrchain",
  destination:"base",amount:"0.1",provider:sourceProvider(sends),fetcher});
 assert.equal(result.txHash,sourceTx);
 assert.equal(sends.length,1);
 assert.equal(sends[0].to,gateway);
 assert.equal(sends[0].value,"0x"+(100100000000000000n).toString(16));
 assert.ok(sends[0].data.startsWith(selector("bridge(uint32,bytes32,uint256)")));
});
test("wallet with no destination-native gas never submits source lock",async()=>{
 const sends=[];
 await assert.rejects(()=>startTransfer({catalog:catalog(),account,asset:"XGR",
  source:"xgrchain",destination:"base",amount:"0.1",provider:sourceProvider(sends),
  fetcher:testFetch("0x0")}),/Destination wallet needs native gas/);
 assert.equal(sends.length,0);
});
function sourceLogs(){
 const msg=Uint8Array.from([1,2,3,4,5,6]);
 const messageId=keccak256(msg);
 const dispatchData="0x"+word(32).slice(2)+word(msg.length).slice(2)+
  [...msg].map(x=>x.toString(16).padStart(2,"0")).join("").padEnd(64,"0");
 return {messageId,logs:[
  {address:gateway,topics:[OPERATION_TOPIC,routeId,messageId,word(8453)],data:word(100000000000000n)},
  {address:srcMailbox,topics:[DISPATCH_TOPIC,word(BigInt(srcRouter)),word(8453),word(1)],data:dispatchData}
 ]};
}
test("if source is confirmed but proof is pending, retry never sends a source or destination transaction",async()=>{
 const c=catalog(),{messageId,logs}=sourceLogs(),sent=[];
 const record={account,sourceChain:"xgrchain",destinationChain:"base",asset:"XGR",
  txHash:sourceTx,messageId,status:"awaiting-proof"};
 const fetcher=async(url,options)=>{
  if(url.startsWith("/api/xeta/"))return {ok:true,json:async()=>({ok:true,status:"PENDING",messageId})};
  const {method}=JSON.parse(options.body);
  let result;
  if(method==="eth_chainId")result=url.includes("xgr")?"0x66b":"0x2105";
  else if(method==="eth_getTransactionByHash")result={hash:sourceTx,from:account,to:gateway};
  else if(method==="eth_getTransactionReceipt")result={
   transactionHash:sourceTx,from:account,to:gateway,status:"0x1",blockNumber:"0x10",logs};
  else if(method==="eth_blockNumber")result="0x64";
  else if(method==="eth_call")result=word(0);
  else throw Error(method);
  return rpcResponse(result);
 };
 const provider={request:async({method})=>{sent.push(method);throw Error("Never touch wallet if proof unavailable")}};
 const result=await resumeDelivery({catalog:c,account,record,provider,fetcher});
 assert.equal(result.status,"waiting");
 assert.deepEqual(sent,[]);
});

test("an unresolved wallet nonce blocks a second source lock after reload",async()=>{
 const sent=[];
 await assert.rejects(()=>startTransfer({catalog:catalog(),account,asset:"XGR",source:"xgrchain",
  destination:"base",amount:"0.1",provider:sourceProvider(sent,{pendingNonce:true}),
  fetcher:testFetch()}),/pending/);
 assert.equal(sent.length,0);
});

test("missing unsigned recovery service must prevent any source token lock",async()=>{
 const sends=[];
 await assert.rejects(()=>startTransfer({catalog:catalog(),account,asset:"XGR",source:"xgrchain",
  destination:"base",amount:"0.1",provider:sourceProvider(sends),
  fetcher:async()=>({ok:false,status:503})}),/recovery infrastructure unavailable/);
 assert.equal(sends.length,0);
});
