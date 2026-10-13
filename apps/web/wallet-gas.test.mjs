import test from "node:test";
import assert from "node:assert/strict";
import {readNativeGasBalances,rpcQuantity} from "./wallet-gas.js";
const user="0x1111111111111111111111111111111111111111";
const chains={
 xgrchain:{chainId:1643,rpcUrls:["https://rpc.xgr.network"],nativeCurrency:{symbol:"XGR",decimals:18}},
 base:{chainId:8453,rpcUrls:["https://base-rpc.publicnode.com"],nativeCurrency:{symbol:"ETH",decimals:18}},
 polygon:{chainId:137,rpcUrls:["https://polygon-bor-rpc.publicnode.com"],nativeCurrency:{symbol:"POL",decimals:18}}
};
const rpcMock=result=>({jsonrpc:"2.0",id:1,result});
test("reads current chain via wallet; other chains via read-only RPC",async()=>{
 const methods=[],calls=[];
 const provider={request:async({method,params})=>{
  methods.push(method);
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_getBalance"){assert.deepEqual(params,[user,"latest"]);return "0xde0b6b3a7640000"}
  throw Error("Unexpected wallet mutation");
 }};
 const fetcher=async(url,options)=>{
  assert.equal(options.method,"POST");assert.equal(options.credentials,"omit");
  assert.match(url,/^https:\/\//);
  const {method,params}=JSON.parse(options.body);
  calls.push({url,method,params});
  const hex=url.includes("base-")?"0x2105":"0x89";
  return {ok:true,json:async()=>rpcMock(method==="eth_chainId"?hex:"0x0")};
 };
 const checked=await readNativeGasBalances({account:user,chains,provider,fetcher});
 assert.equal(checked.walletChainId,1643);
 assert.equal(checked.balances.xgrchain.balanceWei,"1000000000000000000");
 assert.equal(checked.balances.xgrchain.source,"wallet");
 assert.equal(checked.balances.base.balanceWei,"0");
 assert.equal(checked.balances.polygon.status,"ready");
 assert.equal(calls.length,4);
 assert.deepEqual(methods,["eth_chainId","eth_getBalance"]);
});
test("wrong chain RPC or blocked remote requests stay unknown, never zero",async()=>{
 const fetcher=async(url)=>({
  ok:!url.includes("polygon"),json:async()=>rpcMock("0x89")
 });
 const checked=await readNativeGasBalances({account:user,chains:{base:chains.base,polygon:chains.polygon},fetcher});
 assert.equal(checked.balances.base.status,"unavailable");
 assert.equal(checked.balances.polygon.status,"unavailable");
});
test("verified zero is not an unavailable balance",async()=>{
 const fetcher=async(_,options)=>{
  const method=JSON.parse(options.body).method;
  return {ok:true,json:async()=>rpcMock(method==="eth_chainId"?"0x2105":"0x0")};
 };
 const checked=await readNativeGasBalances({account:user,chains:{base:chains.base},fetcher});
 assert.deepEqual(checked.balances.base,{status:"ready",balanceWei:"0",source:"public-rpc"});
});
test("reject malformed quantities, accounts and insecure endpoints",async()=>{
 for(const raw of ["0x","0x00","-1","100","0xQ","0x"+ "f".repeat(65)])
  assert.throws(()=>rpcQuantity(raw),/Invalid|uint256/);
 await assert.rejects(()=>readNativeGasBalances({account:"bad",chains}),/authorized/);
 const checked=await readNativeGasBalances({account:user,
  chains:{bad:{chainId:10,rpcUrls:["http://localhost:8545"]}},
  fetcher:async()=>{throw Error("Must not fetch insecure RPC")}});
 assert.equal(checked.balances.bad.status,"unavailable");
});
