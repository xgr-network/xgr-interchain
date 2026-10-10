import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {sealArtifacts,readSealedArtifacts,NAMES} from "./sealed-artifacts.mjs";
import {createHash} from "node:crypto";
const sha="a".repeat(40);
test("offline admin reads release-pinned bytecode without invoking compiler",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-sealed-"));
 try{
  for(const name of NAMES){
   const folder=join(dir,"out",name+".sol");
   mkdirSync(folder,{recursive:true});
   writeFileSync(join(folder,name+".json"),JSON.stringify({component:name}));
  }
  const sealed=sealArtifacts(dir,{commit:sha,forgeVersion:"forge Version 1.8.3"});
  assert.equal(Object.keys(sealed.artifacts).length,NAMES.length);
  assert.deepEqual(Object.keys(readSealedArtifacts(dir,sha).raws).sort(),[...NAMES].sort());
  const file=join(dir,"out",NAMES[0]+".sol",NAMES[0]+".json");
  writeFileSync(file,'{"tampered":true}');
  assert.throws(()=>readSealedArtifacts(dir,sha),/changed or is missing/);
  assert.throws(()=>readSealedArtifacts(dir,"b".repeat(40)),/not sealed/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("UI no longer requires separate Forge/gas action",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const js=readFileSync(new URL("./admin.js",import.meta.url),"utf8");
 assert.ok(!html.includes('id="modal-gas-check"'));
 assert.ok(js.includes('el("modal-deploy").disabled=false'));
 const trusted=readFileSync(new URL("./trusted-artifacts.mjs",import.meta.url),"utf8");
 assert.ok(!trusted.includes('exec(forge,["build"'));
});
