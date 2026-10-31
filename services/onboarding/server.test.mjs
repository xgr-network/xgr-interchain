import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {loadCatalog} from "../../tools/validate-manifests.mjs";
import {handleJoin,hasBlockingJoinApplication,joinAvailable,joinGithubToken,joinReadiness} from "./server.mjs";
import {listPrivate} from "./private-store.mjs";
import {isDeployedChain} from "../../apps/web/route-availability.js";
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
test("Join readiness rejects broken operator inventory even with mail and GitHub configured",()=>{
 const env={XITA_JOIN_WRITER_TOKEN:"writer",XITA_JOIN_PRIVATE_DIR:"/tmp/xita-join-qa",
  XITA_JOIN_MAIL_API_URL:"https://mail.example.org/send",
  XITA_JOIN_MAIL_API_TOKEN:"mail",XITA_JOIN_MAIL_FROM:"contact@xgr.network"};
 assert.equal(joinReadiness(env,()=>catalog).available,true);
 const broken=structuredClone(catalog);
 broken.infrastructure.base.xitaV315.components.dispatchHook.receiptPath="deployments/receipts/base/invalid.json";
 const status=joinReadiness(env,()=>broken);
 assert.equal(status.available,false);
 assert.match(status.note,/operator verification/);
 assert.equal(joinReadiness(env,()=>{throw Error("missing files")}).available,false);
});
test("Join preview blocks bad operator inventory before calling CoinGecko",async()=>{
 const broken=structuredClone(catalog);
 broken.infrastructure.base.xitaV315.components.dispatchHook.receiptPath="deployments/receipts/base/invalid.json";
 let verifies=0;
 const server=createServer((req,res)=>{void handleJoin(req,res,{
  sourceCatalog:()=>broken,verify:async()=>{verifies++;throw Error("must not verify")}})});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const url="http://127.0.0.1:"+server.address().port;
  const preview=await fetch(url+"/api/xita/join/preview",{method:"POST",
   headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
  const body=await preview.json();
  assert.equal(body.ok,false);
  assert.match(body.error,/Join inventory unavailable/);
  assert.equal(verifies,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
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
  publisher:async(bundle,{expectedMain,applicationId})=>{
   assert.match(applicationId,/^[0-9a-f-]{36}$/);
   proposals++;assert.equal(expectedMain,"a".repeat(40));
   assert.equal(bundle.summary.applicantRole,"holder");
   assert.equal(bundle.summary.routeCount,
    Object.keys(catalog.chains).filter(name=>name!=="xgrchain"&&isDeployedChain(catalog,name)).length*2);
   assert.deepEqual(bundle.summary.chains.sort(),Object.keys(catalog.chains).filter(name=>name==="xgrchain"||isDeployedChain(catalog,name)).sort());
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
  assert.equal(preview.body.summary.routeCount,Object.keys(catalog.chains).filter(name=>name!=="xgrchain"&&isDeployedChain(catalog,name)).length*2);
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
  assert.equal(repeated.status,200);
  assert.equal(repeated.body.prNumber,271);
  assert.equal(proposals,1);
  const stored=listPrivate(dir);
  assert.equal(stored[0].phase,"under-review");
  assert.equal(stored[0].pr.number,271);
  assert.equal(stored[0].tokenHash,null);
  assert.match(stored[0].receiptHash,/^[0-9a-f]{64}$/);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});

test("unconfirmed email expires and permits a new application after 24 hours",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-join-expiry-"));
 const now=Date.UTC(2026,9,31,8);
 try{
  const {createPending}=await import("./private-store.mjs");
  const id="0x"+"a".repeat(64);
  const a=createPending(dir,{contactEmail:"mail@example.org"},id,{now});
  assert.equal(listPrivate(dir,{now:now+86400000-1}).length,1);
  assert.equal(await hasBlockingJoinApplication(listPrivate(dir,{now:now+86400000-1}),id,{readPR:async()=>{throw Error("not called")}}),true);
  assert.equal(listPrivate(dir,{now:now+86400000+1}).length,0);
  assert.equal(await hasBlockingJoinApplication(listPrivate(dir,{now:now+86400000+1}),id),false);
  const second=createPending(dir,{contactEmail:"mail@example.org"},id,{now:now+86400000+2});
  assert.notEqual(second.id,a.id);
  assert.notEqual(second.token,a.token);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("closed or deleted unmerged PR allows reapplication; open or merged PR blocks",async()=>{
 const assetId="0x"+"a".repeat(64);
 const record={assetId,phase:"under-review",pr:{number:271}};
 const check=(records,readPR)=>hasBlockingJoinApplication(records,assetId,{readPR});
 assert.equal(await check([record],async()=>({state:"closed",merged:false,merged_at:null})),false);
 assert.equal(await check([record],async()=>{throw Error("GitHub rejected request (404)")}),false);
 assert.equal(await check([record],async()=>({state:"open",merged:false})),true);
 assert.equal(await check([record],async()=>({state:"closed",merged:true,merged_at:"2026-10-28T00:00:00Z"})),true);
 assert.equal(await check([{...record,phase:"rejected"}],async()=>({state:"closed",merged:false})),false);
 assert.equal(await check([{...record,phase:"pending-email",pr:null}],async()=>{throw Error("should not be called")}),true);
 assert.equal(await check([{...record,phase:"approved"}],async()=>{throw Error("should not be called")}),true);
 await assert.rejects(()=>check([record],async()=>{throw Error("GitHub rejected request (503)")}),/status unavailable/);
 await assert.rejects(()=>check([record],async()=>null),/status unavailable/);
});
