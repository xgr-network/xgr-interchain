import test from "node:test";
import assert from "node:assert/strict";
import {selector} from "../../apps/web/keccak.js";
import {resolveRecoveryRoute,validateUnsignedRecovery,parseRecoveryCliOutput,classifyRecoveryFailure,ilnValidatorRouteName} from "./transfer-recovery.mjs";
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
function recovered(messageId){return {status:"READY_UNSIGNED_CALL",messageId,
 route:ilnValidatorRouteName(1643,8453,hash("d")),
 destinationChainId:"8453",to:addr("3"),value:"0x0",data:selector("process(bytes,bytes)")+"0".repeat(256)};}
test("resolve proof script only from canonical deployed route and configured chain URLs",()=>{
 const c=fixture(),ref=resolveRecoveryRoute(c,"xgr_to_base",hash("1"),"ABC");
 assert.equal(ref.env.ORIGIN_ILN_GATEWAY,addr("9"));
 assert.equal(ref.env.DESTINATION_MAILBOX,addr("3"));
 assert.equal(ref.env.ORIGIN_MAILBOX,addr("3"));
 assert.equal(ref.env.ATTESTATION_ROUTE, "iln_1643_8453_"+("d".repeat(64)));
 assert.throws(()=>resolveRecoveryRoute(c,"not_real",hash("1"),"ABC"),/deployed route/);
 assert.throws(()=>resolveRecoveryRoute(c,"xgr_to_base","bad","ABC"),/Invalid/);
 c.infrastructure.base.present=false;
 assert.throws(()=>resolveRecoveryRoute(c,"xgr_to_base",hash("1"),"ABC"),/deployed route/);
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

test("source transaction hint is optional, syntax validated and only passed as an untrusted locator",()=>{
 const c=fixture(),msg=hash("4"),tx=hash("5");
 const hinted=resolveRecoveryRoute(c,"xgr_to_base",msg,"ABC",tx);
 assert.equal(hinted.env.SOURCE_TX_HASH,tx);
 assert.equal(resolveRecoveryRoute(c,"xgr_to_base",msg,"ABC").env.SOURCE_TX_HASH,undefined);
 assert.throws(()=>resolveRecoveryRoute(c,"xgr_to_base",msg,"ABC","not-a-hash"),/Invalid source transaction/);
});
test("transfer recovery handler passes source receipt hints without accepting them as proof",async()=>{
 const tx=hash("5"),msg=hash("6"),c=fixture();
 const result=await serveUnsignedTransferRecovery({catalog:c,route:"xgr_to_base",messageId:msg,asset:"ABC",
  sourceTxHash:tx,now:Date.now()+300000,runner:async ref=>{
   assert.equal(ref.env.SOURCE_TX_HASH,tx);
   return validateUnsignedRecovery({status:"PENDING",messageId:msg},ref);
  }});
 assert.equal(result.code,200);assert.equal(result.body.status,"PENDING");
});
test("proof CLI failures are categorized without putting raw internals in HTTP responses",()=>{
 assert.equal(classifyRecoveryFailure({killed:true},"").code,"PROOF_TIMEOUT");
 assert.equal(classifyRecoveryFailure(new Error("RPC request failed"),"").code,"PROOF_RPC_UNAVAILABLE");
 assert.equal(classifyRecoveryFailure(null,JSON.stringify({status:"RECOVERY_NOT_READY",error:"Merkle proof unavailable"})).code,"PROOF_RECONSTRUCTION_UNAVAILABLE");
});

test("structured JSON-RPC error diagnostics retain nested quotes and exact RPC code",()=>{
 const d={status:"RECOVERY_NOT_READY",stage:"request-validator-quorum",rpcCode:-32601,
  error:'method "xgr_requestILNQuorum" not found'};
 const value=classifyRecoveryFailure(new Error("script exit"),
  "XITA_RECOVERY_DIAGNOSTIC:"+JSON.stringify(d)+"\n");
 assert.equal(value.code,"PROOF_RPC_METHOD_UNAVAILABLE");
 assert.equal(value.stage,"request-validator-quorum");
 assert.match(value.detail,/xgr_requestILNQuorum/);
});

test("ILN validator route identity is derived from immutable domains and route ID, not an ENV alias",()=>{
 const forward=ilnValidatorRouteName(1643,8453,hash("d"));
 const backward=ilnValidatorRouteName(8453,1643,hash("d"));
 assert.equal(forward,"iln_1643_8453_"+("d".repeat(64)));
 assert.equal(backward,"iln_8453_1643_"+("d".repeat(64)));
 assert.notEqual(forward,backward);
 assert.throws(()=>ilnValidatorRouteName(1643,8453,"xgr_to_base"),/Invalid canonical/);
 assert.throws(()=>ilnValidatorRouteName(1643,8453,hash("0")) ,/Invalid canonical/);
 assert.throws(()=>ilnValidatorRouteName(0,8453,hash("d")),/Invalid canonical/);
 assert.throws(()=>ilnValidatorRouteName(1643,NaN,hash("d")),/Invalid canonical/);
});
test("thousands of on-chain token routes require zero additions to node ENV",()=>{
 const names=new Set();
 for(let i=1;i<=2000;i++){
  const routeId="0x"+i.toString(16).padStart(64,"0");
  const name=ilnValidatorRouteName(1643,8453,routeId);
  assert.match(name,/^iln_1643_8453_[a-f0-9]{64}$/);
  names.add(name);
 }
 assert.equal(names.size,2000);
});
test("rejects externally named proof routes even with otherwise plausible destination calldata",()=>{
 const c=fixture(),conf=resolveRecoveryRoute(c,"xgr_to_base",hash("2"),"ABC");
 const spoofed={...recovered(hash("2")),route:"xgr_to_base"};
 assert.throws(()=>validateUnsignedRecovery(spoofed,conf),/does not match/);
});
