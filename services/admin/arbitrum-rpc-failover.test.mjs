import test from "node:test";
import assert from "node:assert/strict";
import {rpcCall} from "./inspector.mjs";

const PUB="https://arbitrum-one-rpc.publicnode.com",OFF="https://arb1.arbitrum.io/rpc";
const result=(value)=>({ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:value})});
test("Arbitrum RPC 403 falls back only after verifying official chainId 42161",async()=>{
 const original=globalThis.fetch, calls=[];
 globalThis.fetch=async(url,opts)=>{
  const method=JSON.parse(opts.body).method;
  calls.push([url,method]);
  if(url===PUB)return {ok:false,status:403};
  if(method==="eth_chainId")return result("0xa4b1");
  if(method==="eth_getTransactionReceipt")return result({status:"0x1",transactionHash:"0x"+"a".repeat(64)});
  throw Error("unexpected "+method);
 };
 try {
  const receipt=await rpcCall(PUB,"eth_getTransactionReceipt",["0x"+"a".repeat(64)]);
  assert.equal(receipt.status,"0x1");
  assert.deepEqual(calls,[[PUB,"eth_getTransactionReceipt"],[OFF,"eth_chainId"],[OFF,"eth_getTransactionReceipt"]]);
 }finally{globalThis.fetch=original}
});
test("wrong-chain fallback cannot authorize any receipt",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>url===PUB?{ok:false,status:403}:
  result("0x2105");
 try{await assert.rejects(()=>rpcCall(PUB,"eth_getTransactionReceipt",["0x"+"a".repeat(64)]),/fallback chain ID/)}
 finally{globalThis.fetch=original}
});
test("RPC transport never forwards signing or transaction broadcasts",async()=>{
 await assert.rejects(()=>rpcCall(OFF,"eth_sendRawTransaction",["0xdead"]),/read-only/);
 await assert.rejects(()=>rpcCall(OFF,"eth_sendTransaction",[{}]),/read-only/);
});
