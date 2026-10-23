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
