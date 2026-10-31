import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {stampModuleImports,stampModuleEntrypoint,stampModuleRelease} from "./stamp-xita-web-modules.mjs";
const sha="a".repeat(40);
test("entry and every static/dynamic JS dependency share a version, preventing split-release imports",()=>{
 const source='import {foo} from "./experience.js";\nimport "./side-effect.js";\nconst a=import("./async.js");\n';
 const stamped=stampModuleImports(source,sha);
 for(const name of ["experience","side-effect","async"])assert.ok(stamped.includes("./"+name+".js?v="+sha));
 assert.equal(stampModuleEntrypoint('<script type="module" src="/app.js"></script>',sha),
  '<script type="module" src="/app.js?v='+sha+'"></script>');
 assert.equal(stampModuleEntrypoint('<script type="module" src="/app.js?v=old"></script>',sha),
  '<script type="module" src="/app.js?v='+sha+'"></script>');
 assert.throws(()=>stampModuleEntrypoint('<html></html>',sha),/exactly one/);
 assert.throws(()=>stampModuleImports(source,"invalid"),/Invalid release sha/);
});
test("staged website rewrites dependency edges without modifying repo source",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-js-release-"));
 try{
  mkdirSync(join(dir,"releases"));
  const root=join(dir,"releases",sha);mkdirSync(root);
  writeFileSync(join(root,"index.html"),'<script type="module" src="/app.js"></script>');
  writeFileSync(join(root,"app.js"),'import {f} from "./experience.js";');
  writeFileSync(join(root,"experience.js"),'import "./token-representation.js"; export const f=()=>42;');
  writeFileSync(join(root,"token-representation.js"),'export const value=1;');
  assert.equal(stampModuleRelease(root,sha),2);
  assert.match(readFileSync(join(root,"index.html"),"utf8"),/app\.js\?v=/);
  assert.match(readFileSync(join(root,"app.js"),"utf8"),/experience\.js\?v=/);
  assert.match(readFileSync(join(root,"experience.js"),"utf8"),/token-representation\.js\?v=/);
  assert.equal(stampModuleRelease(root,sha),0); // no double stamping
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("release publisher checks staged JS syntax before changing current symlink",()=>{
 const shell=readFileSync(new URL("../manage.sh",import.meta.url),"utf8");
 const body=shell.split("publish_web() {")[1]?.split("\n}\n")[0];
 assert.ok(body);
 assert.match(body,/stamp-xita-web-modules\.mjs/);
 assert.match(body,/node --check "\$script"/);
 assert.ok(body.indexOf("stamp-xita-web-modules.mjs")<body.indexOf("mv -Tf"));
 assert.ok(body.indexOf("node --check")<body.indexOf("mv -Tf"));
});
