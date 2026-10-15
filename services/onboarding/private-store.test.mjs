import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {privateLocation,createPending,readPrivate,savePrivate,lockedRecord,listPrivate,matchesToken,confirmationHash} from "./private-store.mjs";
import {sendMail,mailConfigured,smtpSettings} from "./mail-gateway.mjs";
test("contacts stay in owner-only private storage; only token hash persists",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-join-private-"));
 try{
  const o=createPending(dir,{contactEmail:"member@example.org",applicantRole:"holder"},"0x"+"a".repeat(64));
  assert.equal(statSync(join(dir,o.id+".json")).mode&0o077,0);
  const raw=readFileSync(join(dir,o.id+".json"),"utf8");
  assert.equal(raw.includes(o.token),false);
  assert.equal(matchesToken(confirmationHash(o.token),o.token),true);
  assert.equal(matchesToken(confirmationHash(o.token),"f".repeat(64)),false);
  await lockedRecord(dir,o.id,async(record)=>{record.phase="under-review";savePrivate(dir,record);});
  assert.equal(readPrivate(dir,o.id).phase,"under-review");
  assert.equal(listPrivate(dir).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("private storage cannot default to repository or relative paths",()=>{
 assert.throws(()=>privateLocation({XITA_JOIN_PRIVATE_DIR:"data"}),/absolute/);
 assert.throws(()=>privateLocation({XITA_JOIN_PRIVATE_DIR:process.cwd()}),/outside|absolute/);
});
test("mail gateway requires server-only config, sends no address to Github",async()=>{
 const env={XITA_JOIN_MAIL_API_URL:"https://mail.example.org/xita",XITA_JOIN_MAIL_API_TOKEN:"secret",XITA_JOIN_MAIL_FROM:"contact@xgr.network"};
 assert.equal(mailConfigured(env),true);
 assert.equal(mailConfigured({...env,XITA_JOIN_MAIL_API_URL:"http://localhost:8080"}),false);
 const capture=[];
 await sendMail({to:"member@example.org",subject:"Confirm XITA",text:"Please confirm",idempotencyKey:"test:1"},
  {env,fetcher:async(url,opts)=>{capture.push({url,opts});return {ok:true}}});
 assert.equal(JSON.parse(capture[0].opts.body).to,"member@example.org");
 assert.equal(capture[0].opts.headers["Idempotency-Key"],"test:1");
});

test("use existing Zoho SMTP on port 465 with TLS, credentials never written to GitHub",async()=>{
 const env={SMTP_HOST:"smtppro.zoho.eu",SMTP_PORT:"465",SMTP_USER:"contact@xgr.network",
  SMTP_PASS:"test-only-secret",SMTP_FROM:"contact@xgr.network"};
 assert.equal(mailConfigured(env),true);
 assert.equal(smtpSettings(env).secure,true);
 assert.equal(smtpSettings(env).tls.rejectUnauthorized,true);
 assert.equal(mailConfigured({...env,SMTP_PASS:""}),false);
 assert.equal(mailConfigured({...env,SMTP_PORT:"25"}),false);
 const captured=[];
 const factory=opts=>({sendMail:async msg=>{captured.push({opts,msg});return {accepted:[msg.to]};},close:()=>{}});
 await sendMail({to:"partner@example.org",subject:"XITA proposal received",text:"Application approved.",idempotencyKey:"app:approved"},{env,createTransport:factory});
 assert.equal(captured.length,1);
 assert.equal(captured[0].opts.port,465);
 assert.equal(captured[0].opts.auth.user,env.SMTP_USER);
 assert.equal(captured[0].msg.from,env.SMTP_FROM);
 assert.match(captured[0].msg.messageId,/^<[0-9a-f]{64}@xita\.xgr\.network>$/);
 await assert.rejects(sendMail({to:"bad@example.org\r\nBCC:bad@example.net",subject:"Oops",text:"x"},{env,createTransport:factory}),/Invalid mail recipient/);
 await assert.rejects(sendMail({to:"partner@example.org",subject:"Hello\nBcc: bad",text:"x"},{env,createTransport:factory}),/Invalid email subject/);
});
