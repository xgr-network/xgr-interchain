import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {rpcCall} from "./inspector.mjs";

const root=fileURLToPath(new URL("../../",import.meta.url));
const networks=["xgrchain","base","arbitrum","optimism","bsc","xdc"].map(name=>
 JSON.parse(readFileSync(join(root,"config/chains",name,"chain.json"),"utf8")));
const valid=value=>({ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:value})});

test("every configured chain uses its OWN second RPC and verifies chain ID before accepting reads",async()=>{
 for(const chain of networks){
  assert.ok(chain.rpcUrls.length>=2,chain.name+" needs multiple endpoints");
  const old=globalThis.fetch,calls=[];
  try{
   globalThis.fetch=async(url,options)=>{
    const method=JSON.parse(options.body).method;calls.push([url,method]);
    if(url===chain.rpcUrls[0])return {ok:false,status:503};
    if(url!==chain.rpcUrls[1])throw Error("unexpected endpoint "+url);
    if(method==="eth_chainId")return valid("0x"+chain.chainId.toString(16));
    if(method==="eth_blockNumber")return valid("0x8765");
    throw Error("Unexpected RPC method "+method);
   };
   assert.equal(await rpcCall(chain.rpcUrls[0],"eth_blockNumber",[]),"0x8765");
   assert.deepEqual(calls,[
    [chain.rpcUrls[0],"eth_chainId"],
    [chain.rpcUrls[1],"eth_chainId"],
    [chain.rpcUrls[1],"eth_blockNumber"]
   ],chain.name);
  }finally{globalThis.fetch=old}
 }
});

test("wrong-chain secondary RPC is never queried for contract state",async()=>{
 for(const chain of networks){
  const old=globalThis.fetch,calls=[];
  try{
   globalThis.fetch=async(url,options)=>{
    const method=JSON.parse(options.body).method;calls.push([url,method]);
    if(url===chain.rpcUrls[0])return {ok:false,status:429};
    if(method==="eth_chainId")return valid("0xdead");
    throw Error("Wrong-chain provider must not be queried");
   };
   await assert.rejects(
    ()=>rpcCall(chain.rpcUrls[0],"eth_getTransactionReceipt",["0x"+"ab".repeat(32)]),
    /Unexpected fallback chain ID/,chain.name);
   assert.equal(calls.filter(([,method])=>method==="eth_getTransactionReceipt").length,0);
  }finally{globalThis.fetch=old}
 }
});

test("noFailover keeps independently verified XGR validator witness queries on one endpoint",async()=>{
 const c=networks.find(c=>c.name==="xgrchain"),old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options)=>{
   const method=JSON.parse(options.body).method;calls.push([url,method]);
   return {ok:false,status:503};
  };
  await assert.rejects(
   ()=>rpcCall(c.rpcUrls[0],"eth_blockNumber",[],{noFailover:true}),
   /RPC status 503/);
  assert.deepEqual(calls,[[c.rpcUrls[0],"eth_chainId"]]);
 }finally{globalThis.fetch=old}
});

test("XDC finalized RPC fallback preserves finalized tag; never requests latest",async()=>{
 const c=networks.find(c=>c.name==="xdc"),old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options)=>{
   const {method,params}=JSON.parse(options.body);calls.push({url,method,params});
   if(url===c.rpcUrls[0]){
    if(method==="eth_chainId")return valid("0x32");
    return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,
      error:{code:-32602,message:"finalized block tag not supported"}})};
   }
   if(url!==c.rpcUrls[1])throw Error("Unexpected endpoint");
   if(method==="eth_chainId")return valid("0x32");
   if(method==="eth_getBlockByNumber")return valid({
    number:"0x20",hash:"0x"+"cd".repeat(32)
   });
   throw Error("Unexpected method");
  };
  const block=await rpcCall(c.rpcUrls[0],"eth_getBlockByNumber",["finalized",false]);
  assert.equal(block.number,"0x20");
  assert.equal(calls.filter(x=>x.method==="eth_getBlockByNumber").length,2);
  assert.ok(calls.filter(x=>x.method==="eth_getBlockByNumber")
   .every(x=>x.params[0]==="finalized"));
 }finally{globalThis.fetch=old}
});

test("non-transient execution revert is not bypassed by another chain RPC",async()=>{
 const chain=networks.find(c=>c.name==="bsc"),old=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options)=>{
   const method=JSON.parse(options.body).method;calls.push([url,method]);
   if(method==="eth_chainId")return valid("0x38");
   return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,
    error:{code:3,message:"execution reverted"}})};
  };
  await assert.rejects(()=>rpcCall(chain.rpcUrls[0],"eth_call",[]),/execution reverted/);
  assert.deepEqual(calls,[[chain.rpcUrls[0],"eth_chainId"],[chain.rpcUrls[0],"eth_call"]]);
 }finally{globalThis.fetch=old}
});

test("RPC client never performs writes or transaction broadcasts",async()=>{
 const c=networks.find(c=>c.name==="xdc");
 await assert.rejects(()=>rpcCall(c.rpcUrls[0],"eth_sendTransaction",[{}]),/read-only/);
 await assert.rejects(()=>rpcCall(c.rpcUrls[0],"eth_sendRawTransaction",["0xdead"]),/read-only/);
});
