import test from "node:test";
import assert from "node:assert/strict";
import {recoverBeforeWalletSignature} from "./deployment-retry.mjs";

const chain={name:"arbitrum",chainId:42161};
const id="arbitrum:ism";
const journal=entry=>({read:()=>({entries:entry?{[id]:entry}:{}})});
const args={chain,component:"ism"};
test("a clean Arbitrum ISM retry does not invoke recovery",async()=>{
 let called=false;
 const out=await recoverBeforeWalletSignature({...args,journal:journal(null),
  resume:async()=>{called=true;}});
 assert.equal(out,null);
 assert.equal(called,false);
});
test("an old failed or rejected MetaMask intent is automatically retired before new signing",async()=>{
 let scoped;
 const result=await recoverBeforeWalletSignature({...args,journal:journal({stage:"prepared"}),
  resume:async request=>{scoped=request;return {stage:"ready",retryReason:"failed-onchain"};}});
 assert.deepEqual(scoped,{chain:"arbitrum",component:"ism"});
 assert.equal(result.stage,"ready");
 assert.equal(result.retryReason,"failed-onchain");
});
test("a confirmed original deployment is reconciled, never deployed again",async()=>{
 await assert.rejects(()=>recoverBeforeWalletSignature({
  ...args,journal:journal({stage:"submitted"}),
  resume:async()=>({stage:"documented"})}),/no second wallet signature/);
});
test("an on-chain pending original deployment cannot be paid for a second time",async()=>{
 await assert.rejects(()=>recoverBeforeWalletSignature({
  ...args,journal:journal({stage:"submitted"}),
  resume:async()=>({stage:"pending",reason:"confirmations",
   txHash:"0x"+"a".repeat(64)})}),e=>{
    assert.match(e.message,/Previous arbitrum:ism deployment still needs verification/);
    assert.match(e.message,/No new MetaMask signature/);
    assert.match(e.message,/"?0x[a-f0-9]{64}"?/);
    return true;
   });
});
