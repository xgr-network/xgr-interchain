import test from "node:test";
import assert from "node:assert/strict";
import {readNativeFinalityHead,verifyNativeFinalityReceipt,verifiedNativeMailboxState,nativeFinalityTag} from "./chain-finality.js";
const H="0x"+"1".repeat(64),BAD="0x"+"2".repeat(64),ADDRESS="0x"+"a".repeat(40);
function rpc(chainId=8453,{safe=100,mismatch=false,latest=110,delivered=true,headUnavailable=false}={}){
 const calls=[];
 const call=async(method,args)=>{
  calls.push({method,args});
  if(method==="eth_chainId")return "0x"+chainId.toString(16);
  if(method==="eth_getBlockByNumber"){
   const tag=args[0];
   if(headUnavailable&&tag==="safe")throw Error("Safe tag unsupported");
   if(tag==="safe")return {number:"0x"+safe.toString(16),hash:H};
   if(tag==="latest")return {number:"0x"+latest.toString(16),hash:H};
   const height=Number(BigInt(tag));
   return {number:tag,hash:mismatch&&height===90?BAD:H};
  }
  if(method==="eth_call")return "0x"+(delivered?"1":"0").padStart(64,"0");
  throw Error("Unexpected RPC "+method);
 };
 return {call,calls};
}
test("chain-native policy requires L2 safe and XGR committed latest",async()=>{
 assert.equal(nativeFinalityTag(8453),"safe");
 assert.equal(nativeFinalityTag(42161),"safe");
 assert.equal(nativeFinalityTag(1643),"latest");
 assert.throws(()=>nativeFinalityTag(137),/Unsupported/);
 for(const id of [8453,42161]){
  const p=rpc(id),head=await readNativeFinalityHead(p.call,id);
  assert.equal(head.number,100);
  assert.ok(p.calls.some(c=>c.method==="eth_getBlockByNumber"&&c.args[0]==="safe"));
 }
});
test("Source above safe, mismatched receipt hash or unavailable safe never gets finalized",async()=>{
 const receipt={status:"0x1",blockHash:H,blockNumber:"0x5a"};
 assert.equal((await verifyNativeFinalityReceipt(rpc().call,8453,receipt)).verified,true);
 assert.equal((await verifyNativeFinalityReceipt(rpc(8453,{safe:64}).call,8453,receipt)).verified,false);
 await assert.rejects(()=>verifyNativeFinalityReceipt(rpc(8453,{mismatch:true}).call,8453,receipt),/not canonical/);
 await assert.rejects(()=>verifyNativeFinalityReceipt(rpc(8453,{headUnavailable:true}).call,8453,receipt),/Safe tag unsupported/);
 await assert.rejects(()=>verifyNativeFinalityReceipt(rpc(8453).call,42161,receipt),/chain ID mismatch/);
});
test("Mailbox delivery is read at pinned safe height, not latest; stale or reorg evidence rejected",async()=>{
 const p=rpc();
 const v=await verifiedNativeMailboxState(p.call,8453,ADDRESS,"0x1234");
 assert.equal(v.delivered,true);
 assert.equal(v.finalizedHead,100);
 assert.equal(v.finalizedHash,H);
 assert.equal(p.calls.find(c=>c.method==="eth_call").args[1],"0x64");
 const q=rpc(8453,{headUnavailable:true});
 await assert.rejects(()=>verifiedNativeMailboxState(q.call,8453,ADDRESS,"0x1234"),/Safe tag unsupported/);
});
