import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {deflateSync} from "node:zlib";
import {handleJoin} from "./server.mjs";
import {listPrivate} from "./private-store.mjs";

function crc(data){let c=0xffffffff;for(const b of data){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),n=Buffer.alloc(4),sum=Buffer.alloc(4);n.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([n,name,data,sum]);}
function png(){
 const h=Buffer.alloc(13);h.writeUInt32BE(1,0);h.writeUInt32BE(1,4);h[8]=8;h[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",h),
  chunk("IDAT",deflateSync(Buffer.from([0,255,0,0,255]))),chunk("IEND",Buffer.alloc(0))]).toString("base64");
}
const input={name:"Example Token",symbol:"EXM",initialSupply:"1000000",ownerAddress:"0x1234567890123456789012345678901234567890",
 shortDescription:"A community-governed ERC20 sample project.",description:
 "Example Token is a small community project testing XGRChain token creation and future Interchain integrations.",
 website:"https://example.org",categories:["DeFi"],tags:[],applicantRole:"founder",
 links:{x:"https://x.com/example"},contactEmail:"partner@example.org",confirmed:true,logoPngBase64:png()};
const config=dir=>({XITA_JOIN_PRIVATE_DIR:dir,
 XITA_JOIN_MAIL_API_URL:"https://mail.example.org/send",
 XITA_JOIN_MAIL_API_TOKEN:"test-secret",XITA_JOIN_MAIL_FROM:"contact@xgr.network"});
test("unverified logo is private; confirmed email publishes sanitized permanent XITA URL exactly once",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-creator-test-")),emails=[];
 let now=Date.UTC(2026,9,31,10);
 const server=createServer((req,res)=>{void handleJoin(req,res,{env:config(dir),clock:()=>now,
  deliver:async mail=>{emails.push(mail);return true}})});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port;
 async function post(path,data){const reply=await fetch(url+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});return {status:reply.status,body:await reply.json()}}
 try{
  const unverified=await post("/api/xita/creator/register",input);
  assert.equal(unverified.status,202);assert.equal(unverified.body.status,"pending-email");
  const record=listPrivate(dir,{now})[0];assert.equal(record.kind,"token-creator");
  assert.equal(record.phase,"pending-email");assert.ok(!record.logoUrl);
  assert.equal(record.input.ownerAddress,input.ownerAddress);
  assert.equal(emails.length,1);
  assert.equal(JSON.stringify(emails).includes(input.logoPngBase64),false);
  const match=/\/createtoken\/confirm#([0-9a-f-]{36})\.([a-f0-9]{64})/.exec(emails[0].text);
  assert.ok(match);
  const logoPath="/token-logos/"+record.logoHash+".png";
  assert.equal((await fetch(url+logoPath)).status,404,"no image hosting before email verification");
  const duplicate=await post("/api/xita/creator/register",input);
  assert.equal(duplicate.status,409);
  const bad=await post("/api/xita/creator/confirm",{id:match[1],token:"f".repeat(64)});
  assert.equal(bad.status,422);assert.equal((await fetch(url+logoPath)).status,404);
  const confirmed=await post("/api/xita/creator/confirm",{id:match[1],token:match[2]});
  assert.equal(confirmed.status,200);assert.equal(confirmed.body.status,"email-verified");
  assert.equal(confirmed.body.deploymentStatus,"queued");
  assert.equal(confirmed.body.logoUrl,"https://xita.xgr.network"+logoPath);
  const logo=await fetch(url+logoPath);
  assert.equal(logo.status,200);assert.equal(logo.headers.get("content-type"),"image/png");
  assert.match(logo.headers.get("cache-control"),/immutable/);
  assert.equal((await logo.arrayBuffer()).byteLength>60,true);
  const repeated=await post("/api/xita/creator/confirm",{id:match[1],token:match[2]});
  assert.deepEqual(repeated.body,confirmed.body);
  assert.equal(listPrivate(dir,{now})[0].phase,"deployment-queued");
  assert.equal(listPrivate(dir,{now})[0].input.contactEmail,input.contactEmail);
  assert.equal(JSON.stringify(confirmed.body).includes(input.contactEmail),false);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}
});
test("expired confirmation is rejected and no public logo appears",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-creator-expired-")),emails=[];
 let now=Date.UTC(2026,9,31,10);
 const server=createServer((req,res)=>{void handleJoin(req,res,{env:config(dir),clock:()=>now,
  deliver:async mail=>{emails.push(mail);return true}})});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port;
 async function post(path,data){const res=await fetch(url+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});return {status:res.status,body:await res.json()}}
 try{
  const registered=await post("/api/xita/creator/register",{...input,contactEmail:"different@example.org"});
  assert.equal(registered.status,202);
  const record=listPrivate(dir,{now})[0];
  const code=/\/createtoken\/confirm#([0-9a-f-]{36})\.([a-f0-9]{64})/.exec(emails[0].text);
  now+=86400001;
  const confirm=await post("/api/xita/creator/confirm",{id:code[1],token:code[2]});
  assert.equal(confirm.status,422);
  assert.equal((await fetch(url+"/token-logos/"+record.logoHash+".png")).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}
});
test("server rejects forged HTML/SVG logos and incorrect project relationships",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-creator-invalid-"));
 const server=createServer((req,res)=>{void handleJoin(req,res,{env:config(dir),deliver:async()=>true})});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const url="http://127.0.0.1:"+server.address().port;
  for(const payload of [
   {...input,logoPngBase64:Buffer.from("<svg onload=alert(1)/>").toString("base64")},
   {...input,applicantRole:"anonymous"},
   {...input,website:"http://localhost"},
   {...input,initialSupply:"999999999999999999999"},
   {...input,contactEmail:"not-an-email"},
   {...input,ownerAddress:"0x"+"0".repeat(40)},
   {...input,ownerAddress:"garbage"}
  ]){
   const reply=await fetch(url+"/api/xita/creator/register",{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   assert.equal(reply.status,422);
  }
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}
});
