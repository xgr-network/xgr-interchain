import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {deflateSync} from "node:zlib";
import {readCanaryInput,submitCanary} from "./creator-canary.mjs";
import {listPrivate} from "./private-store.mjs";

function crc(data){let c=0xffffffff;for(const b of data){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),n=Buffer.alloc(4),sum=Buffer.alloc(4);n.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([n,name,data,sum]);}
function png(){
 const h=Buffer.alloc(13);h.writeUInt32BE(1,0);h.writeUInt32BE(1,4);h[8]=8;h[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",h),
  chunk("IDAT",deflateSync(Buffer.from([0,255,0,0,255]))),chunk("IEND",Buffer.alloc(0))]).toString("base64");
}
const owner="0x1234567890123456789012345678901234567890";
const template={
 name:"XITA Canary",symbol:"XITACAN",initialSupply:"1000",ownerAddress:owner,
 tokenType:"burnable",decimals:18,maxSupply:"1000",minterAddress:null,permit:false,
 shortDescription:"Internal XITA deployment validation token.",
 description:"A temporary operator-created XITA canary ERC-20 used to validate the production token Creator registration, email confirmation and verified Join proposal.",
 website:"https://xgr.network",categories:["Infrastructure"],tags:[],applicantRole:"core-team",
 contactEmail:"canary@example.org",links:{},confirmed:true,logoPngBase64:png()
};
test("canary dry run permits only restricted private XITA Canary payload",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-creator-canary-"));
 const file=join(dir,"canary-request.json");
 const env={XITA_JOIN_PRIVATE_DIR:dir};
 try{
  writeFileSync(file,JSON.stringify(template),{mode:0o600});
  const {record}=readCanaryInput(file,env);
  assert.equal(record.symbol,"XITACAN");
  assert.equal(record.initialSupply,"1000");
  assert.throws(()=>readCanaryInput(file,{XITA_JOIN_PRIVATE_DIR:"/elsewhere"}),/private Join directory/);
  writeFileSync(file,JSON.stringify({...template,symbol:"BAD"}));
  assert.throws(()=>readCanaryInput(file,env),/Only the reviewed/);
  chmodSync(file,0o644);
  assert.throws(()=>readCanaryInput(file,env),/0600/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("isolated canary sends exactly one real-flow verification email and leaves queue pending",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-creator-canary-mail-")),emails=[];
 const env={XITA_JOIN_PRIVATE_DIR:dir,XITA_CREATOR_PUBLIC_ENABLED:"false"};
 try{
  const r=await submitCanary(template,{env,deliver:async mail=>{emails.push(mail)}});
  assert.equal(r.status,"pending-email");
  const row=listPrivate(dir)[0];
  assert.equal(row.kind,"token-creator");
  assert.equal(row.phase,"pending-email");
  assert.equal(row.deployment,undefined);
  assert.equal(emails.length,1);
  assert.match(emails[0].text,/\/createtoken\/confirm#/);
  assert.equal(env.XITA_CREATOR_PUBLIC_ENABLED,"false","the public configuration never changes");
  await assert.rejects(()=>submitCanary(template,{env,deliver:async mail=>{emails.push(mail)}}),/HTTP 409/);
  assert.equal(emails.length,1);
  await assert.rejects(()=>submitCanary(template,{
   env:{...env,XITA_CREATOR_PUBLIC_ENABLED:"true"},deliver:async()=>{}
  }),/Public Creator is already enabled/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
