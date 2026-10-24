import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {verifiedClientIP,lookupIpCountry,eurValue,quoteEvidence} from "./tax-evidence.mjs";

test("trusted quote IP cannot be spoofed by forwarded headers",()=>{
 const req={socket:{remoteAddress:"127.0.0.1"},headers:{
  "x-real-ip":"8.8.8.8","x-forwarded-for":"1.1.1.1","x-country-code":"RU"}};
 assert.equal(verifiedClientIP(req),"8.8.8.8");
 assert.throws(()=>verifiedClientIP({...req,socket:{remoteAddress:"8.8.4.4"}}),/Untrusted/);
 assert.throws(()=>verifiedClientIP({...req,headers:{"x-real-ip":"8.8.8.8, 9.9.9.9"}}),/missing/);
});
test("OTC-style local CIDR lookup returns ISO country and provenance",async()=>{
 const root=await mkdtemp(join(tmpdir(),"xita-tax-"));
 const path=join(root,"countries.csv");
 try{
  await writeFile(path,"8.8.8.0/24,US\n2001:4860::/32,US\n10.0.0.0/8,DE\n");
  let v=await lookupIpCountry("8.8.8.8",{path});
  assert.equal(v.code,"US");assert.equal(v.source,"cidr-local");assert.ok(v.revision);
  assert.equal((await lookupIpCountry("2001:4860::8888",{path})).code,"US");
  assert.equal((await lookupIpCountry("9.9.9.9",{path})).code,null);
 }finally{await rm(root,{recursive:true,force:true})}
});
test("native source fee fixed to eight-decimal EUR value",()=>{
 assert.equal(eurValue("10000000000000000","2200"),"22.00000000");
 assert.equal(eurValue("1000000000000000000","0.0001"),"0.00010000");
});

test("unknown customer country or EUR rate cannot cancel a signed fee",()=>{
 const now=Math.floor(Date.now()/1000),reply={
  status:"SIGNED_INTERCHAIN_FEE_QUOTE",source:"xgrchain",
  executionAddress:"0x"+"a".repeat(40),expiresAt:now+90,
  quote:{payer:"0x"+"b".repeat(40),nonce:"42",interchainFeeWei:"1000000000000000000",issuedAt:now}};
 const row=quoteEvidence(reply,{},"8.8.8.8",{code:null,source:"no-match"});
 assert.equal(row.country,null);assert.equal(row.euro,null);
 assert.equal(row.fee,"1000000000000000000");
});

test("ZZ synthetic CIDR cannot override country match",async()=>{
 const root=await mkdtemp(join(tmpdir(),"xita-tax-zz-"));
 const path=join(root,"countries.csv");
 try{
  await writeFile(path,"0.0.0.0/0,ZZ\\n8.8.8.0/24,US\\n");
  const matched=await lookupIpCountry("8.8.8.8",{path});
  assert.equal(matched.code,"US");
 }finally{await rm(root,{recursive:true,force:true});}
});
