import test from "node:test";
import assert from "node:assert/strict";
import {Interface,keccak256} from "ethers";
import {deployedFixture} from "../../apps/web/deployed-test-fixture.mjs";
import {inspectRouteReadiness,resolveRouteAudit} from "./route-readiness.mjs";

const addr=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
const code="0x6001",codeHash=keccak256(code),ZERO=addr("0");
const GW=new Interface([
 "function ilnRegistry() view returns (address)","function warpRouter() view returns (address)",
 "function warpToken() view returns (address)","function routeId() view returns (bytes32)",
 "function destinationDomain() view returns (uint32)","function feeVault() view returns (address)",
 "function mailbox() view returns (address)","function dispatchHook() view returns (address)",
 "function destinationRouter() view returns (address)",
 "function quoteILN(uint32,bytes32,uint256) view returns (uint256,uint256,uint256,uint256)"
]);
const RT=new Interface([
 "function token() view returns (address)",
 "function xetaRouteIdForDomain(uint32) view returns (bytes32)",
 "function verifyInboundRoute(uint64,uint32,address,bytes32) view returns (bool)"
]);
const VAULT=new Interface([
 "function gateway() view returns (address)","function routeId() view returns (bytes32)",
 "function destinationDomain() view returns (uint32)",
 "function validatorRegistry() view returns (address)",
 "function recipientCount() view returns (uint256)","function recipientSetId() view returns (uint64)"
]);
const REG=new Interface([
 "function getRoute(uint32,bytes32) view returns (uint64,uint32,address,address,address,address,address,uint256,bool)",
 "function assetRoute(uint32,bytes32) view returns (bytes32,uint64,address,address)",
 "function sourceChainId() view returns (uint64)",
 "function sourceDomain() view returns (uint32)"
]);
const ISM=new Interface(["function registry() view returns (address)",
 "function destinationDomain() view returns (uint32)"]);
const VS=new Interface(["function setId() view returns (uint64)"]);
const EX=new Interface(["function sourceRegistry() view returns (address)",
 "function serviceWallet() view returns (address)"]);
const ERC=new Interface(["function decimals() view returns (uint8)"]);
const comp=(chain,id)=>{const address=addr(id);return {address,
 runtimeCodeKeccak256:codeHash,
 receiptPath:"deployments/receipts/"+chain+"/"+("f".repeat(64))+"-"+address.slice(2)+".json"}};
