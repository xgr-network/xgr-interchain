import test from "node:test";
import assert from "node:assert/strict";
import {resolveCatalogRpcRead,proxyCatalogRpcRead} from "./rpc-read.mjs";
const arb="https://arb1.arbitrum.io/rpc";
const alt="https://arbitrum-one-rpc.publicnode.com";
const cat={chains:{arbitrum:{chainId:42161,rpcUrls:[arb,alt]},
 base:{chainId:8453,rpcUrls:["https://mainnet.base.org"]}}};
const rpcBody=value=>({jsonrpc:"2.0",id:1,result:value});
const ok=value=>({ok:true,text:async()=>JSON.stringify(rpcBody(value))});
test("catalog-only read allows Arbitrum preflight through loopback without browser CORS",async()=>{
 const calls=[];
 const result=await proxyCatalogRpcRead({catalog:cat,
  request:{rpcUrl:arb,method:"eth_getBalance",params:["0x"+"a".repeat(40),"latest"]},
  fetcher:async(url,options)=>{
   const request=JSON.parse(options.body);
   calls.push({url,method:request.method,credentials:options.credentials});
   return ok(request.method==="eth_chainId"?"0xa4b1":"0xde0b6b3a7640000");
  }});
 assert.equal(result,"0xde0b6b3a7640000");
 assert.deepEqual(calls.map(c=>c.url),[arb,arb]);
 assert.deepEqual(calls.map(c=>c.method),["eth_chainId","eth_getBalance"]);
});
test("automatic failover must verify destination chain ID before providing data",async()=>{
 const calls=[];
 const response=await proxyCatalogRpcRead({catalog:cat,
  request:{rpcUrl:arb,method:"eth_gasPrice",params:[]},
  fetcher:async(url,options)=>{
   const {method}=JSON.parse(options.body);
   calls.push({url,method});
   if(method==="eth_chainId")return ok(url===arb?"0x1":"0xa4b1");
   return ok("0x3b9aca00");
  }});
 assert.equal(response,"0x3b9aca00");
 assert.deepEqual(calls,[{url:arb,method:"eth_chainId"},
  {url:alt,method:"eth_chainId"},{url:alt,method:"eth_gasPrice"}]);
});
test("unknown URLs, private hosts, unsafe methods and broad log scans are refused without network",async()=>{
 let contacted=0;
 const fetcher=async()=>{contacted++;return ok("0xa4b1")};
 const requests=[
  {rpcUrl:"https://untrusted.example/rpc",method:"eth_chainId",params:[]},
  {rpcUrl:"http://127.0.0.1:8545",method:"eth_chainId",params:[]},
  {rpcUrl:arb,method:"eth_sendRawTransaction",params:["0xdeadbeef"]},
  {rpcUrl:arb,method:"personal_sign",params:[]},
  {rpcUrl:arb,method:"eth_getLogs",params:[{address:"0x"+"a".repeat(40),
   fromBlock:"0x1",toBlock:"0x1000",topics:[]}]},
  {rpcUrl:arb,method:"eth_call",params:[{to:"0x"+"a".repeat(40),data:"0x"},"0x1"]},
  {rpcUrl:arb,method:"eth_getBalance",params:[{address:"0x"+"a".repeat(40)}]},
 ];
 for(const request of requests)await assert.rejects(
  ()=>proxyCatalogRpcRead({catalog:cat,request,fetcher}),/permitted|Invalid|Only|Unsupported|catalog|RPC/);
 assert.equal(contacted,0);
});
test("receipt and filtered bounded event reads remain available for wallet recovery",()=>{
 const address="0x"+"a".repeat(40);
 const event="0x"+"b".repeat(64);
 const valid=resolveCatalogRpcRead(cat,{rpcUrl:arb,method:"eth_getLogs",params:[{
  address,fromBlock:"0x100",toBlock:"0x1ff",topics:[event,null]
 }]});
 assert.equal(valid.chainId,42161);
 assert.equal(valid.method,"eth_getLogs");
 const receipt=resolveCatalogRpcRead(cat,{rpcUrl:arb,
  method:"eth_getTransactionReceipt",params:["0x"+"c".repeat(64)]});
 assert.equal(receipt.method,"eth_getTransactionReceipt");
});
test("wrong-chain and untrusted RPC responses fail closed",async()=>{
 await assert.rejects(()=>proxyCatalogRpcRead({catalog:cat,
  request:{rpcUrl:arb,method:"eth_chainId",params:[]},
  fetcher:async()=>ok("0x2105")}),/All catalog-approved/);
});

