import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {loadCatalog} from "../../tools/validate-manifests.mjs";
import {handleJoin,joinAvailable,joinGithubToken} from "./server.mjs";
import {listPrivate} from "./private-store.mjs";
const catalog=loadCatalog();
const input={
 name:"Example Protocol",symbol:"EXMP",
 website:"https://example.org",shortDescription:"A sample test token for cross-chain routing.",
 description:"A sample project with valid fields for testing the XITA onboarding manifest generation process.",
 canonicalChain:"base",canonicalAddress:"0x1234567890123456789012345678901234567890",
 decimals:18,categories:["DeFi"],tags:["Cross-chain"],
 logoUrl:"https://example.org/logo.png",priceSource:"coingecko",coingeckoId:"example-token",
 contactEmail:"partner@example.org",applicantRole:"holder",confirmed:true
};
test("Join reuses the already configured XITA GitHub writer credential",()=>{
 assert.equal(joinGithubToken({XITA_GITHUB_TOKEN:"existing-admin"}),"existing-admin");
 assert.equal(joinGithubToken({XITA_GITHUB_TOKEN:"existing-admin",XITA_JOIN_WRITER_TOKEN:"override"}),"override");
 assert.equal(joinGithubToken({}),"");
});
test("Join status fails closed until private email delivery and writer exist",()=>{
 assert.equal(joinAvailable({}),false);
 assert.equal(joinAvailable({XITA_JOIN_WRITER_TOKEN:"yes"}),false);
 assert.equal(joinAvailable({XITA_GITHUB_TOKEN:"yes"}),false);
});
test("email confirmation is private, single-use and required before public GitHub Draft PR",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-join-integration-")),mail=[];
 const env={XITA_JOIN_WRITER_TOKEN:"secret-test",XITA_JOIN_PRIVATE_DIR:dir,
  XITA_JOIN_MAIL_API_URL:"https://mail.example.org/send",
  XITA_JOIN_MAIL_API_TOKEN:"secret-mail",XITA_JOIN_MAIL_FROM:"contact@xgr.network"};
 let proposals=0;
 const deliver=async arg=>{mail.push(arg);return true;};
 const handler={env,deliver,sourceCatalog:()=>catalog,
  verify:async()=>({platform:"base",address:input.canonicalAddress,checkedAt:new Date().toISOString()}),
  getMainSha:async()=>"a".repeat(40),
  publisher:async(bundle,{expectedMain})=>{
   proposals++;assert.equal(expectedMain,"a".repeat(40));
   assert.equal(bundle.summary.applicantRole,"holder");
   assert.equal(bundle.summary.routeCount,
    Object.keys(catalog.chains).filter(name=>name!=="xgrchain").length*2);
   assert.deepEqual(bundle.summary.chains.sort(),Object.keys(catalog.chains).sort());
   assert.equal(JSON.stringify(bundle.files).includes("partner@example.org"),false);
   return {number:271,url:"https://github.com/xgr-network/xgr-interchain/pull/271",status:"draft"};
  }
 };
 const server=createServer((req,res)=>{void handleJoin(req,res,handler)});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+server.address().port;
 async function post(path,body){
  const response=await fetch(origin+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 try{
  const preview=await post("/api/xita/join/preview",input);
  assert.equal(preview.status,200);
  assert.equal(preview.body.assetId.length,66);
  assert.deepEqual(preview.body.summary.chains.sort(),Object.keys(catalog.chains).sort());
  assert.equal(preview.body.summary.routeCount,(Object.keys(catalog.chains).length-1)*2);
  assert.equal(JSON.stringify(preview.body).includes(input.contactEmail),false);
  const result=await post("/api/xita/join/submit",input);
  assert.equal(result.status,202);
  assert.equal(result.body.status,"pending-email");
  assert.equal(proposals,0);
  assert.equal(mail.length,1);
  const duplicate=await post("/api/xita/join/submit",input);
  assert.equal(duplicate.status,409);
  assert.equal(proposals,0);
  const code=/\/join\/confirm#([0-9a-f-]{36})\.([0-9a-f]{64})/.exec(mail[0].text);
  assert.ok(code);
  const token={id:code[1],token:code[2]};
  const invalid=await post("/api/xita/join/confirm",{...token,token:"f".repeat(64)});
  assert.equal(invalid.status,422);
  assert.equal(proposals,0);
  const confirmed=await post("/api/xita/join/confirm",token);
  assert.equal(confirmed.status,200);
  assert.equal(confirmed.body.prNumber,271);
  assert.equal(proposals,1);
  assert.equal(mail.length,2);
  const repeated=await post("/api/xita/join/confirm",token);
  assert.equal(repeated.status,422);
  assert.equal(proposals,1);
  const stored=listPrivate(dir);
  assert.equal(stored[0].phase,"under-review");
  assert.equal(stored[0].pr.number,271);
  assert.equal(stored[0].tokenHash,null);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