function scenario({canonical="xgrchain",invalidInbound=false,collateralAddress=null}={}){
 const asset=deployedFixture("ZZZ",canonical);
 asset.metadata.decimals=18;
 if(canonical==="base"&&collateralAddress)
  asset.metadata.representations.find(r=>r.chain==="base").assetAddress=collateralAddress;
 asset.deployment.representations=asset.deployment.representations.map(r=>({
  ...r,runtimeCodeKeccak256:codeHash}));
 for(const record of asset.deployment.routeDeployments){
  for(const component of Object.values(record.components))
   component.runtimeCodeKeccak256=codeHash;
 }
 const comps={};
 for(const name of ["xgrchain","base"]){
  const records=Object.fromEntries(["factory","sourceRegistry","mailbox",
    "dispatchHook","ism","validatorRegistry","executionGateway"].map((key,i)=>
    [key,comp(name,"abcdef1"[i])]));
  comps[name]={present:true,chainId:name==="xgrchain"?1643:8453,
   xitaV315:{components:records,receiptPaths:Object.values(records).map(x=>x.receiptPath)}};
 }
 const catalog={chains:{
  xgrchain:{chainId:1643,domainId:1643,rpcUrls:["https://example.test/xgr"]},
  base:{chainId:8453,domainId:8453,rpcUrls:["https://example.test/base"]}
 },infrastructure:comps,assets:{ZZZ:asset}};
 const first=canonical,other=canonical==="xgrchain"?"base":"xgrchain";
 const [route,reverse]=asset.deployment.routeDeployments;
 const srcCore=comps[first].xitaV315.components,dstCore=comps[other].xitaV315.components;
 const sourceRouter=asset.deployment.representations.find(r=>r.chain===first).address;
 const destinationRouter=asset.deployment.representations.find(r=>r.chain===other).address;
 const gateway=route.components.gateway.address,vault=route.components.feeVault.address;
 const reverseGateway=reverse.components.gateway.address;
 const val=100000000000000000n,amount=10n**18n;
 const expectedToken=canonical==="xgrchain"?ZERO:
  asset.metadata.representations.find(r=>r.chain===first).assetAddress;
 const answers=new Map();
 const add=(chain,address,iface,fn,value)=>answers.set(
  chain+":"+address.toLowerCase()+":"+iface.getFunction(fn).selector,
  iface.encodeFunctionResult(fn,Array.isArray(value)?value:[value]));
 const d=catalog.chains[other],s=catalog.chains[first];
 const sg=(fn,v)=>add(first,gateway,GW,fn,v);
 sg("ilnRegistry",srcCore.sourceRegistry.address);
 sg("warpRouter",sourceRouter);sg("warpToken",expectedToken);
 sg("routeId",route.routeId);sg("destinationDomain",d.domainId);
 sg("feeVault",vault);sg("mailbox",srcCore.mailbox.address);
 sg("dispatchHook",srcCore.dispatchHook.address);
 sg("destinationRouter",destinationRouter);
 sg("quoteILN",[val,canonical==="xgrchain"?amount:0n,
  canonical==="xgrchain"?amount+val:val,canonical==="xgrchain"?0n:amount]);
 add(first,sourceRouter,RT,"token",expectedToken);
 add(first,sourceRouter,RT,"xetaRouteIdForDomain",route.routeId);
 add(first,sourceRouter,RT,"verifyInboundRoute",true);
 add(other,destinationRouter,RT,"xetaRouteIdForDomain",reverse.routeId);
 add(other,destinationRouter,RT,"verifyInboundRoute",!invalidInbound);
 for(const [fn,v] of [
  ["gateway",gateway],["routeId",route.routeId],["destinationDomain",d.domainId],
  ["validatorRegistry",srcCore.validatorRegistry.address],
  ["recipientCount",3n],["recipientSetId",1n]])add(first,vault,VAULT,fn,v);
 add(first,srcCore.sourceRegistry.address,REG,"getRoute",[
  s.chainId,s.domainId,gateway,sourceRouter,srcCore.mailbox.address,
  srcCore.dispatchHook.address,destinationRouter,val,true
 ]);
 add(first,srcCore.sourceRegistry.address,REG,"assetRoute",[
  asset.metadata.assetId,d.chainId,expectedToken,ZERO
 ]);
 add(other,dstCore.ism.address,ISM,"registry",dstCore.validatorRegistry.address);
 add(other,dstCore.ism.address,ISM,"destinationDomain",d.domainId);
 add(other,dstCore.validatorRegistry.address,VS,"setId",1n);
 add(first,srcCore.executionGateway.address,EX,"sourceRegistry",srcCore.sourceRegistry.address);
 add(first,srcCore.executionGateway.address,EX,"serviceWallet",addr("b"));
 if(canonical==="base")add(first,expectedToken,ERC,"decimals",18);
 const rpc=async(name,method,params)=>{
  if(method==="eth_chainId")return "0x"+BigInt(catalog.chains[name].chainId).toString(16);
  if(method==="eth_getCode")return code;
  if(method==="eth_call"){
   const key=name+":"+params[0].to.toLowerCase()+":"+params[0].data.slice(0,10);
   const answer=answers.get(key);
   if(!answer)throw Error("unexpected view "+key);
   return answer;
  }
  throw Error("unexpected RPC method "+method);
 };
 return {catalog,first,other,rpc,answers,sourceRouter,expectedToken};
}
test("native XGR route passes read-only contract, registry, reverse-router and fee checks",async()=>{
 const a=scenario();
 const result=await inspectRouteReadiness({catalog:a.catalog,
  asset:"ZZZ",source:a.first,destination:a.other,rpc:a.rpc});
 assert.equal(result.status,"ready-read-only",JSON.stringify(result));
 assert.equal(result.validatorFeeWei,"100000000000000000");
 assert.ok(result.checks.includes("destination-inbound-route"));
 assert.ok(result.checks.includes("source-gateway-quote"));
});
test("collateral token does not require operator to own or approve any original ERC20",async()=>{
 const a=scenario({canonical:"base",collateralAddress:addr("9")});
 const result=await inspectRouteReadiness({catalog:a.catalog,
  asset:"ZZZ",source:a.first,destination:a.other,rpc:a.rpc});
 assert.equal(result.status,"ready-read-only",JSON.stringify(result));
 assert.ok(result.checks.includes("original-token-decimals"));
 assert.ok(result.limitations.some(x=>x.includes("non-standard")||x.includes("Non-standard")));
});
test("destination rejecting the origin route blocks readiness before a user lock",async()=>{
 const a=scenario({invalidInbound:true});
 const result=await inspectRouteReadiness({catalog:a.catalog,
  asset:"ZZZ",source:a.first,destination:a.other,rpc:a.rpc});
 assert.equal(result.status,"blocked");
 assert.equal(result.stage,"destination-inbound-route");
 assert.match(result.error,/rejects signed inbound route/);
});
test("unexpected runtime bytecode blocks readiness despite correctly shaped catalog receipts",async()=>{
 const a=scenario();
 const wrong=async(name,method,params)=>method==="eth_getCode"?"0x6002":a.rpc(name,method,params);
 const result=await inspectRouteReadiness({catalog:a.catalog,asset:"ZZZ",
  source:a.first,destination:a.other,rpc:wrong});
 assert.equal(result.status,"blocked");
 assert.match(result.error,/runtime does not match/);
});
test("catalog verification requires the bidirectional real deployed route",()=>{
 const a=scenario(),asset=a.catalog.assets.ZZZ;
 asset.deployment.routeDeployments.splice(1,1);
 assert.throws(()=>resolveRouteAudit(a.catalog,{
  asset:"ZZZ",source:a.first,destination:a.other}),/bidirectional/);
});