test("latest-only eth_getCode is allowed; archive-state requests remain refused",()=>{
 const catalog={chains:{xgrchain:{chainId:1643,rpcUrls:["https://rpc.xgr.network"]}}};
 const address="0x"+"a".repeat(40);
 assert.equal(resolveCatalogRpcRead(catalog,{rpcUrl:"https://rpc.xgr.network",
  method:"eth_getCode",params:[address,"latest"]}).method,"eth_getCode");
 assert.throws(()=>resolveCatalogRpcRead(catalog,{rpcUrl:"https://rpc.xgr.network",
  method:"eth_getCode",params:[address,"0x100"]}),/latest-state/);
});
test("many concurrent wallet reads single-flight one verified chain ID",async()=>{
 const url="https://rpc.xgr.network";
 const catalog={chains:{xgrchain:{chainId:1643,rpcUrls:[url]}}};
 let identityCalls=0,reads=0;
 const fetcher=async(_url,options)=>{
  const {method}=JSON.parse(options.body);
  if(method==="eth_chainId"){
   identityCalls++;
   await new Promise(resolve=>setImmediate(resolve));
   return ok("0x66b");
  }
  reads++;
  return ok("0x123");
 };
 const responses=await Promise.all(Array.from({length:5},()=>proxyCatalogRpcRead({
  catalog,request:{rpcUrl:url,method:"eth_getBalance",
   params:["0x"+"a".repeat(40),"latest"]},fetcher})));
 assert.deepEqual(responses,Array(5).fill("0x123"));
 assert.equal(identityCalls,1,"single-flight avoids overloading upstream during wallet refresh");
 assert.equal(reads,5);
});
test("proxy 503 errors preserve safe upstream failure categories, not secrets or request params",async()=>{
 const url="https://rpc.xgr.network";
 const catalog={chains:{xgrchain:{chainId:1643,rpcUrls:[url]}}};
 const request={rpcUrl:url,method:"eth_getBalance",
  params:["0x"+"a".repeat(40),"latest"]};
 await assert.rejects(()=>proxyCatalogRpcRead({
  catalog,request,
  fetcher:async()=>({ok:false,status:403,text:async()=>"<html>blocked</html>"})
 }),error=>{
  assert.equal(error.rpcReadCode,"RPC_ALL_ENDPOINTS_FAILED");
  assert.deepEqual(error.attempts,[{endpoint:1,phase:"identity",code:"RPC_UPSTREAM_HTTP_403"}]);
  assert.equal(error.chainId,1643);
  assert.ok(!JSON.stringify(error.attempts).includes(request.params[0]));
  return true;
 });
});
test("a failed read invalidates the identity cache and independently checks fallback chain",async()=>{
 const first="https://arb1.arbitrum.io/rpc",backup="https://arbitrum-one-rpc.publicnode.com";
 let calls=0;
 const fetcher=async(url,options)=>{
  const method=JSON.parse(options.body).method;
  if(method==="eth_chainId")return ok(url===first?"0xa4b1":"0xa4b1");
  if(url===first){calls++;return {ok:false,status:503,text:async()=>""}}
  return ok("0x50");
 };
 const result=await proxyCatalogRpcRead({catalog:cat,
  request:{rpcUrl:first,method:"eth_gasPrice",params:[]},fetcher});
 assert.equal(result,"0x50");
 assert.equal(calls,1);
});
