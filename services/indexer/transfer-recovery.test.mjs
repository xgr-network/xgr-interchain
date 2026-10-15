import test from "node:test";
import assert from "node:assert/strict";
import {selector} from "../../apps/web/keccak.js";
import {resolveRecoveryRoute,validateUnsignedRecovery,parseRecoveryCliOutput} from "./transfer-recovery.mjs";
import {serveUnsignedTransferRecovery} from "./server.mjs";
const addr=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
function entry(chain,i){const address=addr(i);
 return {address,runtimeCodeKeccak256:hash("e"),receiptPath:
  "deployments/receipts/"+chain+"/"+("a".repeat(64))+"-"+address.slice(2)+".json"};
}
const core=chain=>{
 const components=Object.fromEntries(["factory","sourceRegistry","mailbox","ism","validatorRegistry","merkleTreeHook"].map((key,i)=>
  [key,entry(chain,(i+1).toString(16))]));
 return {present:true,chainId:chain==="base"?8453:1643,xitaV315:{
  components,receiptPaths:Object.values(components).map(c=>c.receiptPath)}};
};
function fixture(){
 const names=["xgrchain","base"];
 const representations=names.map((name,i)=>({
  chain:name,component:i===0?"nativeRouter":"syntheticRouter",...entry(name,(i+7).toString(16))}));
 const gateway=entry("xgrchain","9"),feeVault=entry("xgrchain","b");
 return {chains:{xgrchain:{chainId:1643,domainId:1643,confirmations:1,rpcUrls:["https://rpc.example/xgr"]},
  base:{chainId:8453,domainId:8453,confirmations:12,rpcUrls:["https://rpc.example/base"]}},
  infrastructure:Object.fromEntries(names.map(name=>[name,core(name)])),
  assets:{ABC:{metadata:{assetId:hash("f")},
   routes:{routes:[{name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"}]},
   deployment:{present:true,assetId:hash("f"),representations,
    routeDeployments:[{routeName:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base",
     routeId:hash("d"),components:{gateway,feeVault}}],
    receiptPaths:[...representations.map(r=>r.receiptPath),gateway.receiptPath,feeVault.receiptPath]}}}};
}
function recovered(messageId){return {status:"READY_UNSIGNED_CALL",messageId,route:"xgr_to_base",
 destinationChainId:"8453",to:addr("3"),value:"0x0",data:selector("process(bytes,bytes)")+"0".repeat(256)};}
test("resolve proof script only from canonical deployed route and configured chain URLs",()=>{
 const c=fixture(),ref=resolveRecoveryRoute(c,"xgr_to_base",hash("1"),"ABC");
 assert.equal(ref.env.ORIGIN_ILN_GATEWAY,addr("9"));
 assert.equal(ref.env.DESTINATION_MAILBOX,addr("3"));
 assert.equal(ref.env.ORIGIN_MAILBOX,addr("3"));
 assert.equal(ref.env.ATTESTATION_ROUTE,"xgr_to_base");
 assert.throws(()=>resolveRecoveryRoute(c,"not_real",hash("1"),"ABC"),/deployed route/);
 assert.throws(()=>resolveRecoveryRoute(c,"xgr_to_base","bad","ABC"),/Invalid/);
 c.infrastructure.base.present=false;
 assert.throws(()=>resolveRecoveryRoute(c,"xgr_to_base",hash("1")),/deployed route/);
});
test("accept exactly authorized unsigned Mailbox.process calldata",()=>{
 const c=fixture(),config=resolveRecoveryRoute(c,"xgr_to_base",hash("2"),"ABC"),ok=recovered(hash("2"));
 assert.equal(validateUnsignedRecovery(ok,config).status,"READY_UNSIGNED_CALL");
 assert.equal(parseRecoveryCliOutput(JSON.stringify(ok),config).value,"0x0");
 for(const bad of [
  {...ok,to:addr("f")},
  {...ok,messageId:hash("3")},
  {...ok,data:selector("transfer(address,uint256)")+"00".repeat(128)},
  {...ok,destinationChainId:"137"},
  {...ok,value:"0x1"}
 ])assert.throws(()=>validateUnsignedRecovery(bad,config));
 assert.equal(validateUnsignedRecovery({status:"PENDING",messageId:hash("2")},config).status,"PENDING");
});
test("public recovery endpoint never signs or assumes success, only returns source-bound calldata",async()=>{
 const catalog=fixture();
 const result=await serveUnsignedTransferRecovery({catalog,route:"xgr_to_base",asset:"ABC",messageId:hash("4"),runner:async conf=>validateUnsignedRecovery(recovered(hash("4")),conf)});
 assert.equal(result.code,200);
 assert.equal(result.body.status,"READY_UNSIGNED_CALL");
 assert.ok(result.body.data);
 assert.equal(result.body.privateKey,undefined);
});
