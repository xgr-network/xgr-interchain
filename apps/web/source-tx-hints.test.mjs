import test from "node:test";
import assert from "node:assert/strict";
import {listSourceTxHints,rememberSourceTxHint,unresolvedSourceTxHints} from "./source-tx-hints.js";
const a="0x"+"a".repeat(40),b="0x"+"b".repeat(40),tx="0x"+"c".repeat(64);
const memory=()=>{const m=new Map;return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
test("public broadcast hashes survive reload but stay isolated by wallet",()=>{
 const store=memory(),now=1000000;
 assert.equal(rememberSourceTxHint({account:a,sourceChain:"arbitrum",txHash:tx},{store,now}),true);
 assert.deepEqual(listSourceTxHints(a,{store,now}),[{sourceChain:"arbitrum",txHash:tx,at:now}]);
 assert.deepEqual(listSourceTxHints(b,{store,now}),[]);
 assert.equal(rememberSourceTxHint({account:a,sourceChain:"arbitrum",txHash:tx},{store,now:now+1}),true);
 assert.equal(listSourceTxHints(a,{store,now:now+1}).length,1);
});
test("invalid, expired or unavailable storage never asserts a transfer",()=>{
 const store=memory(),now=1000000;
 assert.equal(rememberSourceTxHint({account:a,sourceChain:"arbitrum",txHash:"bad"},{store,now}),false);
 assert.deepEqual(listSourceTxHints(a,{store,now}),[]);
 rememberSourceTxHint({account:a,sourceChain:"arbitrum",txHash:tx},{store,now});
 assert.deepEqual(listSourceTxHints(a,{store,now:now+366*86400000}),[]);
 assert.equal(rememberSourceTxHint({account:a,sourceChain:"arbitrum",txHash:tx},{store:null,now}),false);
});

test("known linked TX3 is not a second transfer or unresolved broadcast",()=>{
 const hash=n=>"0x"+n.repeat(64),child=hash("d"),unknown=hash("e");
 const parent={account:a,sourceChain:"arbitrum",txHash:hash("1"),
  messageId:hash("2"),onwardRouteId:hash("3"),
  secondHopTxHash:child,secondHopMessageId:hash("4"),
  confirmed:true,delivered:true,status:"awaiting-final-proof"};
 const hints=[{sourceChain:"arbitrum",txHash:parent.txHash},
  {sourceChain:"xgrchain",txHash:child},{sourceChain:"base",txHash:unknown}];
 assert.deepEqual(unresolvedSourceTxHints({account:a,items:[parent],hints}),
  [{sourceChain:"base",txHash:unknown}]);
 assert.equal(unresolvedSourceTxHints({account:b,items:[parent],hints}).length,3);
});
