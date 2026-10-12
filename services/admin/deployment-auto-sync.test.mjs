import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {queueDeploymentSync,validateDeploymentDiff,syncDeploymentCheckout,SYNC_REQUEST} from "./deployment-auto-sync.mjs";
const old="a".repeat(40),next="b".repeat(40);
const receipt="deployments/receipts/xgrchain/"+"1".repeat(64)+"-"+"2".repeat(40)+".json";
const safe=["A\t"+receipt,"M\tdeployments/chains/xgrchain.json","M\tapps/web/catalog.json"].join("\n");
test("a valid GitHub receipt publication may be pulled without a build",()=>{
 assert.deepEqual(validateDeploymentDiff(safe),{receipts:1,paths:3});
});
test("code, config, deletions, renames, missing receipts and unrelated assets are refused",()=>{
 for(const bad of [
  safe+"\nM\tservices/admin/server.mjs",
  safe+"\nM\tcontracts/ILNGateway.sol",
  safe+"\nM\tconfig/chains/xgrchain/chain.json",
  safe+"\nD\tdeployments/chains/xgrchain.json",
  safe+"\nR100\t"+receipt+"\tother.json",
  "M\tapps/web/catalog.json",
  safe+"\nA\tdeployments/receipts/xgrchain/unsafe.json"
 ]) assert.throws(()=>validateDeploymentDiff(bad),/refuses|requires|format/);
});
test("only the exact current main deployment commit is auto-merged",()=>{
 let merged=false,head=old,validated=0,sealed=0,fp=0;
 const git=args=>{
  if(args[0]==="symbolic-ref")return "main";
  if(args[0]==="status")return "";
  if(args[0]==="remote")return "git@github.com:xgr-network/xgr-interchain.git";
  if(args[0]==="rev-parse")return args[1]==="HEAD"?head:next;
  if(args[0]==="fetch"||args[0]==="merge-base")return "";
  if(args[0]==="diff")return safe;
  if(args[0]==="merge"){merged=true;head=next;return ""}
  throw Error("Unexpected git: "+args.join(" "));
 };
 const outcome=syncDeploymentCheckout("/tmp",next,{
  git,sourceFingerprint:()=>{fp++;return "f".repeat(64)},
  verifyArtifacts:()=>{sealed++},validate:()=>{validated++}
 });
 assert.deepEqual(outcome,{updated:true,commit:next,receipts:1,paths:3});
 assert.equal(merged,true);assert.equal(sealed,2);assert.equal(fp,2);assert.equal(validated,1);
});
test("stale remote commit, dirty checkout, and nonreceipt commit cannot auto-merge",()=>{
 for(const mode of ["stale","dirty","code","origin"]){
  let merged=false;
  const git=args=>{
   if(args[0]==="symbolic-ref")return "main";
   if(args[0]==="status")return mode==="dirty"?" M contracts/Foo.sol":"";
   if(args[0]==="remote")return mode==="origin"?"https://attacker.example/repo":"git@github.com:xgr-network/xgr-interchain.git";
   if(args[0]==="rev-parse")return args[1]==="HEAD"?old:mode==="stale"?"c".repeat(40):next;
   if(args[0]==="fetch"||args[0]==="merge-base")return "";
   if(args[0]==="diff")return mode==="code"?"M\tservices/admin/server.mjs":safe;
   if(args[0]==="merge"){merged=true;return ""}
   throw Error("Unexpected git");
  };
  assert.throws(()=>syncDeploymentCheckout("/tmp",next,{
   git,verifyArtifacts:()=>{},sourceFingerprint:()=>"",validate:()=>{}
  }));
  assert.equal(merged,false);
 }
});
test("only valid verified commits can request checkout sync; no HTTP/git operation",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-sync-request-"));
 try{
  assert.throws(()=>queueDeploymentSync(dir,"bad"),/commit/);
  const signal=queueDeploymentSync(dir,next);
  assert.deepEqual(signal,{queued:true,commit:next});
  const p=join(dir,SYNC_REQUEST);
  assert.equal(existsSync(p),true);
  assert.equal(JSON.parse(readFileSync(p,"utf8")).commit,next);
  assert.deepEqual(queueDeploymentSync(dir,next),signal);
  assert.throws(()=>queueDeploymentSync(dir,old),/pending/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
