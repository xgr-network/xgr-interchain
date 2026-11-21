import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {activeChainFolders} from "./manifest-layout.mjs";
import {loadCatalog,validateRepository} from "./validate-manifests.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");

test("development Solana is visible in its own plan, not EVM deploy inventory",()=>{
 const chains=activeChainFolders(root).map(x=>x.name);
 assert.ok(chains.includes("xgrchain"));
 assert.ok(chains.includes("base"));
 assert.equal(chains.includes("solana"),false);
 const catalog=loadCatalog(root);
 assert.equal(catalog.chains.solana,undefined);
 assert.deepEqual(validateRepository(root),[]);
});

test("unknown incomplete chain directories never bypass active catalog checks",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xita-chain-folders-"));
 try{
  mkdirSync(join(dir,"config/chains/base"),{recursive:true});
  writeFileSync(join(dir,"config/chains/base/chain.json"),"{}");
  mkdirSync(join(dir,"config/chains/solana"),{recursive:true});
  writeFileSync(join(dir,"config/chains/solana/integration.json"),"{}");
  assert.deepEqual(activeChainFolders(dir).map(x=>x.name),["base"]);
  mkdirSync(join(dir,"config/chains/unknown"));
  assert.throws(()=>activeChainFolders(dir),/Unconfigured chain directory/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
