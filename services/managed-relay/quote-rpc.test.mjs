import test from "node:test";
import assert from "node:assert/strict";
import {FetchRequest,JsonRpcProvider} from "ethers";
import {createQuoteRpcReader} from "./quote-rpc.mjs";

const primary="https://primary.example/rpc",fallback="https://fallback.example/rpc";
const catalog={chains:{xdc:{chainId:50,rpcUrls:[primary,fallback]}}};

test("a 403 on the primary uses a chain-verified fallback and cools down the failing endpoint",async()=>{
 const calls=[],providers=[];
 let time=0;
 const read=createQuoteRpcReader({now:()=>time,makeProvider:(url,chainId)=>{
  const request=new FetchRequest(url);
  request.getUrlFunc=async req=>{
   const rows=JSON.parse(Buffer.from(req.body));
   calls.push(url);
   if(url===primary&&time===0)
    return {statusCode:403,statusMessage:"Forbidden",headers:{},body:Buffer.from("<!DOCTYPE html>")};
   const reply=({id,method})=>({jsonrpc:"2.0",id,result:method==="eth_chainId"?"0x32":"0x13"});
   return {statusCode:200,statusMessage:"OK",headers:{},body:Buffer.from(JSON.stringify(
    Array.isArray(rows)?rows.map(reply):reply(rows)))};
  };
  const provider=new JsonRpcProvider(request,chainId);
  providers.push(provider);
  return provider;
 }});
 try{
  const gas=provider=>provider.send("eth_gasPrice",[]);
  assert.equal(await read("xdc",catalog,gas),"0x13");
  assert.equal(calls.filter(url=>url===primary).length,1);
  assert.equal(await read("xdc",catalog,gas),"0x13");
  assert.equal(calls.filter(url=>url===primary).length,1);
  time=30001;
  assert.equal(await read("xdc",catalog,gas),"0x13");
  assert.ok(calls.filter(url=>url===primary).length>1);
 }finally{for(const provider of providers)provider.destroy();}
});

test("quote reads retry transport failures during a call but stop on contract or chain mismatch",async()=>{
 const visited=[];
 const read=createQuoteRpcReader({makeProvider:url=>({
  url,getNetwork:async()=>({chainId:50n})
 })});
 const result=await read("xdc",catalog,async({url})=>{
  visited.push(url);
  if(url===primary)throw Object.assign(Error("Too many requests"),{info:{responseStatus:"429 Too Many Requests"}});
  return 12n;
 });
 assert.equal(result,12n);
 assert.deepEqual(visited,[primary,fallback]);
 await assert.rejects(()=>read("xdc",catalog,async()=>{
  throw Object.assign(Error("Contract call reverted"),{code:"CALL_EXCEPTION"});
 }),/Contract call reverted/);
 const wrongChain=createQuoteRpcReader({makeProvider:()=>({getNetwork:async()=>({chainId:1n})})});
 await assert.rejects(()=>wrongChain("xdc",catalog,()=>assert.fail("Wrong chain was used")),/identity mismatch/);
});

test("exhausted RPC endpoints yield a short message without upstream URLs or bodies",async()=>{
 const read=createQuoteRpcReader({makeProvider:url=>({
  async getNetwork(){
   throw Object.assign(Error(url+" <!DOCTYPE html>"),{info:{responseStatus:"403 Forbidden"}});
  }
 })});
 await assert.rejects(()=>read("xdc",catalog,()=>assert.fail("Provider was unreachable")),
  {message:"Network RPC temporarily unavailable for xdc"});
});
