import test from "node:test";
import assert from "node:assert/strict";
import {publishCreatorFactoryPR} from "./creator-factory-github.mjs";
import {creatorFactoryManifest} from "./creator-factory-deploy.mjs";
const sha="a".repeat(40),tree="b".repeat(40),commit="c".repeat(40);
const manifest=creatorFactoryManifest({address:"0x"+"d".repeat(40),
 deploymentTxHash:"0x"+"e".repeat(64),runtimeCodeKeccak256:"0x"+"f".repeat(64)});
const reply=(data,status=200)=>({status,ok:status>=200&&status<300,
 json:async()=>data});
test("Creator Factory PR writes exactly the verified manifest path, creates a Draft, not main",async()=>{
 const calls=[];
 const fake=async(url,args)=>{
  const path=url.split("/repos/xgr-network/xgr-interchain")[1];
  calls.push({path,method:args.method,body:args.body?JSON.parse(args.body):null});
  if(path==="/git/ref/heads/main")return reply({object:{sha}});
  if(path.includes("/contents/config/creator/factory.json"))return reply({},404);
  if(path==="/git/commits/"+sha)return reply({tree:{sha:tree}});
  if(path==="/git/trees"){
   assert.equal(args.method,"POST");
   assert.deepEqual(JSON.parse(args.body).tree.map(x=>x.path),["config/creator/factory.json"]);
   assert.deepEqual(JSON.parse(JSON.parse(args.body).tree[0].content),manifest);
   return reply({sha:tree});
  }
  if(path.startsWith("/git/ref/heads/creator-factory/"))return reply({},404);
  if(path==="/git/commits")return reply({sha:commit});
  if(path==="/git/refs")return reply({ref:"refs/heads/creator-factory/deploy-"+manifest.deploymentTxHash.slice(2,18)});
  if(path.startsWith("/pulls?"))return reply([]);
  if(path==="/pulls"){assert.equal(JSON.parse(args.body).draft,true);return reply({
   number:702,html_url:"https://github.com/xgr-network/xgr-interchain/pull/702"});}
  throw Error("unexpected GitHub route "+path);
 };
 const output=await publishCreatorFactoryPR({manifest,sourceCommit:sha},{token:"test-only",fetcher:fake});
 assert.equal(output.number,702);
 assert.equal(output.draft,true);
 assert.equal(calls.filter(x=>x.path==="/git/trees").length,1);
 assert.equal(calls.filter(x=>x.path==="/pulls").length,1);
 assert.ok(!calls.some(x=>x.path.startsWith("/git/refs/heads/main")));
});
test("Factory publisher rejects invalid evidence or unapproved source before any write",async()=>{
 let writes=0;
 const fake=async(url,args)=>{writes++;return reply({object:{sha:"f".repeat(40)}});};
 await assert.rejects(()=>publishCreatorFactoryPR({
  manifest:{...manifest,chainId:8453},sourceCommit:sha},{token:"test",fetcher:fake}),/unverified/);
 assert.equal(writes,0);
 await assert.rejects(()=>publishCreatorFactoryPR({
  manifest,sourceCommit:sha},{token:"test",fetcher:fake}),/main advanced/);
 assert.equal(writes,1);
 await assert.rejects(()=>publishCreatorFactoryPR({
  manifest,sourceCommit:sha},{token:"",fetcher:fake}),/credential/);
});
