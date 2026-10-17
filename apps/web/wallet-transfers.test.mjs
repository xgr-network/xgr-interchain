import test from "node:test";
import assert from "node:assert/strict";
import {keccak256,selector} from "./keccak.js";
import {configuredGatewayRoutes,dispatchMessage,findWalletSourceTx,scanRecentWalletTransfers,OPERATION_TOPIC,DISPATCH_TOPIC,INTERCHAIN_FEE_TOPIC} from "./wallet-transfers.js";
const addr=d=>"0x"+d.repeat(40), hash=d=>"0x"+d.repeat(64);
const user=addr("a"),other=addr("b"),gateway=addr("1"),srcMailbox=addr("2"),dstMailbox=addr("3"),srcRouter=addr("4");
const routeId=hash("5"), txHash=hash("6"),toTopic=(v)=>"0x"+BigInt(v).toString(16).padStart(64,"0");
const hexBytes=bytes=>"0x"+Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const message=Uint8Array.from([1,2,3,4,5,6,7,8,9]);
const messageId=keccak256(message);
const paddedMessage=hexBytes(message).slice(2).padEnd(64,"0");
const dispatchData="0x"+toTopic(32).slice(2)+toTopic(message.length).slice(2)+paddedMessage;
const cat={chains:{
 xgrchain:{chainId:1643,domainId:1643,confirmations:1,rpcUrls:["https://rpc.example/xgr"]},
 base:{chainId:8453,domainId:8453,confirmations:1,rpcUrls:["https://rpc.example/base"]}
},infrastructure:{
 xgrchain:{xitaV315:{components:{mailbox:{address:srcMailbox}}}},
 base:{xitaV315:{components:{mailbox:{address:dstMailbox}}}}
},assets:{XGR:{
 routes:{routes:[{name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"}]},
 deployment:{present:true,assetId:hash("f"),representations:[{chain:"xgrchain",address:srcRouter}],
  routeDeployments:[{routeName:"xgr_to_base",routeId,sourceChain:"xgrchain",destinationChain:"base",
   components:{gateway:{address:gateway}}}]}}
}};
const receipt={from:user,to:gateway,transactionHash:txHash,status:"0x1",blockNumber:"0x10",
 logs:[
  {address:gateway,topics:[OPERATION_TOPIC,routeId,messageId,toTopic(8453)],data:toTopic(100000000000000000n)},
  {address:srcMailbox,topics:[DISPATCH_TOPIC,toTopic(BigInt(srcRouter)),toTopic(8453),toTopic(1)],data:dispatchData}
 ]};
function mockRPC({from=user,receiptObject=receipt,delivered=false,changedMessage=false}={}){
 const calls=[];
 return {calls,rpc:async(url,method,args)=>{
  calls.push({url,method,args});
  if(method==="eth_chainId")return url.includes("/xgr")?"0x66b":"0x2105";
  if(method==="eth_getTransactionByHash")return {from,to:gateway,hash:txHash};
  if(method==="eth_getTransactionReceipt")return receiptObject;
  if(method==="eth_blockNumber")return "0x64";
  if(method==="eth_call")return delivered?toTopic(1):toTopic(0);
  if(method==="eth_getLogs")return receipt.logs.slice(0,1).map(l=>({...l,transactionHash:txHash}));
  throw Error(method);
 }};
}
test("route discovery only exposes canonical deployed Gateway and paired mailbox",()=>{
 const r=configuredGatewayRoutes(cat);
 assert.equal(r.length,1);
 assert.equal(r[0].gateway,gateway);
 assert.equal(r[0].sourceRouter,srcRouter);
 assert.deepEqual(configuredGatewayRoutes({...cat,assets:{XGR:{...cat.assets.XGR,deployment:{present:false}}}}),[]);
});
test("exact Dispatch ABI payload yields source message ID",()=>{
 assert.equal(keccak256(dispatchMessage(dispatchData)),messageId);
 assert.throws(()=>dispatchMessage("0x"),/Malformed/);
 assert.throws(()=>dispatchMessage("0x"+toTopic(64).slice(2)+dispatchData.slice(66)),/offset/);
});
test("verified successful source can be delivered or pending proof",async()=>{
 const m=mockRPC();
 const result=await findWalletSourceTx({catalog:cat,account:user,sourceChain:"xgrchain",txHash,rpc:m.rpc});
 assert.equal(result.messageId,messageId);
 assert.equal(result.status,"awaiting-proof");
 assert.equal(result.delivered,false);
 assert.equal(result.validatorFeeWei,"100000000000000000");
 assert.ok(m.calls.some(c=>c.method==="eth_call"&&c.args[0].to===dstMailbox));
 const delivered=await findWalletSourceTx({catalog:cat,account:user,sourceChain:"xgrchain",txHash,
  rpc:mockRPC({delivered:true}).rpc});
 assert.equal(delivered.status,"delivered");
});
test("failed and pending source cannot advertise a recoverable proof",async()=>{
 const pending=await findWalletSourceTx({catalog:cat,account:user,sourceChain:"xgrchain",txHash,
  rpc:mockRPC({receiptObject:null}).rpc});
 assert.equal(pending.status,"pending-source");
 assert.equal(pending.messageId,null);
 const failure=await findWalletSourceTx({catalog:cat,account:user,sourceChain:"xgrchain",txHash,
  rpc:mockRPC({receiptObject:{...receipt,status:"0x0"}}).rpc});
 assert.equal(failure.status,"source-failed");
});
test("wallet mismatch or untrusted source Dispatch cannot be claimed",async()=>{
 await assert.rejects(()=>findWalletSourceTx({catalog:cat,account:other,sourceChain:"xgrchain",txHash,
  rpc:mockRPC().rpc}),/not from/);
 await assert.rejects(()=>findWalletSourceTx({catalog:cat,account:user,sourceChain:"xgrchain",txHash,
  rpc:mockRPC({receiptObject:{...receipt,logs:receipt.logs.slice(0,1)}}).rpc}),/Mailbox Dispatch/);
 await assert.rejects(()=>findWalletSourceTx({catalog:cat,account:user,sourceChain:"xgrchain",txHash,
  rpc:mockRPC({receiptObject:{...receipt,logs:receipt.logs.map(x=>x.address===srcMailbox?{...x,data:"0x"}:x)}}).rpc}),/Mailbox Dispatch/);
});
test("verified source with unavailable destination is unknown, not delivered",async()=>{
 const r=await findWalletSourceTx({catalog:cat,account:user,sourceChain:"xgrchain",txHash,
  rpc:async(url,m,p)=>{if(url.includes("/base"))throw Error("RPC unreachable");return mockRPC().rpc(url,m,p)}});
 assert.equal(r.status,"delivery-unknown");
 assert.equal(r.delivered,null);
});
test("bounded recent scan includes only wallet-owned canonical gateway txs",async()=>{
 const {rpc}=mockRPC();
 const result=await scanRecentWalletTransfers({catalog:cat,account:user,rpc,lookback:32,max:5});
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].messageId,messageId);
 assert.equal(result.limited,false);
 const blocked=await scanRecentWalletTransfers({catalog:cat,account:other,rpc,lookback:32,max:5});
 assert.equal(blocked.items.length,0);
});

test("source fee adapter is verified using canonical Gateway, Mailbox and fee event",async()=>{
 const adapter=addr("c"),component={address:adapter,
  runtimeCodeKeccak256:hash("f"),
  receiptPath:"deployments/receipts/xgrchain/"+("b".repeat(64))+"-"+adapter.slice(2)+".json"};
 const catalog=structuredClone(cat);
 catalog.infrastructure.xgrchain.xitaV315.components.executionGateway=component;
 catalog.infrastructure.xgrchain.xitaV315.receiptPaths=[component.receiptPath];
 const fields=[routeId,toTopic(8453),toTopic(BigInt(user)),toTopic(8453),
  toTopic(BigInt(user)),hash("0"),toTopic(1000),toTopic(100000000000000000n),
  toTopic(100000000000000000n),toTopic(2000),toTopic(42)];
 const feeLog={address:adapter,topics:[INTERCHAIN_FEE_TOPIC,messageId,
  toTopic(BigInt(user)),toTopic(BigInt(gateway))],
  data:"0x"+fields.map(w=>w.slice(2)).join("")};
 const adapted={...receipt,to:adapter,logs:[...receipt.logs,feeLog]};
 const execute=selector("execute((address,address,bytes32,uint32,bytes32,uint32,bytes32,bytes32,uint256,uint256,uint256,uint256,uint64),bytes)");
 const rpc=async(url,method,args)=>{
  if(method==="eth_getTransactionByHash")return {from:user,to:adapter,
    input:execute+"0".repeat(13*64),hash:txHash};
  return mockRPC({receiptObject:adapted,delivered:true}).rpc(url,method,args);
 };
 const result=await findWalletSourceTx({catalog,account:user,sourceChain:"xgrchain",txHash,rpc});
 assert.equal(result.status,"delivered");
 assert.equal(result.interchainFeeWei,"2000");
 assert.equal(result.executionAdapter,adapter);
 assert.equal(result.finalDestinationChain,"base");
 assert.equal(result.onwardRouteId,null);
 const tampered={...adapted,logs:[...receipt.logs,{...feeLog,data:"0x"+fields.map((w,i)=>
   (i===9?toTopic(0):w).slice(2)).join("")}]};
 await assert.rejects(()=>findWalletSourceTx({catalog,account:user,
  sourceChain:"xgrchain",txHash,rpc:async(url,method,args)=>
   method==="eth_getTransactionByHash"?{from:user,to:adapter,input:execute+"0".repeat(13*64)}:
    mockRPC({receiptObject:tampered}).rpc(url,method,args)}),
   /Interchain Fee evidence/);
});
