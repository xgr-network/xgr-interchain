import test from "node:test";
import assert from "node:assert/strict";
import {explorerSourceGroups,candidateSourceHashes,etherscanAccountPage,
 discoverExplorerWallet,mergeVerifiedWalletHistory,cachedExplorerWallet} from "./explorer-wallet-discovery.mjs";
const addr=n=>"0x"+n.repeat(40),hash=n=>"0x"+n.repeat(64);
const account=addr("a"),gateway=addr("b"),adapter=addr("c");
const group={sourceChain:"arbitrum",chainId:42161,fromBlock:200,routes:[],
 targets:new Set([gateway,adapter])};
const row=(tx,to=gateway)=>({hash:tx,from:account,to,isError:"0"});
const key="TESTKEYLONG123";
test("official explorer request is read-only, fixed endpoint, chain-bound and paginated",async()=>{
 let calls=0;
 const reply=await etherscanAccountPage({chainId:42161,account,action:"txlist",
  fromBlock:200,key,allowRequest:()=>true,fetcher:async(url,options)=>{
   calls++;const parsed=new URL(url);
   assert.equal(parsed.hostname,"api.etherscan.io");
   assert.equal(parsed.searchParams.get("chainid"),"42161");
   assert.equal(parsed.searchParams.get("startblock"),"200");
   assert.equal(parsed.searchParams.get("address"),account);
   assert.equal(options.method,"GET");
   return {ok:true,json:async()=>({status:"1",result:[row(hash("d"))]})};
  }});
 assert.equal(calls,1);assert.equal(reply.rows.length,1);
});
test("wallet and documented target must match before receipt verification",()=>{
 const hashes=candidateSourceHashes(account,group,{normal:[
  row(hash("d")),row(hash("e"),adapter),row(hash("f"),addr("d")),
  {...row(hash("1")),from:addr("2")}, {...row(hash("3")),isError:"1"}
 ]});
 assert.deepEqual(hashes,[hash("d"),hash("e")]);
});
test("adapter discovery never turns unverified explorer claim into actionable transfer",async()=>{
 const calls=[];
 const out=await discoverExplorerWallet({catalog:{},account,key,groups:[group],
  fetcher:async url=>({ok:true,json:async()=>({
   status:"1",result: url.includes("action=txlist")?[row(hash("d"))]:[]
  })}),
  verify:async(g,tx)=>{calls.push(tx);throw Error("RPC unavailable")}});
 assert.deepEqual(calls,[hash("d")]);
 assert.equal(out.items[0].status,"explorer-discovered");
 assert.equal(out.items[0].confirmed,false);
 assert.equal(out.items[0].messageId,null);
 assert.equal(out.items[0].destinationChain,null);
});
test("verified transfer returned only after original verifier confirms wallet and chain",async()=>{
 const verified={account,sourceChain:"arbitrum",txHash:hash("d"),asset:"XGR",
  destinationChain:"xgrchain",finalDestinationChain:"base",confirmed:true,
  delivered:false,messageId:hash("e"),status:"awaiting-proof"};
 const out=await discoverExplorerWallet({catalog:{},account,key,groups:[group],
  fetcher:async url=>({ok:true,json:async()=>({status:"1",
   result:url.includes("action=txlist")?[row(hash("d"))]:[]})}),
  verify:async()=>verified});
 assert.equal(out.items[0].finalDestinationChain,"base");
 assert.equal(out.items[0].confirmed,true);
});
test("DB record wins over explorer duplicate and wallet filters enforce scope",()=>{
 const verified={account,sourceChain:"arbitrum",txHash:hash("d"),
  confirmed:true,status:"awaiting-proof"};
 const out=mergeVerifiedWalletHistory({status:"partial",items:[verified],openCount:1},
  {status:"available",items:[{...verified,status:"explorer-discovered",confirmed:false},
    {...verified,account:addr("2"),txHash:hash("e")} ]},{account});
 assert.equal(out.items.length,1);assert.equal(out.items[0].status,"awaiting-proof");
});
test("rate-limit errors do not fabricate empty canonical history",async()=>{
 const result=await etherscanAccountPage({chainId:42161,account,action:"txlist",
  key,allowRequest:()=>true,fetcher:async()=>({ok:true,json:async()=>({
   status:"0",message:"NOTOK",result:"Max rate limit reached"})})}).catch(x=>x.message);
 assert.match(result,/rate limited/);
});
