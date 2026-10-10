import test from "node:test";
import assert from "node:assert/strict";
import {isHubHop,currentMainCommit,checkedLocalMain,assertCurrentMain,currentMainViaGit} from "./main-gate.mjs";
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

test("main work inventory returns assets by canonical key",async()=>{
 const {approvedWorkInventory}=await import("./main-gate.mjs");
 const root=new URL("../../",import.meta.url).pathname;
 const inventory=approvedWorkInventory(root);
 assert.ok(inventory.assets.XGR);
 assert.equal(inventory.assets.XGR.key,"XGR");
 assert.equal(inventory.assets.XGR.routeCount,6);
});

test("stale main still renders read-only inventory while never approving Deploy",async()=>{
 const {readOnlyWorkQueue}=await import("./main-gate.mjs");
 const root=new URL("../../",import.meta.url).pathname;
 const snapshot=await readOnlyWorkQueue(root,{
  git:a=>a[0]==="symbolic-ref"?"main":a[0]==="rev-parse"?SHA:"",
  fetcher:async()=>({ok:true,json:async()=>({object:{sha:"b".repeat(40)}})})
 });
 assert.equal(snapshot.syncStatus,"outdated");
 assert.equal(snapshot.readOnly,true);
 assert.equal(snapshot.githubApproved,false);
 assert.ok(snapshot.inventory.assets.XGR);
 assert.equal(snapshot.inventory.chains.length,4);
});
test("GitHub outage still allows a local read-only inventory but denies authorization",async()=>{
 const {readOnlyWorkQueue}=await import("./main-gate.mjs");
 const snapshot=await readOnlyWorkQueue(new URL("../../",import.meta.url).pathname,{
  git:a=>a[0]==="symbolic-ref"?"main":a[0]==="rev-parse"?SHA:"",
  fetcher:async()=>{throw Error("offline")}
 });
 assert.equal(snapshot.syncStatus,"unavailable");
 assert.equal(snapshot.githubApproved,false);
 assert.ok(snapshot.warning);
});

test("HTTP 403 uses only a verified LIVE Git main ref for deploy authorization",async()=>{
 const git=args=>{
  if(args[0]==="symbolic-ref")return "main";
  if(args[0]==="rev-parse")return SHA;
  if(args[0]==="status")return "";
  if(args[0]==="remote")return "git@github.com:xgr-network/xgr-interchain.git";
  if(args[0]==="ls-remote")return SHA+" refs/heads/main";
  throw Error("Unexpected Git operation");
 };
 const fetcher=async()=>({ok:false,status:403});
 assert.equal(currentMainViaGit(".",{git}),SHA);
 assert.equal(await assertCurrentMain(".",{git,fetcher}),SHA);
 await assert.rejects(()=>assertCurrentMain(".",{
  git:args=>args[0]==="ls-remote"?"b".repeat(40)+" refs/heads/main":git(args),
  fetcher
 }),/CURRENT GitHub main/);
});
test("origin spoofing, fallback failure and cached main never authorize deployment",async()=>{
 const fetcher=async()=>({ok:false,status:403});
 for(const fake of ["https://evil.example/xgr-network/xgr-interchain.git",
  "git@github.com:xgr-network/xgr-interchain-evil.git"]){
  assert.throws(()=>currentMainViaGit(".",{git:args=>
   args[0]==="remote"?fake:SHA+" refs/heads/main"}),/origin/);
 }
 await assert.rejects(()=>assertCurrentMain(".",{
  fetcher,git:args=>args[0]==="symbolic-ref"?"main":
   args[0]==="rev-parse"?SHA:args[0]==="status"?"":args[0]==="remote"?
    "git@github.com:xgr-network/xgr-interchain.git":""
 }),/Cannot verify live main/);
});
