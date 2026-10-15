import test from "node:test";
import assert from "node:assert/strict";
import {ensureNoPendingWalletTransaction} from "./wallet-nonce.js";
const account="0x"+"e".repeat(40),chain={chainId:1643,rpcUrls:["https://rpc.example/xgr"]};
const wallet=(latest,pending)=>({request:async({method,params})=>{
 assert.equal(method,"eth_getTransactionCount");
 return params[1]==="latest"?latest:pending;
}});
const rpc=(latest="0x2",pending="0x2",chainId="0x66b")=>async(url,{body})=>{
 assert.equal(url,chain.rpcUrls[0]);
 const {method,params}=JSON.parse(body);
 const result=method==="eth_chainId"?chainId:params[1]==="latest"?latest:pending;
 return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result})};
};
test("valid wallet nonces require no fallback",async()=>{
 const x=await ensureNoPendingWalletTransaction({provider:wallet("0x2","0x2"),account,chain,fetcher:async()=>{throw Error("not called")}});
 assert.deepEqual(x,{source:"wallet",nonce:2n});
});
test("invalid or missing EIP-1193 nonces are recovered only from verified canonical RPC",async()=>{
 for(const v of [null,undefined,"0x","2","0x02",{}]){
  const x=await ensureNoPendingWalletTransaction({provider:wallet("0x2",v),account,chain,fetcher:rpc()});
  assert.deepEqual(x,{source:"verified-source-rpc",nonce:2n});
 }
 const both=await ensureNoPendingWalletTransaction({provider:wallet(null,null),account,chain,fetcher:rpc()});
 assert.equal(both.nonce,2n);
});
test("stale injected pending nonce can be reconciled with chain RPC",async()=>{
 const x=await ensureNoPendingWalletTransaction({provider:wallet("0x2","0x1"),account,chain,fetcher:rpc()});
 assert.equal(x.source,"verified-source-rpc");
});
test("known pending nonce from either source stays blocked",async()=>{
 await assert.rejects(ensureNoPendingWalletTransaction({provider:wallet("0x2","0x3"),account,chain,fetcher:rpc()}),/pending/);
 await assert.rejects(ensureNoPendingWalletTransaction({provider:wallet(null,"0x3"),account,chain,fetcher:rpc()}),/pending/);
 await assert.rejects(ensureNoPendingWalletTransaction({provider:wallet("0x2",null),account,chain,fetcher:rpc("0x2","0x3")}),/pending/);
});
test("unavailable or contradictory canonical source RPC fails closed",async()=>{
 for(const [fetcher,reason] of [
  [rpc("0x3","0x3"),/disagree on confirmed nonce/],
  [rpc("0x2","0x1"),/behind confirmed state/],
  [rpc("0x2","0x2","0x2105"),/chain ID mismatch/],
  [rpc(null,"0x2"),/invalid nonce data/],
  [async()=>{throw Error("timeout")},/did not respond/]
 ]){
  await assert.rejects(ensureNoPendingWalletTransaction({provider:wallet("0x2",null),account,chain,fetcher}),reason);
 }
});
