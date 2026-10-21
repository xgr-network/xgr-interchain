import test from "node:test";
import assert from "node:assert/strict";
import {Wallet,verifyTypedData,Interface} from "ethers";
import {executeQuoteCalldata} from "../../apps/web/transfer-actions.js";
import {readFileSync} from "node:fs";
import {deployedRoutes} from "../../apps/web/route-availability.js";
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
 readQuoteLifetime:async()=>90n,
 readSourceBlockTimestamp:async()=>Math.floor(now/1000),
 readGatewayQuote:async()=>({bridgeNativeWei:1100000000000000000n,
 validatorFeeWei:100000000000000000n,tokenAmount:0n}),
 getDestinationGasQuote:async()=>({gasPriceWei:1000000000n,availableWei:100000000000000000n}),
 getCoinGeckoSnapshot:async()=>exchange(),
 clock:()=>now,nonce:()=>42n,gasUnits:1000000n});
test("produces cryptographically valid owner EIP712 binding both chains and exact native fees",async()=>{
 const r=await buildManagedQuote(defaults());
 assert.equal(r.feeCurrency,"xgr");
 assert.equal(r.quote.bridgeValueWei,"1100000000000000000");
 assert.equal(r.quote.interchainFeeWei,"34925000000000000000000");
 assert.equal(r.sourceValueWei,"34926100000000000000000");
 assert.equal(r.quote.nonce,"42");
 assert.equal(r.quote.issuedAt,Math.floor(now/1000)-3);
 assert.equal(r.expiresAt,r.quote.issuedAt+90);
 assert.equal(r.quoteLifetimeSeconds,90);
 assert.equal(Object.hasOwn(r.quote,"deadline"),false);
 assert.equal(r.quote.payer,request.payer);
 const domain={name:"XITA Interchain Fee",version:"1",chainId:1643,
  verifyingContract:address(44)};
 assert.equal(verifyTypedData(domain,MANAGED_QUOTE_TYPES,r.quote,r.signature),signer.address);
 const tampered={...r.quote,interchainFeeWei:"1"};
 assert.notEqual(verifyTypedData(domain,MANAGED_QUOTE_TYPES,tampered,r.signature),signer.address);
 const changedTime={...r.quote,issuedAt:r.quote.issuedAt+1};
 assert.notEqual(verifyTypedData(domain,MANAGED_QUOTE_TYPES,changedTime,r.signature),signer.address);
});
test("never signs when relayer owner mismatches deployed adapter",async()=>{
 await assert.rejects(()=>buildManagedQuote({...defaults(),readExecutionOwner:async()=>address(1)}),/does not match deployed contract/);
});
test("fee quotes remain available without sponsorship but fail on missing gas price or stale prices",async()=>{
 const unsponsored=await buildManagedQuote({...defaults(),getDestinationGasQuote:async()=>({
  gasPriceWei:1000000000n,availableWei:0n
 })});
 assert.equal(unsponsored.quote.interchainFeeWei,"34925000000000000000000");
 await assert.rejects(()=>buildManagedQuote({...defaults(),getDestinationGasQuote:async()=>({
  gasPriceWei:0n,availableWei:0n
 })}),/Unpriced destination gas/);
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
  {amountRaw:"1.5"},{amountRaw:"0"},
  {recipient:"0x1234"}
 ])await assert.rejects(()=>buildManagedQuote({...defaults(),request:{...request,...requestPatch}}));
});

test("worldwide source-native quote is not gated on VAT customer location",async()=>{
 const r=await buildManagedQuote(defaults());
 assert.equal(r.pricing.priceVatCapBps,"2700");
 assert.equal(r.pricing.grossInterchainFeeWei,r.quote.interchainFeeWei);
 for(const key of ["vatCountry","vatPolicyBasis","vatRateBps","vatWei",
    "netInterchainFeeWei"])assert.equal(Object.hasOwn(r.pricing,key),false);
});
test("honors owner-configured on-chain TTL, never exceeds 90 seconds",async()=>{
 const r=await buildManagedQuote({...defaults(),readQuoteLifetime:async()=>30n});
 assert.equal(r.quote.issuedAt,Math.floor(now/1000)-3);
 assert.equal(r.expiresAt,r.quote.issuedAt+30);
 assert.equal(r.quoteLifetimeSeconds,30);
 for(const invalid of [0n,91n,-1n])
  await assert.rejects(()=>buildManagedQuote({...defaults(),readQuoteLifetime:async()=>invalid}),/lifetime/);
});
test("refuses invalid source timestamp before signing",async()=>{
 await assert.rejects(()=>buildManagedQuote({...defaults(),clock:()=>0}),/issuance clock/);
});

