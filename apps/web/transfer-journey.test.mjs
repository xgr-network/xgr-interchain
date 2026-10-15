import test from "node:test";
import assert from "node:assert/strict";
import {createJourney,validJournal,journalKey,rememberTransaction,nextTransferAction,
 parseTokenAmount,buildTransferPath} from "./transfer-journey.js";
const addr=d=>"0x"+d.repeat(40),hash=d=>"0x"+d.repeat(64);
const bind=(chain,d)=>{const address=addr(d);return {address,runtimeCodeKeccak256:hash("a"),
 receiptPath:"deployments/receipts/"+chain+"/"+("e".repeat(64))+"-"+address.slice(2)+".json"}};
const chain=key=>{
 const parts=Object.fromEntries(["factory","sourceRegistry","mailbox","ism","validatorRegistry"]
 .map((k,i)=>[k,bind(key,(""+(i+1)))]));
 return {present:true,chainId:{xgrchain:1643,base:8453,polygon:137}[key],
  xitaV315:{components:parts,receiptPaths:Object.values(parts).map(x=>x.receiptPath)}};
};
function fixture(){
 const routes=[["xgr_to_base","xgrchain","base"],["base_to_xgr","base","xgrchain"],
  ["xgr_to_polygon","xgrchain","polygon"],["polygon_to_xgr","polygon","xgrchain"]];
 const representations=["xgrchain","base","polygon"].map((name,i)=>({
  chain:name,component:name==="xgrchain"?"nativeRouter":"syntheticRouter",
  ...bind(name,(""+(i+6)))
 }));
 const records=routes.map(([routeName,src,dst],i)=>({
  routeName,sourceChain:src,destinationChain:dst,routeId:hash("abcd"[i]),
  components:{gateway:bind(src,(""+(i+1))),feeVault:bind(src,(""+(i+5)))},
  receiptPaths:[]}));
 const all=[...representations.map(x=>x.receiptPath),...records.flatMap(r=>
  [r.components.gateway.receiptPath,r.components.feeVault.receiptPath])];
 return {chains:Object.fromEntries(["xgrchain","base","polygon"].map(k=>[k,{
  chainId:{xgrchain:1643,base:8453,polygon:137}[k]}])),
  infrastructure:Object.fromEntries(["xgrchain","base","polygon"].map(k=>[k,chain(k)])),
  assets:{XGR:{metadata:{assetId:hash("f"),decimals:18},
   routes:{routes:routes.map(([name,src,dst])=>({name,sourceChain:src,destinationChain:dst}))},
   deployment:{present:true,assetId:hash("f"),representations,routeDeployments:records,receiptPaths:all}}}};
}
const account=addr("a"),tx1=hash("1"),tx2=hash("2"),tx3=hash("3"),tx4=hash("4");
test("strict positive amount parsing without rounding",()=>{
 assert.equal(parseTokenAmount("0.1",18),100000000000000000n);
 assert.equal(parseTokenAmount("1.25",6),1250000n);
 assert.throws(()=>parseTokenAmount("0",18),/positive/);
 assert.throws(()=>parseTokenAmount("1.0000000000000000001",18),/decimal/);
 assert.throws(()=>parseTokenAmount("1e18",18),/valid/);
});
test("direct hop is two confirmations and source hash cannot be rebroadcast",()=>{
 const c=fixture(),original=createJourney({catalog:c,account,asset:"XGR",
  origin:"xgrchain",destination:"base",amount:"0.1"});
 assert.equal(original.hops.length,1);
 assert.equal(nextTransferAction(original).kind,"source");
 let j=rememberTransaction(original,0,"source",tx1);
 assert.equal(nextTransferAction(j).kind,"check-source");
 assert.throws(()=>rememberTransaction(j,0,"source",tx3),/already submitted/);
 assert.equal(nextTransferAction(j,[{source:"confirmed",delivered:false}]).kind,"destination");
 j=rememberTransaction(j,0,"destination",tx2);
 assert.equal(nextTransferAction(j,[{source:"confirmed",delivered:false}]).kind,"check-destination");
 assert.equal(nextTransferAction(j,[{source:"confirmed",delivered:true}]).complete,2);
 assert.equal(validJournal(c,account,j),true);
 assert.equal(validJournal(c,addr("b"),j),false);
 assert.equal(journalKey(account),journalKey(account.toUpperCase().replace("0X","0x")));
});
test("two-hop route has FOUR mandatory wallet transactions; intermediate hop is blocked until delivered",()=>{
 const c=fixture();
 let j=createJourney({catalog:c,account,asset:"XGR",origin:"base",destination:"polygon",amount:"5"});
 assert.deepEqual(buildTransferPath("base","polygon"),["base","xgrchain","polygon"]);
 assert.equal(nextTransferAction(j).total,4);
 j=rememberTransaction(j,0,"source",tx1);
 assert.equal(nextTransferAction(j,[{source:"confirmed",delivered:false}]).kind,"destination");
 j=rememberTransaction(j,0,"destination",tx2);
 assert.equal(nextTransferAction(j,[{source:"confirmed",delivered:false}]).kind,"check-destination");
 assert.deepEqual(nextTransferAction(j,[{source:"confirmed",delivered:true}]),
  {kind:"source",index:2,total:4,complete:2,hop:1});
 j=rememberTransaction(j,1,"source",tx3);
 j=rememberTransaction(j,1,"destination",tx4);
 assert.equal(nextTransferAction(j,[{source:"confirmed",delivered:true},
  {source:"confirmed",delivered:true}]).complete,4);
});
test("RPC outages cannot count as completed and failures never restart source implicitly",()=>{
 const j=rememberTransaction(createJourney({catalog:fixture(),account,asset:"XGR",
  origin:"base",destination:"xgrchain",amount:"2"}),0,"source",tx1);
 assert.equal(nextTransferAction(j,[{source:"confirmed",delivered:null}]).kind,"check-delivery");
 assert.equal(nextTransferAction(j,[{source:"failed",delivered:null}]).kind,"source-failed");
 assert.throws(()=>rememberTransaction(j,0,"source",tx2),/already submitted/);
});
test("changed chain, route or missing records invalidate local cached journal",()=>{
 const c=fixture(),j=createJourney({catalog:c,account,asset:"XGR",origin:"base",destination:"polygon",amount:"2"});
 assert.equal(validJournal(c,account,j),true);
 c.assets.XGR.deployment.routeDeployments[0].components.gateway.address=addr("f");
 assert.equal(validJournal(c,account,j),false);
});
