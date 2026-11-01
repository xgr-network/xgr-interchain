import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {notifyApplications,verifiedProfileLink} from "./status-notifier.mjs";
import {readPrivate} from "./private-store.mjs";
test("notify applicant only on verified phase changes, retry failures and prevent repeats",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-notifier-e2e-"));
 const id=randomUUID(),assetId="0x"+"c".repeat(64);
 const proposal={number:271,url:"https://github.com/xgr-network/xgr-interchain/pull/271"};
 const record={id,assetId,phase:"under-review",
  input:{symbol:"ARB",name:"Arbitrum",contactEmail:"holder@example.org"},pr:proposal,
  sent:[],retainUntil:new Date(Date.now()+365*86400000).toISOString()};
 writeFileSync(join(dir,id+".json"),JSON.stringify(record),{mode:0o600});
 const env={XITA_JOIN_PRIVATE_DIR:dir,
  XITA_JOIN_MAIL_API_URL:"https://mail.example.org/send",
  XITA_JOIN_MAIL_API_TOKEN:"test-only",XITA_JOIN_MAIL_FROM:"contact@xgr.network"};
 let pr={state:"open",merged_at:null},visibility=null,fail=false;
 let milestones={firstRoute:null,allComplete:false,completedNetworks:[],plannedNetworks:["arbitrum","base","polygon"]};
 const sent=[];
 const run=()=>notifyApplications({env,readPR:async()=>pr,readVisibility:async()=>visibility,
  readMilestones:()=>milestones,
  deliver:async(mail)=>{if(fail)throw Error("Mock SMTP unavailable");sent.push(mail);return true;}});
 const snapshot=(status,lockedUsd,deployment)=>({schemaVersion:1,kind:"xita-visibility-v1",
  assets:{ARB:{assetId,status,lockedUsd,deployment}}});
 try{
  assert.deepEqual(await run(),[]);
  pr={state:"closed",merged_at:"2026-10-21T12:00:00Z"};
  fail=true;
  assert.deepEqual(await run(),[{id,status:"approved",sent:false}]);
  assert.deepEqual(readPrivate(dir,id).notificationQueue,["approved"]);
  fail=false;
  assert.deepEqual(await run(),[{id,status:"approved",sent:true}]);
  assert.deepEqual(await run(),[]);
  milestones={...milestones,firstRoute:{source:"arbitrum",destination:"xgrchain"}};
  visibility=snapshot("accepted",0,"deployed");
  assert.deepEqual(await run(),[{id,status:"first-route",sent:true}]);
  milestones={...milestones,allComplete:true,completedNetworks:["arbitrum","base","polygon"]};
  assert.deepEqual(await run(),[{id,status:"all-routes",sent:true}]);
  visibility=snapshot("accepted",100,"deployed");
  assert.deepEqual(await run(),[{id,status:"first-lock",sent:true}]);
  visibility=snapshot("public",100,"deployed");
  assert.deepEqual(await run(),[{id,status:"listed",sent:true}]);
  visibility=snapshot("accepted",0,"deployed");
  assert.deepEqual(await run(),[{id,status:"delisted",sent:true}]);
  assert.deepEqual(await run(),[]);
  assert.deepEqual(sent.map(x=>x.subject),[
   "XITA proposal approved","Your first XITA route is live!","Your XITA network expansion is complete!",
   "First verified XITA collateral","Your token is now listed on XITA",
   "XITA listing visibility changed"]);
  assert.ok(sent.every(x=>x.to==="holder@example.org"&&x.html.includes("XITA")));
  assert.ok(sent[0].text.includes(proposal.url));
  assert.ok(sent[1].text.includes("https://xita.xgr.network/transfer?token=ARB&origin=arbitrum&destination=xgrchain"));
  assert.ok(sent.slice(3).every(x=>x.text.includes(proposal.url)));
  assert.equal(readPrivate(dir,id).phase,"delisted");
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test("XGR Creator second email contains working public token page, not a premature PR URL",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-creator-profile-mail-")),id=randomUUID();
 const tx="0x"+"f".repeat(64),token="0x3333333333333333333333333333333333333333";
 const owner="0x1234567890123456789012345678901234567890",assetId="0x"+"c".repeat(64);
 const record={id,kind:"token-creator",assetId,phase:"pr-published",
  input:{symbol:"CREA",name:"Creator Example",ownerAddress:owner,contactEmail:"creator@example.org"},
  deployment:{status:"verified",txHash:tx,tokenAddress:token},
  pr:{number:385,url:"https://github.com/xgr-network/xgr-interchain/pull/385"},sent:[],
  retainUntil:new Date(Date.now()+365*86400000).toISOString()};
 writeFileSync(join(dir,id+".json"),JSON.stringify(record),{mode:0o600});
 const env={XITA_JOIN_PRIVATE_DIR:dir,XITA_JOIN_MAIL_API_URL:"https://mail.example.org/send",
  XITA_JOIN_MAIL_API_TOKEN:"test-only",XITA_JOIN_MAIL_FROM:"contact@xgr.network"};
 const published={schemaVersion:1,assets:{CREA:{
  metadata:{assetId,canonical:{chain:"xgrchain",tokenAddress:token},
   creation:{kind:"xgrchain-creator-v1",ownerAddress:owner,transactionHash:tx,
    factory:"0x2222222222222222222222222222222222222222",
    tokenRuntimeCodeHash:"0x"+"d".repeat(64),blockNumber:12000000}},
  profile:{slug:"creator-example",name:"Creator Example",market:{coingeckoId:null,priceSource:"none"}}}}};
 const sent=[];let merged=false,live=false,broken=false;
 const run=()=>notifyApplications({env,readVisibility:async()=>null,
  readPR:async()=>({merged_at:merged?"2026-11-01T08:00:00Z":null}),
  readPublicCatalog:async()=>live?(broken?{schemaVersion:1,assets:{...published.assets,
   CREA:{...published.assets.CREA,metadata:{...published.assets.CREA.metadata,
    canonical:{chain:"xgrchain",tokenAddress:"0x4444444444444444444444444444444444444444"}}}}}:published):
   {schemaVersion:1,assets:{}},
  deliver:async mail=>{sent.push(mail);return true}});
 try{
  assert.equal(verifiedProfileLink(record,{schemaVersion:1,assets:{}}),null);
  assert.deepEqual(await run(),[]);
  merged=true;
  assert.deepEqual(await run(),[],"Merge without live profile does not send");
  live=true;broken=true;
  assert.deepEqual(await run(),[],"A mismatched token contract must block notification");
  broken=false;
  const done=await run();
  assert.equal(done.length,1);
  assert.equal(done[0].status,"creator-profile-live");
  assert.equal(done[0].url,"https://xita.xgr.network/token/creator-example");
  assert.equal(sent.length,1,"Exactly one second message after initial email confirmation");
  assert.match(sent[0].text,/https:\/\/xita.xgr.network\/token\/creator-example/);
  assert.ok(sent[0].text.includes("Token contract (XGRChain Mainnet, chain ID 1643): "+token));
  assert.ok(sent[0].text.includes("Deployment transaction: "+tx));
  assert.ok(sent[0].html.includes(token));
  assert.match(sent[0].html,/View your token profile/);
  assert.equal(sent[0].to,"creator@example.org");
  assert.deepEqual(await run(),[]);
  assert.equal(sent.length,1);
  assert.equal(readPrivate(dir,id).phase,"profile-live");
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("profile update email waits for the exact published CoinGecko profile snapshot",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-profile-mail-")),id=randomUUID(),assetId="0x"+"b".repeat(64);
 const expected={slug:"arbitrum",name:"Arbitrum Updated",market:{coingeckoId:"arbitrum",priceSource:"coingecko"}};
 const record={id,kind:"profile-update",assetId,phase:"under-review",expectedProfile:expected,
  input:{symbol:"ARB",coingeckoId:"arbitrum",contactEmail:"owner@example.org"},
  pr:{number:300,url:"https://github.com/xgr-network/xgr-interchain/pull/300"},sent:[],
  retainUntil:new Date(Date.now()+365*86400000).toISOString()};
 writeFileSync(join(dir,id+".json"),JSON.stringify(record),{mode:0o600});
 const env={XITA_JOIN_PRIVATE_DIR:dir,XITA_JOIN_MAIL_API_URL:"https://mail.example.org/send",
  XITA_JOIN_MAIL_API_TOKEN:"test-only",XITA_JOIN_MAIL_FROM:"contact@xgr.network"};
 let fresh=false,failed=true;const outgoing=[];
 const run=()=>notifyApplications({env,readVisibility:async()=>null,
  readPR:async()=>({merged_at:"2026-11-01T08:00:00Z"}),
  readPublicCatalog:async()=>({schemaVersion:1,assets:{ARB:{metadata:{assetId},
   profile:fresh?expected:{...expected,name:"Arbitrum Previous"}}}}),
  deliver:async mail=>{if(failed)throw Error("Mail service down");outgoing.push(mail)}});
 try{
  assert.deepEqual(await run(),[]);
  fresh=true;
  assert.equal((await run())[0].sent,false);
  assert.equal((await run())[0].sent,false);
  failed=false;
  assert.equal((await run())[0].status,"profile-update-live");
  assert.deepEqual(await run(),[]);
  assert.equal(outgoing.length,1);
  assert.match(outgoing[0].text,/https:\/\/xita.xgr.network\/token\/arbitrum/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
