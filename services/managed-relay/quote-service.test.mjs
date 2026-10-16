import test from "node:test";
import assert from "node:assert/strict";
import {Wallet,verifyTypedData} from "ethers";
import {buildManagedQuote,MANAGED_QUOTE_TYPES} from "./quote-service.mjs";
const address=n=>"0x"+n.toString(16).padStart(40,"0");
const hash=x=>"0x"+x.repeat(64);
const signer=new Wallet("0x"+"11".repeat(32));
const now=1729000000000;
const c={chains:{
 xgrchain:{chainId:1643,domainId:1643,rpcUrls:["https://rpc.example/xgr"]},
 base:{chainId:8453,domainId:8453,rpcUrls:["https://rpc.example/base"]}
},infrastructure:{
 xgrchain:{present:true,chainId:1643,xitaV315:{receiptPaths:[],components:{}}},
 base:{present:true,chainId:8453,xitaV315:{receiptPaths:[],components:{}}}
},assets:{}};
function record(chain,n){const a=address(n);return{address:a,runtimeCodeKeccak256:hash("a"),
 receiptPath:"deployments/receipts/"+chain+"/"+("b".repeat(64))+"-"+a.slice(2)+".json"}}
function fixture(){
 const cat=structuredClone(c);
 for(const chain of ["xgrchain","base"]){
  const core=cat.infrastructure[chain].xitaV315,comps={};
  for(const key of ["factory","sourceRegistry","mailbox","ism","validatorRegistry"]){
   comps[key]=record(chain,Object.keys(comps).length+1);
   core.receiptPaths.push(comps[key].receiptPath);
  }
  core.components=comps;
 }
 const gateway=record("xgrchain",14),vault=record("xgrchain",15);
 const source=record("xgrchain",20),destination=record("base",21);
 const assetId=hash("d"),routeId=hash("f");
 cat.assets.XGR={metadata:{assetId},routes:{routes:[
  {name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"}]},
 deployment:{present:true,assetId,representations:[
  {chain:"xgrchain",component:"nativeRouter",...source},
  {chain:"base",component:"syntheticRouter",...destination}],
 routeDeployments:[{routeName:"xgr_to_base",sourceChain:"xgrchain",
  destinationChain:"base",routeId,components:{gateway,feeVault:vault}}],
 receiptPaths:[source.receiptPath,destination.receiptPath,gateway.receiptPath,vault.receiptPath]}};
 return cat;
}
const request={asset:"XGR",source:"xgrchain",destination:"base",
 payer:address(90),recipient:address(91),amountRaw:"1000000000000000000"};
const exchange=()=>({xgr:{usd:0.0001,last_updated_at:Math.floor(now/1000)-10},
 ethereum:{usd:2500,last_updated_at:Math.floor(now/1000)-12}});
const defaults=()=>({catalog:fixture(),request,executionAddress:address(44),
 signer,readExecutionOwner:async()=>signer.address,
 readGatewayQuote:async()=>({bridgeNativeWei:1100000000000000000n,
 validatorFeeWei:100000000000000000n,tokenAmount:0n}),
 getDestinationGasQuote:async()=>({gasPriceWei:1000000000n,availableWei:100000000000000000n}),
 getCoinGeckoSnapshot:async()=>exchange(),
 clock:()=>now,nonce:()=>42n,gasUnits:1000000n,bufferBps:13000n});
test("produces cryptographically valid owner EIP712 binding both chains and exact native fees",async()=>{
 const r=await buildManagedQuote(defaults());
 assert.equal(r.feeCurrency,"xgr");
 assert.equal(r.quote.bridgeValueWei,"1100000000000000000");
 assert.equal(r.quote.relayerFeeWei,"32500000000000000000000");
 assert.equal(r.sourceValueWei,"32501100000000000000000");
 assert.equal(r.quote.nonce,"42");
 assert.equal(r.quote.payer,request.payer);
 const domain={name:"XITA Managed Relay",version:"1",chainId:1643,
  verifyingContract:address(44)};
 assert.equal(verifyTypedData(domain,MANAGED_QUOTE_TYPES,r.quote,r.signature),signer.address);
 const tampered={...r.quote,relayerFeeWei:"1"};
 assert.notEqual(verifyTypedData(domain,MANAGED_QUOTE_TYPES,tampered,r.signature),signer.address);
});
test("never signs when relayer owner mismatches deployed adapter",async()=>{
 await assert.rejects(()=>buildManagedQuote({...defaults(),readExecutionOwner:async()=>address(1)}),/not contract owner/);
});
test("fails before signing when source has no exact funded native gas or prices stale",async()=>{
 await assert.rejects(()=>buildManagedQuote({...defaults(),getDestinationGasQuote:async()=>({
  gasPriceWei:1000000000n,availableWei:0n
 })}),/gas reserve/);
 await assert.rejects(()=>buildManagedQuote({...defaults(),getCoinGeckoSnapshot:async()=>({
  ...exchange(),xgr:{usd:0.0001,last_updated_at:Math.floor(now/1000)-500}
 })}),/stale/);
});
test("quotes only canonical deployed routes and exact bridge principal",async()=>{
 await assert.rejects(()=>buildManagedQuote({...defaults(),
  request:{...request,asset:"UNKNOWN"}}),/uniquely deployed/);
 await assert.rejects(()=>buildManagedQuote({...defaults(),
  readGatewayQuote:async()=>({bridgeNativeWei:1n,validatorFeeWei:1n,tokenAmount:3n})
 }),/token mismatch/);
});
test("no unsupported source/destination or non-decimal raw amount",async()=>{
 for(const requestPatch of [
  {source:"polygon"},{destination:"polygon"},{amountRaw:"1.5"},{amountRaw:"0"},
  {recipient:"0x1234"}
 ])await assert.rejects(()=>buildManagedQuote({...defaults(),request:{...request,...requestPatch}}));
});
