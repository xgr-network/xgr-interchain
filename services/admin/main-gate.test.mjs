import test from "node:test";
import assert from "node:assert/strict";
import {isHubHop,currentMainCommit,checkedLocalMain,assertCurrentMain} from "./main-gate.mjs";
const x={chainId:1643,domainId:1643},base={chainId:8453,domainId:8453},polygon={chainId:137,domainId:137};
const SHA="a".repeat(40);
test("only XGRChain can serve as exactly one hop endpoint",()=>{
 assert.equal(isHubHop(x,base),true);
 assert.equal(isHubHop(base,x),true);
 assert.equal(isHubHop(base,polygon),false);
 assert.equal(isHubHop(x,x),false);
 assert.equal(isHubHop({...base,domainId:1643},polygon),false);
 assert.equal(isHubHop({chainId:1643,domainId:8453},base),false);
});
test("requires the LIVE GitHub main SHA, not PRs or cached branch commits",async()=>{
 let requested="";
 const fetcher=async url=>{requested=url;return {ok:true,json:async()=>({object:{sha:SHA}})};};
 assert.equal(await currentMainCommit({fetcher,token:null}),SHA);
 assert.equal(requested,"https://api.github.com/repos/xgr-network/xgr-interchain/git/ref/heads/main");
 assert.equal(await assertCurrentMain(".",{fetcher,git:args=>{
  if(args[0]==="symbolic-ref")return "main";
  if(args[0]==="rev-parse")return SHA;
  return "";
 }}),SHA);
});
test("no deploy on a PR branch or stale checkout",async()=>{
 const branch=()=>checkedLocalMain(".",{git:a=>a[0]==="symbolic-ref"?"feature/test":SHA});
 assert.throws(branch,/NOT running on main/);
 await assert.rejects(()=>assertCurrentMain(".",{
  fetcher:async()=>({ok:true,json:async()=>({object:{sha:SHA}})}),
  git:a=>a[0]==="symbolic-ref"?"main":a[0]==="rev-parse"?"b".repeat(40):""
 }),/not the CURRENT GitHub main/);
});
test("GitHub outage and dirty checkout block deployment",async()=>{
 await assert.rejects(()=>currentMainCommit({fetcher:async()=>({ok:false,status:503})}),/unavailable/);
 assert.throws(()=>checkedLocalMain(".",{git:a=>a[0]==="symbolic-ref"?"main":a[0]==="rev-parse"?SHA:" M contracts/X.sol"}),/differs/);
});
