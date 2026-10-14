import test from "node:test";
import assert from "node:assert/strict";
import {classifyInterruptedDeployment,matchesWalletIntent} from "./deployment-auto-recovery.mjs";
import {resumeInterruptedDeployments} from "./deployment-auto-resume.mjs";
const wallet="0x"+"1".repeat(40);
const other="0x"+"2".repeat(40);
const hash="0x"+"a".repeat(64);
const replacement="0x"+"b".repeat(64);
const chain={name:"base",chainId:8453,rpcUrls:["https://base.example"]};
const entry=(stage="prepared")=>({id:"base:ism",chainId:8453,wallet,
 stage,createdAt:"2026-10-14T12:00:00.000Z",
 txHash:stage==="prepared"?null:hash,
 transaction:{from:wallet,to:null,nonce:"0x9",value:"0x0",gas:"0x5208",data:"0x6001"}});
const tx=(hashValue=hash,from=wallet)=>({hash:hashValue,from,to:null,nonce:"0x9",
 value:"0x0",input:"0x6001",chainId:"0x2105"});
const rpc=(opts={})=>async(url,method,params)=>{
 assert.equal(url,"https://base.example");
 switch(method){
  case "eth_chainId":return "0x2105";
  case "eth_getTransactionCount":
   if(params[1]==="latest")return "0x"+String(opts.latest??9);
   if(params[1]==="pending")return "0x"+String(opts.pending??opts.latest??9);
   return Number(BigInt(params[1]))>=28?(opts.mined?"0xa":"0x9"):"0x9";
  case "eth_getBlockByNumber":
   if(params[0]==="pending")return {transactions:opts.pendingBlock||[]};
   return {transactions:opts.mined?[tx(replacement)]:[]};
  case "eth_blockNumber":return "0x40";
  case "eth_getTransactionByHash":return opts.transaction??null;
  case "eth_getTransactionReceipt":return opts.receipt??null;
  default:throw Error("Unexpected RPC "+method);
 }
};
test("unsent rejected MetaMask nonce is immediately safe for a new Wallet attempt",async()=>{
 const result=await classifyInterruptedDeployment({entry:entry(),chain,rpc:rpc()});
 assert.deepEqual(result,{action:"retry",reason:"wallet-nonce-unused"});
});
test("untraceable occupied pending nonce permits a new explicitly MetaMask-confirmed deployment",async()=>{
 const result=await classifyInterruptedDeployment({entry:entry(),chain,
  rpc:rpc({latest:9,pending:10})});
 assert.equal(result.action,"retry");
 assert.equal(result.reason,"pending-nonce-untraceable");
 assert.match(result.warning,/additional gas\/reserve costs/);
});
test("pending block recovers original wallet hash by exact nonce and calldata",async()=>{
 const result=await classifyInterruptedDeployment({entry:entry(),chain,
  rpc:rpc({latest:9,pending:10,pendingBlock:[tx(replacement)]})});
 assert.deepEqual(result,{action:"reconcile",txHash:replacement,
  reason:"recovered-pending-wallet-nonce"});
});
test("historically mined original tx is reconstructed instead of being deployed again",async()=>{
 const result=await classifyInterruptedDeployment({entry:entry(),chain,
  rpc:rpc({latest:10,pending:10,mined:true})});
 assert.equal(result.action,"reconcile");
 assert.equal(result.txHash,replacement);
});
test("untraceable consumed original nonce allows a NEW explicitly confirmed wallet deploy",async()=>{
 const result=await classifyInterruptedDeployment({entry:entry("submitted"),chain,
  rpc:rpc({latest:10,pending:10})});
 assert.equal(result.action,"retry");
 assert.equal(result.reason,"old-nonce-consumed-untraceable");
 assert.match(result.warning,/duplicate/);
});
test("failed on-chain receipt is reusable, successful receipt is always reconciled",async()=>{
 const failed=await classifyInterruptedDeployment({entry:entry("submitted"),chain,
  rpc:rpc({receipt:{status:"0x0"},transaction:tx()})});
 assert.equal(failed.action,"retry");
 assert.equal(failed.reason,"failed-onchain");
 const success=await classifyInterruptedDeployment({entry:entry("submitted"),chain,
  rpc:rpc({receipt:{status:"0x1"},transaction:tx()})});
 assert.equal(success.action,"reconcile");
 assert.equal(success.reason,"confirmed-receipt");
});
test("a saved hash with wrong transaction bytes never grants an automatic retry",async()=>{
 assert.equal(matchesWalletIntent(entry(),tx(replacement,other)),false);
 await assert.rejects(()=>classifyInterruptedDeployment({entry:entry("submitted"),chain,
  rpc:rpc({transaction:tx(replacement,other)})}),/differs from signed deployment/);
});
test("confirmed-but-not-published entry must be reconciled, never retired",async()=>{
 const verdict=await classifyInterruptedDeployment({entry:entry("confirmed"),chain,rpc:rpc()});
 assert.equal(verdict.action,"reconcile");
});
function fakeJournal(items){
 const entries=Object.fromEntries(items.map(item=>[item.id,item]));
 const retired=[];
 const read=()=>({version:1,entries});
 return {read,retired,attachHash(id,txHash){
  entries[id].stage="submitted";entries[id].txHash=txHash;
 },adoptObservedHash(id,_when,txHash){entries[id].txHash=txHash;},
 retireForFreshWalletAttempt({id,reason}){
  retired.push({id,reason});delete entries[id];return {stage:"ready",retryReason:reason};
 }};
}
test("normal deploy click automatically removes unsent draft without a manual dialog",async()=>{
 const journal=fakeJournal([entry()]);
 const result=await resumeInterruptedDeployments({
  journal,chains:[chain],rpc:rpc(),reconcile:async()=>{throw Error("Never reconcile unsent")},
  include:e=>e.id==="base:ism"
 });
 assert.equal(result.stage,"ready");
 assert.equal(journal.retired[0].reason,"wallet-nonce-unused");
 assert.deepEqual(journal.read().entries,{});
});
test("normal deploy click automatically recovers a submitted receipt without rebroadcast",async()=>{
 const journal=fakeJournal([entry("submitted")]);
 let called=0;
 const result=await resumeInterruptedDeployments({journal,chains:[chain],
  rpc:rpc({transaction:tx(),receipt:{status:"0x1"}}),
  reconcile:async ({id})=>{called++;assert.equal(id,"base:ism");delete journal.read().entries[id];return {stage:"documented",commit:"f".repeat(40)};},
  include:()=>true});
 assert.equal(result.stage,"documented");
 assert.equal(result.automaticallyRecovered,true);
 assert.equal(called,1);
 assert.equal(journal.retired.length,0);
});
test("unknown mempool transaction is auditable and permits an explicit new wallet nonce",async()=>{
 const journal=fakeJournal([entry()]);
 const result=await resumeInterruptedDeployments({journal,chains:[chain],
  rpc:rpc({pending:10}),reconcile:async()=>{throw Error("must not reconcile")},
  include:()=>true});
 assert.equal(result.stage,"ready");
 assert.equal(result.retryReason,"pending-nonce-untraceable");
 assert.match(result.warning,/additional gas/);
 assert.equal(journal.retired.length,1);
});

