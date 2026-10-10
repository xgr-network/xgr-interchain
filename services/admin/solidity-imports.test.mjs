import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {verifySolidityImports} from "./solidity-imports.mjs";
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),"xita-imports-"));
 for(const x of ["contracts","vendor/node_modules/@hyperlane-xyz/core/contracts/token/libs"])
  mkdirSync(join(dir,x),{recursive:true});
 writeFileSync(join(dir,"foundry.toml"),'remappings = ["@hyperlane-xyz/core/=vendor/node_modules/@hyperlane-xyz/core/"]\n');
 writeFileSync(join(dir,"contracts","A.sol"),'import {A} from "@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol"; contract Test {}');
 return dir;
}
test("detect nested missing Solidity dependency under an installed package",()=>{
 const dir=fixture();
 try{
  const dep=join(dir,"vendor/node_modules/@hyperlane-xyz/core/contracts/token/libs/TokenRouter.sol");
  writeFileSync(dep,'import {B} from "./Nested.sol"; contract A {}');
  assert.throws(()=>verifySolidityImports(dir),/Nested\.sol/);
  writeFileSync(join(dir,"vendor/node_modules/@hyperlane-xyz/core/contracts/token/libs/Nested.sol"),"contract B {}");
  assert.equal(verifySolidityImports(dir).sourceFiles,1);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("report absent first-party dependency and refuse incomplete source tree",()=>{
 const dir=fixture();
 try{assert.throws(()=>verifySolidityImports(dir),/TokenRouter\.sol/)}
 finally{rmSync(dir,{recursive:true,force:true})}
});
test("unknown non-remapped imports fail closed",()=>{
 const dir=fixture();
 try{
  writeFileSync(join(dir,"contracts","A.sol"),'import "unmapped/Token.sol"; contract Test {}');
  assert.throws(()=>verifySolidityImports(dir),/unmapped\/Token\.sol/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