function multiHopFixture(){
 const cat=fixture();
 cat.chains.polygon={chainId:137,domainId:137,rpcUrls:["https://rpc.example/polygon"]};
 const comps={},receiptPaths=[];
 for(const name of ["factory","sourceRegistry","mailbox","ism","validatorRegistry"]){
  comps[name]=record("polygon",Object.keys(comps).length+100);
  receiptPaths.push(comps[name].receiptPath);
 }
 cat.infrastructure.polygon={present:true,chainId:137,xitaV315:{receiptPaths,components:comps}};
 const asset=cat.assets.XGR;
 const baseGateway=record("base",30),baseVault=record("base",31);
 const polygonGateway=record("xgrchain",32),polygonVault=record("xgrchain",33);
 const polyRouter=record("polygon",34);
 asset.routes.routes.push(
  {name:"base_to_xgr",sourceChain:"base",destinationChain:"xgrchain"},
  {name:"xgr_to_polygon",sourceChain:"xgrchain",destinationChain:"polygon"}
 );
 asset.deployment.representations.push({chain:"polygon",component:"syntheticRouter",...polyRouter});
 asset.deployment.routeDeployments.push(
  {routeName:"base_to_xgr",routeId:hash("e"),sourceChain:"base",destinationChain:"xgrchain",
   components:{gateway:baseGateway,feeVault:baseVault}},
  {routeName:"xgr_to_polygon",routeId:hash("a"),sourceChain:"xgrchain",destinationChain:"polygon",
   components:{gateway:polygonGateway,feeVault:polygonVault}}
 );
 asset.deployment.receiptPaths.push(
  baseGateway.receiptPath,baseVault.receiptPath,
  polygonGateway.receiptPath,polygonVault.receiptPath,polyRouter.receiptPath);
 return cat;
}
test("two-hop quote includes both deliveries, XGR bridge gas and its native validator fee",async()=>{
 const sources=[];
 const opts={...defaults(),catalog:multiHopFixture(),request:{
  ...request,source:"base",destination:"polygon"
 },readGatewayQuote:async({source,route})=>{
  sources.push(source+":"+route.destination);
  return source==="base"?
   {bridgeNativeWei:100000000000000n,validatorFeeWei:100000000000000n,
    tokenAmount:1000000000000000000n}:
   {bridgeNativeWei:1100000000000000000n,
    validatorFeeWei:100000000000000000n,tokenAmount:0n};
 },getDestinationGasQuote:async({destination})=>({
  gasPriceWei:destination==="xgrchain"?1000000000000n:30000000000n,
  availableWei:0n // Optional sponsorship absent must not block a quote.
 }),getCoinGeckoSnapshot:async()=>({
  ...exchange(),"polygon-ecosystem-token":{
   usd:0.35,last_updated_at:Math.floor(now/1000)-11
  }
 })};
 const result=await buildManagedQuote(opts);
 assert.equal(result.quote.destinationDomain,1643);
 assert.equal(result.quote.finalDestinationDomain,137);
 assert.equal(result.quote.onwardRouteId,hash("a"));
 assert.equal(result.pricing.onwardProtocolFeeWei,"100000000000000000");
 assert.deepEqual(result.pricing.journeyCostStages.map(s=>s.kind),
  ["first-delivery","onward-bridge-gas","onward-protocol-fee","final-delivery"]);
 assert.deepEqual(sources,["base:xgrchain","xgrchain:polygon"]);
 assert.equal(result.pricing.grossInterchainFeeWei,result.quote.interchainFeeWei);
 assert.ok(BigInt(result.quote.interchainFeeWei)>0n);
 await assert.rejects(()=>buildManagedQuote({...opts,readGatewayQuote:async({source})=>
  source==="base"?
   {bridgeNativeWei:100000000000000n,validatorFeeWei:100000000000000n,
    tokenAmount:1000000000000000000n}:
   {bridgeNativeWei:1000000000000000000n,validatorFeeWei:0n,tokenAmount:0n}
 }),/Second hop validator quote unavailable/);
});

