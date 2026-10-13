import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readDeploymentReadiness} from "./deployment-readiness.mjs";
test("readiness fails closed and never authorizes wallet execution when evidence is absent",async()=>{
 const root=mkdtempSync(join(tmpdir(),"xita-readiness-"));
 try{
  mkdirSync(join(root,"config/chains/example"),{recursive:true});
  mkdirSync(join(root,"config/validators"),{recursive:true});
  writeFileSync(join(root,"config/chains/example/bootstrap.json"),JSON.stringify({
   chain:"example",chainId:999,sourceFee:{targetWei:null},
   reserve:{minimumWei:null,maxExecutorReimbursementWei:null,perValidatorWei:null}
  }));
  writeFileSync(join(root,"config/validators/initial.json"),JSON.stringify({
   originChainId:1643,validators:["0x"+"1".repeat(40)]
  }));
  const chain={name:"example",chainId:999};
  const result=await readDeploymentReadiness({root,chain,
   inventory:{chains:[chain,{name:"xgrchain",chainId:1643}]},
   boot:{ready:false,missing:["proofs needed"]},baseDir:root,mainCurrent:true});
  assert.equal(result.deploymentExecutable,false);
  assert.equal(result.evidenceVerified,false);
  assert.equal(result.values.sourceFeeWei,null);
  assert.match(result.missing.join(" "),/proofs needed/);
  assert.match(result.missing.join(" "),/Source-Fee/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test("unapproved chain rejected before filesystem operations",async()=>{
 await assert.rejects(()=>readDeploymentReadiness({root:"/",chain:{name:"outsider",chainId:123},
  inventory:{chains:[]},boot:{ready:false},baseDir:"/tmp"}),/not in approved/);
});

test("Base verifier receipt must use real canonical path and bind exact contract address",async()=>{
 const {validVerifierDeploymentReceipt}=await import("./deployment-readiness.mjs");
 const address="0x"+"a".repeat(40);
 const record={address,runtimeCodeKeccak256:"0x"+"b".repeat(64),
  receiptPath:"deployments/receipts/base/"+"c".repeat(64)+"-"+"a".repeat(40)+".json"};
 assert.equal(validVerifierDeploymentReceipt("base",record),true);
 assert.equal(validVerifierDeploymentReceipt("xgrchain",record),false);
 assert.equal(validVerifierDeploymentReceipt("base",{...record,
  receiptPath:"deployments/mainnet/receipts/base/"+"c".repeat(64)+"-"+"a".repeat(40)+".json"}),false);
 assert.equal(validVerifierDeploymentReceipt("base",{...record,
  receiptPath:"deployments/receipts/base/"+"c".repeat(64)+"-"+"d".repeat(40)+".json"}),false);
 assert.equal(validVerifierDeploymentReceipt("base",{...record,receiptPath:"../receipts/base.json"}),false);
});
