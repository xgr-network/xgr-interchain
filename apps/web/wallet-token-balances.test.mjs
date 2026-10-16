import test from "node:test";
import assert from "node:assert/strict";
import {deployedFixture} from "./deployed-test-fixture.mjs";
import {deployedRoutes} from "./route-availability.js";
import {selector} from "./keccak.js";
import {readWalletTokenBalances} from "./wallet-token-balances.js";
const addr=d=>"0x"+d.repeat(40), hash=d=>"0x"+d.repeat(64);
const underlying=addr("d"),account=addr("e");
const word=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
function catalog(){
 const asset=deployedFixture("ABC","base");
 asset.metadata.decimals=18;
 const infra=key=>{
  const parts=Object.fromEntries(["factory","sourceRegistry","mailbox","ism","validatorRegistry"].map((name,i)=>{
   const address=addr(String(i+1));
   return [name,{address,runtimeCodeKeccak256:hash("a"),receiptPath:
    "deployments/receipts/"+key+"/"+("f".repeat(64))+"-"+address.slice(2)+".json"}];
  }));
  return {present:true,chainId:key==="base"?8453:1643,xitaV315:{
   components:parts,receiptPaths:Object.values(parts).map(x=>x.receiptPath)}};
 };
 return {chains:{
  xgrchain:{chainId:1643,rpcUrls:["https://node.example/xgr"]},
  base:{chainId:8453,rpcUrls:["https://node.example/base"]}},
  infrastructure:{base:infra("base"),xgrchain:infra("xgrchain")},assets:{ABC:asset}};
}
function rpcFor(catalog,reads,{mismatch=false}={}){
 const routes=deployedRoutes(catalog);
 return async (url,method,params=[])=>{
  if(method==="eth_chainId")return url.includes("/base")?"0x2105":"0x66b";
  if(method!=="eth_call")throw Error("Unexpected RPC method "+method);
  const tx=params[0],selector_=(tx.data||"").slice(0,10);
  const route=routes.find(r=>r.sourceRouter===tx.to||r.gateway===tx.to);
  if(selector_===selector("token()")&&route&&tx.to===route.sourceRouter){
   return word(BigInt(route.sourceRouterType==="collateralRouter"?underlying:route.sourceRouter));
  }
  if(selector_===selector("warpToken()")&&route&&tx.to===route.gateway){
   const token=route.sourceRouterType==="collateralRouter"?underlying:route.sourceRouter;
   return word(BigInt(mismatch&&route.source==="base"?addr("c"):token));
  }
  if(selector_===selector("balanceOf(address)")){
   reads.push(tx.to);
   if(tx.to===underlying)return word(25n*10n**18n);
   if(route&&tx.to===route.sourceRouter&&route.sourceRouterType==="syntheticRouter")return word(7n*10n**18n);
   throw Error("Balance queried on incorrect token");
  }
  throw Error("Unexpected token query "+selector_);
 };
}
test("collateral balance uses verified underlying ERC-20 rather than escrow Router",async()=>{
 const c=catalog(),reads=[];
 const result=await readWalletTokenBalances({catalog:c,account,rpc:rpcFor(c,reads)});
 assert.equal(result["ABC:base"].status,"ready");
 assert.equal(result["ABC:base"].balanceRaw,(25n*10n**18n).toString());
 assert.equal(result["ABC:base"].symbol,"ABC");
 assert.equal(result["ABC:xgrchain"].status,"ready");
 assert.equal(result["ABC:xgrchain"].symbol,"wABC");
 assert.ok(reads.includes(underlying));
 const collateral=deployedRoutes(c).find(r=>r.source==="base");
 assert.ok(!reads.includes(collateral.sourceRouter));
});
test("source token mismatched at Gateway is unavailable, never fabricated",async()=>{
 const c=catalog(),reads=[];
 const result=await readWalletTokenBalances({catalog:c,account,rpc:rpcFor(c,reads,{mismatch:true})});
 assert.equal(result["ABC:base"].status,"unavailable");
 assert.ok(!reads.includes(underlying));
});
