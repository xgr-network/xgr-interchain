import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=name=>readFileSync(new URL("./"+name,import.meta.url),"utf8");
test("XITA legal documents are local and linked from permanent footer",()=>{
 const shell=file("index.html"),imprint=file("imprint.html"),privacy=file("privacy-policy.html"),css=file("style.css");
 for(const h of [shell,imprint,privacy]){
   assert.match(h,/<footer>/);
   assert.match(h,/href="\/imprint\.html"/);
   assert.match(h,/href="\/privacy-policy\.html"/);
   assert.doesNotMatch(h,/href="https:\/\/xgr\.network\/(?:imprint|privacy-policy)\.html"/);
 }
 assert.match(imprint,/§ 5 DDG/);
 assert.match(imprint,/HRB 37836/);
 assert.match(privacy,/Join applications and status emails/);
 assert.match(privacy,/Zoho Mail/);
 assert.match(privacy,/not included in public GitHub PRs/);
 assert.match(css,/body>main\{flex:1 0 auto/);
 assert.match(css,/body>footer\{flex-shrink:0/);
});
