import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {sealArtifacts,readSealedArtifacts,deploymentSourceFingerprint,NAMES} from "./sealed-artifacts.mjs";
const sha="a".repeat(40),later="b".repeat(40),fingerprint="c".repeat(64);
test("sealed deployment release survives Forge out removal and unrelated main commits",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-sealed-"));
 try{
  for(const name of NAMES){
   const folder=join(dir,"out",name+".sol");
   mkdirSync(folder,{recursive:true});
   writeFileSync(join(folder,name+".json"),JSON.stringify({component:name}));
  }
  const seal=sealArtifacts(dir,{commit:sha,forgeVersion:"forge Version 1.8.3",sourceFingerprint:fingerprint});
  assert.equal(seal.schema,"xita-precompiled-v2");
  assert.equal(Object.keys(seal.artifacts).length,NAMES.length);
  const dest=join(dir,"runtime-state","xita-compiled-artifacts",fingerprint);
  assert.ok(existsSync(join(dest,"seal.json")));
  rmSync(join(dir,"out"),{recursive:true,force:true});
  assert.deepEqual(Object.keys(readSealedArtifacts(dir,later,{sourceFingerprint:fingerprint}).raws).sort(),[...NAMES].sort());
  const file=join(dest,NAMES[0]+".sol",NAMES[0]+".json");
  writeFileSync(file,'{"tampered":true}');
  assert.throws(()=>readSealedArtifacts(dir,sha,{sourceFingerprint:fingerprint}),/changed or is missing/);
  assert.throws(()=>readSealedArtifacts(dir,sha,{sourceFingerprint:"d".repeat(64)}),/ENOENT/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("source fingerprint detects Solidity and pinned dependency changes, ignores unrelated files",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-fingerprint-"));
 try{
  execFileSync("git",["init","-q"],{cwd:dir});
  mkdirSync(join(dir,"contracts"));mkdirSync(join(dir,"vendor"));
  const sol=join(dir,"contracts","Token.sol"),vendor=join(dir,"vendor","package.json");
  const initial="pragma solidity ^0.8.24; contract Token {}\n";
  writeFileSync(sol,initial);
  writeFileSync(join(dir,"foundry.toml"),'solc_version = "0.8.24"\n');
  writeFileSync(vendor,'{"dependencies":{"foo":"1.0.0"}}');
  execFileSync("git",["add","contracts","foundry.toml","vendor/package.json"],{cwd:dir});
  const expected=deploymentSourceFingerprint(dir);
  writeFileSync(join(dir,"README.md"),"Unrelated update");
  assert.equal(deploymentSourceFingerprint(dir),expected);
  writeFileSync(sol,"pragma solidity ^0.8.24; contract Token { uint x; }\n");
  assert.notEqual(deploymentSourceFingerprint(dir),expected);
  writeFileSync(sol,initial);
  writeFileSync(vendor,'{"dependencies":{"foo":"2.0.0"}}');
  assert.notEqual(deploymentSourceFingerprint(dir),expected);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("UI deployment uses wallet, not a separate Forge or gas button",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const js=readFileSync(new URL("./admin.js",import.meta.url),"utf8");
 assert.ok(!html.includes('id="modal-gas-check"'));
 assert.ok(js.includes('el("modal-deploy").disabled=false'));
 const trusted=readFileSync(new URL("./trusted-artifacts.mjs",import.meta.url),"utf8");
 assert.ok(!trusted.includes('exec(forge,["build"'));
});
