import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {stampStylesheetLink,stylesheetVersion,stampRelease} from "./stamp-xita-web-style.mjs";

test("published CSS URL changes whenever stylesheet changes, not just JavaScript",()=>{
 const page='<html><head><link rel="stylesheet" href="/style.css?v=20261018-identity-compact"></head></html>';
 const a=stampStylesheetLink(page,".ux-fee-summary{display:grid}");
 const b=stampStylesheetLink(page,".ux-fee-summary{display:block}");
 assert.notEqual(a.version,b.version);
 assert.equal(a.html.includes('/style.css?v='+a.version),true);
 assert.ok(!a.html.includes("20261018-identity-compact"));
 assert.equal(stampStylesheetLink(a.html,".ux-fee-summary{display:grid}").html,a.html);
 assert.equal(stylesheetVersion("x").length,16);
});
test("missing or duplicate stylesheet URL aborts release before publication",()=>{
 assert.throws(()=>stampStylesheetLink("<html></html>","body{}"),/exactly one/);
 assert.throws(()=>stampStylesheetLink('<link href="/style.css"><link href="/style.css">',"body{}"),/exactly one/);
});
test("published release contains a fingerprint matching its CSS bytes",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-css-release-"));
 try{
  writeFileSync(join(dir,"style.css"),".ux-fee-details{display:block}");
  writeFileSync(join(dir,"index.html"),'<link rel="stylesheet" href="/style.css?v=old">');
  const version=stampRelease(dir);
  assert.equal(readFileSync(join(dir,"index.html"),"utf8"),
   '<link rel="stylesheet" href="/style.css?v='+version+'">');
  assert.equal(stampRelease(dir),version);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
