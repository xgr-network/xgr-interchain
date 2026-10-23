import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {notifyApplications} from "./status-notifier.mjs";
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
 const sent=[];
 const run=()=>notifyApplications({env,readPR:async()=>pr,readVisibility:async()=>visibility,
  readReadyAssets:()=>new Set(["ARB"]),
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
  visibility=snapshot("accepted",0,"deployed");
  assert.deepEqual(await run(),[{id,status:"deployed",sent:true}]);
  visibility=snapshot("accepted",100,"deployed");
  assert.deepEqual(await run(),[{id,status:"first-lock",sent:true}]);
  visibility=snapshot("public",100,"deployed");
  assert.deepEqual(await run(),[{id,status:"listed",sent:true}]);
  visibility=snapshot("accepted",0,"deployed");
  assert.deepEqual(await run(),[{id,status:"delisted",sent:true}]);
  assert.deepEqual(await run(),[]);
  assert.deepEqual(sent.map(x=>x.subject),[
   "XITA proposal approved","XITA routes deployed",
   "First verified XITA collateral","Your token is now listed on XITA",
   "XITA listing visibility changed"]);
  assert.ok(sent.every(x=>x.to==="holder@example.org"&&x.html.includes("XITA")));
  assert.ok(sent[0].text.includes(proposal.url));
  assert.ok(sent[1].text.includes("https://xita.xgr.network/transfer?token=ARB"));
  assert.ok(sent.slice(2).every(x=>x.text.includes(proposal.url)));
  assert.equal(readPrivate(dir,id).phase,"delisted");
 }finally{rmSync(dir,{recursive:true,force:true});}
});