test("browser reconstructs exactly the signed EIP-712 execute ABI calldata",async()=>{
 const r=await buildManagedQuote(defaults());
 const iface=new Interface([
  "function execute((address payer,address gateway,bytes32 routeId,uint32 destinationDomain,bytes32 recipient,uint32 finalDestinationDomain,bytes32 finalRecipient,bytes32 onwardRouteId,uint256 amount,uint256 bridgeValueWei,uint256 interchainFeeWei,uint256 nonce,uint64 issuedAt),bytes signature)"
 ]);
 const reference=iface.encodeFunctionData("execute",[r.quote,r.signature]).toLowerCase();
 assert.equal(executeQuoteCalldata(r.quote,r.signature),reference);
 const altered={...r.quote,amount:(BigInt(r.quote.amount)+1n).toString()};
 assert.notEqual(executeQuoteCalldata(altered,r.signature),reference);
});

test("preview reuses exact priced source and two-hop fees but never signs or allocates a nonce",async()=>{
 let signing=0,nonces=0;
 const preview=await buildManagedQuote({...defaults(),preview:true,
  signer:{address:signer.address,signTypedData:()=>{signing++;throw Error("unexpected signing");}},
  nonce:()=>{nonces++;throw Error("unexpected nonce");}});
 const signed=await buildManagedQuote(defaults());
 assert.equal(preview.status,"UNSIGNED_FEE_PREVIEW");
 assert.equal(preview.signature,null);
 assert.equal(preview.quote,null);
 assert.equal(preview.expiresAt,null);
 assert.equal(preview.validatorFeeWei,signed.validatorFeeWei);
 assert.equal(preview.pricing.grossInterchainFeeWei,signed.pricing.grossInterchainFeeWei);
 assert.equal(signing,0);assert.equal(nonces,0);
});

test("signed quote never carries a future timestamp relative to source block",async()=>{
 const tip=Math.floor(now/1000)-7;
 const r=await buildManagedQuote({...defaults(),readSourceBlockTimestamp:async()=>tip});
 assert.equal(r.quote.issuedAt,tip-3);
 assert.ok(r.quote.issuedAt<=tip);
 assert.equal(r.expiresAt,tip-3+90);
});
test("signer refuses stale or invalid source block rather than issuing unsafe quote",async()=>{
 for(const t of [0,Math.floor(now/1000)-19,Math.floor(now/1000)+10]){
  await assert.rejects(()=>buildManagedQuote({...defaults(),readSourceBlockTimestamp:async()=>t}),
   /Source chain tip clock unavailable or stale/);
 }
});

test("unsigned fee pricing automatically discovers the receipt-backed XGR to Arbitrum route",async()=>{
 const catalog=JSON.parse(readFileSync(
  new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const route=deployedRoutes(catalog).find(r=>
  r.asset==="XGR"&&r.source==="xgrchain"&&r.destination==="arbitrum");
 assert.ok(route,"canonical deployed route is discovered dynamically");
 const quote=await buildManagedQuote({...defaults(),catalog,preview:true,
  executionAddress:catalog.infrastructure.xgrchain.xitaV315.components.executionGateway.address,
  request:{asset:route.asset,source:route.source,destination:route.destination,
   payer:signer.address,recipient:signer.address,amountRaw:"100000000000000000000"},
  readGatewayQuote:async()=>({bridgeNativeWei:100100000000000000000n,
   validatorFeeWei:100000000000000000n,tokenAmount:0n})
 });
 assert.equal(quote.status,"UNSIGNED_FEE_PREVIEW");
 assert.equal(quote.source,"xgrchain");
 assert.equal(quote.destination,"arbitrum");
 assert.ok(BigInt(quote.pricing.grossInterchainFeeWei)>0n);
});
