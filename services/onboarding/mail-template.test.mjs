import test from "node:test";
import assert from "node:assert/strict";
import {applicationMail} from "./mail-template.mjs";
test("mail template escapes untrusted token names and keeps links restricted",()=>{
 const m=applicationMail({title:"<script>oops</script>",subtitle:"Submitted",paragraphs:["A & B"],action:{label:"Continue",url:"https://xita.xgr.network/join"}});
 assert.doesNotMatch(m.html,/<script>/);
 assert.match(m.html,/&lt;script&gt;/);
 assert.match(m.html,/A &amp; B/);
 assert.match(m.text,/A & B/);
 const bad=applicationMail({title:"Test",subtitle:"",action:{label:"Open",url:"https://evil.example/click"}});
 assert.doesNotMatch(bad.html,/href=/);
});

test("verified Creator contract explorer link is allowed, unrelated URLs are not",()=>{
 const token="0x"+"a".repeat(40);
 const verified=applicationMail({title:"Token created",subtitle:"XITA Canary",
  action:{label:"View token contract",url:"https://explorer.xgr.network/address/"+token}});
 assert.match(verified.html,/href="https:\/\/explorer.xgr.network\/address\/0x[a-f0-9]{40}"/);
 for(const url of ["https://explorer.xgr.network/other",
  "https://explorer.xgr.network/address/0x123",
  "https://explorer.xgr.network.evil.example/address/"+token]){
  assert.doesNotMatch(applicationMail({title:"Test",subtitle:"",action:{label:"View",url}}).html,/href=/);
 }
});