test("an unused earlier draft is retired but a second IDENTIFIED pending transaction is reconciled first",async()=>{
 const first=entry(),second={...entry(),id:"base:factory",
  wallet:other,transaction:{...entry().transaction,from:other},
  createdAt:"2026-10-14T12:01:00.000Z"};
 const journal=fakeJournal([first,second]);
 const probe=async(url,method,args)=>{
  if(method==="eth_getTransactionCount"){
   if(args[0].toLowerCase()===other.toLowerCase()&&args[1]==="pending")
    return "0xa";
   return "0x9";
  }
  return rpc()(url,method,args);
 };
 const identified=async(url,method,args)=>{
  if(method==="eth_getBlockByNumber"&&args[0]==="pending")
   return {transactions:[tx(replacement,other)]};
  return probe(url,method,args);
 };
 const result=await resumeInterruptedDeployments({
  journal,chains:[chain],rpc:identified,
  reconcile:async()=>({stage:"pending",reason:"receipt"}),
  include:()=>true
 });
 assert.equal(result.stage,"pending");
 assert.equal(result.id,"base:factory");
 assert.equal(journal.retired.length,1);
 assert.ok(!journal.read().entries["base:ism"]);
 assert.ok(journal.read().entries["base:factory"]);
});

test("saved Base SourceRegistry hash with stale unrelated tx is retired ONLY if factory has no registry",async()=>{
 const factory="0x"+"3".repeat(40),e={...entry("submitted"),id:"base:sourceRegistry",
  transaction:{from:wallet,to:factory,data:"0x"+(await import("../../apps/web/keccak.mjs")).selector("deployRegistry()").slice(2),
   nonce:"0x9",value:"0x0",gas:"0x5208"}};
 const old={...tx(),input:"0x12345678",to:factory};
 const run=registry=>async(url,method,params)=>{
  if(method==="eth_call")return "0x"+registry.toString(16).padStart(64,"0");
  return rpc({transaction:old,receipt:{status:"0x1",blockNumber:"0x20"},latest:10,pending:10})(url,method,params);
 };
 const retry=await classifyInterruptedDeployment({entry:e,chain,rpc:run(0n)});
 assert.equal(retry.action,"retry");
 assert.equal(retry.reason,"source-registry-unrelated-saved-hash");
 const live=await classifyInterruptedDeployment({entry:e,chain,rpc:run(3n)});
 assert.equal(live.action,"pending");
 assert.equal(live.reason,"source-registry-already-exists-unattributed");
});
test("sourceRegistry wrong signed tx with missing receipt cannot be rebroadcast",async()=>{
 const factory="0x"+"3".repeat(40),e={...entry("submitted"),id:"base:sourceRegistry",
 transaction:{...entry().transaction,to:factory,data:(await import("../../apps/web/keccak.mjs")).selector("deployRegistry()")}};
 const result=await classifyInterruptedDeployment({entry:e,chain,rpc:rpc({transaction:tx(),latest:10,pending:10})});
 assert.equal(result.action,"pending");
 assert.match(result.reason,/awaiting-receipt/);
});
