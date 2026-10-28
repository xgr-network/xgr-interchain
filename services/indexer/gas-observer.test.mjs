import test from "node:test";
import assert from "node:assert/strict";
import {recordVerifiedGas,observeOnwardGas,PROCESS_ID_TOPIC} from "./gas-observer.mjs";
const h=x=>"0x"+x.repeat(64);
const config={chainId:8453,rpcUrls:["https://rpc.example.test"]};
const profile={key:"base|first-delivery|collateral|synthetic|mint|test",chain:"base"};
const tx=h("a"),block=h("b");
const rpc=async(_config,method,params)=>{
 if(method==="eth_chainId")return "0x2105";
 if(method==="eth_getBlockByNumber")return {number:"0x64",hash:block};
 if(method==="eth_getTransactionReceipt")return {
  transactionHash:tx,status:"0x1",blockNumber:"0x64",blockHash:block,
  gasUsed:"0x493e0"};
 throw Error("Unexpected RPC method "+method);
};
test("observer consumes canonical receipt gas, never wallet sponsor balances",async()=>{
 const writes=[];
 const pool={query:async q=>{writes.push(q);return {rows:[]}}};
 const good=await recordVerifiedGas({pool,rpc,chain:"base",chainConfig:config,
  txHash:tx,profile,expectedBlock:100,expectedBlockHash:block});
 assert.equal(good,true);
 assert.equal(writes.length,1);
 assert.equal(writes[0].values[5],300000);
 assert.ok(PROCESS_ID_TOPIC.startsWith("0x")&&PROCESS_ID_TOPIC.length===66);
});
test("observer never records unsuccessful or non-finalized receipts",async()=>{
 let writes=0;
 const pool={query:async()=>{writes++}};
 const bad=await recordVerifiedGas({pool,rpc:async(c,m,p)=>{
  if(m==="eth_getTransactionReceipt")return {transactionHash:tx,status:"0x0",
    blockHash:block,blockNumber:"0x64",gasUsed:"0x493e0"};
  return rpc(c,m,p);
 },chain:"base",chainConfig:config,txHash:tx,profile});
 assert.equal(bad,false);
 assert.equal(writes,0);
 const pending=await recordVerifiedGas({pool,rpc:async(c,m,p)=>{
  if(m==="eth_getBlockByNumber"&&p[0]==="safe")return {number:"0x63",hash:h("c")};
  if(m==="eth_getBlockByNumber"&&p[0]==="0x63")return {number:"0x63",hash:h("c")};
  return rpc(c,m,p);
 },chain:"base",chainConfig:config,txHash:tx,profile});
 assert.equal(pending,false);
 assert.equal(writes,0);
});
