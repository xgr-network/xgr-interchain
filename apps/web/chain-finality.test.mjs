import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readNativeFinalityHead,verifyNativeFinalityReceipt,verifiedNativeMailboxState,nativeFinalityTag} from "./chain-finality.js";
const H="0x"+"1".repeat(64),BAD="0x"+"2".repeat(64),ADDRESS="0x"+"a".repeat(40);
function rpc(chainId=8453,{safe=100,mismatch=false,latest=110,delivered=true,headUnavailable=false}={}){
 const calls=[];
 const call=async(method,args)=>{
  calls.push({method,args});
  if(method==="eth_chainId")return "0x"+chainId.toString(16);
  if(method==="eth_getBlockByNumber"){
   const tag=args[0];
   if(headUnavailable&&(tag==="safe"||tag==="finalized"))throw Error(tag==="safe"?"Safe tag unsupported":"Finalized tag unsupported");
   if(tag==="safe"||tag==="finalized")return {number:"0x"+safe.toString(16),hash:H};
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
 assert.equal(nativeFinalityTag(10),"safe");
 assert.equal(nativeFinalityTag(8453),"safe");
 assert.equal(nativeFinalityTag(42161),"safe");
 assert.equal(nativeFinalityTag(1643),"latest");
 assert.equal(nativeFinalityTag(56),"finalized");
 assert.throws(()=>nativeFinalityTag(137),/Unsupported/);
 for(const id of [10,8453,42161,56]){
  const p=rpc(id),head=await readNativeFinalityHead(p.call,id);
  assert.equal(head.number,100);
  assert.ok(p.calls.some(c=>c.method==="eth_getBlockByNumber"&&c.args[0]===(id===56?"finalized":"safe")));
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

test("native-safe delivery reorg during eth_call is rejected and not persisted",async()=>{
 let reads=0;
 const p=async(method,args)=>{
  if(method==="eth_chainId")return "0x2105";
  if(method==="eth_getBlockByNumber"){
   if(args[0]==="safe")return {number:"0x64",hash:H};
   return {number:args[0],hash:++reads>1?BAD:H};
  }
  if(method==="eth_call")return "0x"+("1").padStart(64,"0");
  throw Error(method);
 };
 await assert.rejects(()=>verifiedNativeMailboxState(p,8453,ADDRESS,"0x1234"),/reorganized/);
});

test("all GitHub-main chain finality policies are supported by the web/indexer verifier",()=>{
 const catalog=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 for(const [name,chain] of Object.entries(catalog.chains)){
  // Older canonical chains predate receiptFinalityTag in their chain manifest.
  // New chains must declare the tag explicitly; do not infer safe/latest from confirmations.
  const legacy={xgrchain:"latest",base:"safe",arbitrum:"safe"};
  const policy=chain.receiptFinalityTag??legacy[name];
  assert.ok(policy,name+" must specify a reviewed finality policy");
  assert.equal(nativeFinalityTag(chain.chainId),policy,
   name+" must use the reviewed finality policy");
 }
});
test("Optimism destination Mailbox state is read at a pinned safe block",async()=>{
 const pending=rpc(10,{delivered:false});
 const observation=await verifiedNativeMailboxState(pending.call,10,ADDRESS,"0x1234");
 assert.equal(observation.delivered,false);
 assert.equal(observation.finalizedHead,100);
 assert.deepEqual(pending.calls.find(c=>c.method==="eth_call").args[1],"0x64");
 assert.ok(pending.calls.some(c=>c.method==="eth_getBlockByNumber"&&c.args[0]==="safe"));
 const completed=await verifiedNativeMailboxState(rpc(10,{delivered:true}).call,10,ADDRESS,"0x1234");
 assert.equal(completed.delivered,true);
 await assert.rejects(()=>verifiedNativeMailboxState(rpc(10,{headUnavailable:true}).call,10,ADDRESS,"0x1234"),/Safe tag unsupported/);
});
