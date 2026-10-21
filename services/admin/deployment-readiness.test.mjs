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
   chain:"example",chainId:999,genesisValidatorManifest:"config/validators/initial.json",sourceFee:{targetWei:null},
   reserve:{minimumWei:null,maxExecutorReimbursementWei:null,perValidatorWei:null}
  }));
  writeFileSync(join(root,"config/validators/initial.json"),JSON.stringify({
   schemaVersion:1,kind:"xita-initial-validator-set",originChainId:1643,validators:["0x"+"1".repeat(40),"0x"+"2".repeat(40),"0x"+"3".repeat(40)]
  }));
  const chain={name:"example",chainId:999};
  const result=await readDeploymentReadiness({root,chain,
   inventory:{chains:[chain,{name:"xgrchain",chainId:1643}]},
   boot:{ready:false,missing:["proofs needed"]},baseDir:root,mainCurrent:true});
  assert.equal(result.deploymentExecutable,false);
  assert.equal(result.evidenceVerified,false);
  assert.equal(result.values.sourceFeeWei,null);
  assert.match(result.missing.join(" "),/Validator-Bootstrap/);
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

test("Base Registry is ready from pinned Genesis and target BLS PoPs with NO origin PoS lookup",async()=>{
 const {keccak256}=await import("../../apps/web/keccak.mjs");
 const root=mkdtempSync(join(tmpdir(),"xita-live-base-bootstrap-"));
 const address=i=>"0x"+BigInt(i).toString(16).padStart(40,"0");
 const validators=[address(101),address(102),address(103)];
 const code="0x6001",runtimeHash=keccak256(Uint8Array.from(Buffer.from("6001","hex")));
 const record=(chain,where)=>({address:where,runtimeCodeKeccak256:runtimeHash,
  receiptPath:"deployments/receipts/"+chain+"/"+"a".repeat(64)+"-"+where.slice(2)+".json"});
 const origin={name:"xgrchain",chainId:1643,domainId:1643,confirmations:1,
  blsVerifierFormat:"compressed",rpcUrls:["https://xgr.test"],
  observedInfrastructure:"deployments/chains/xgrchain.json"};
 const chain={name:"base",chainId:8453,domainId:8453,
  blsVerifierFormat:"eip2537",rpcUrls:["https://base.test"],
  observedInfrastructure:"deployments/chains/base.json"};
 const proofs=validators.map((validator,i)=>{
  const x=BigInt(i+1).toString(16).padStart(96,"0");
  const y=BigInt(i+10).toString(16).padStart(96,"0");
  const key="0x80"+x.slice(2);
  const full="0x"+"0".repeat(32)+x+"0".repeat(32)+y;
  return {validator,originChainId:1643,destinationDomain:8453,
   blsPublicKey:key,blsPublicKeyEIP2537:full,
   possessionProof:"0x"+"00".repeat(256),
   payload:"0x"+Buffer.from("XGR_INTERCHAIN_BOOTSTRAP_V1").toString("hex")+
    "000000000000066b"+"00002105"+validator.slice(2)+
    "0030"+key.slice(2)+"0080"+full.slice(2)};
 });
 const verifier=address(551);
 const dest={xitaV315:{components:{blsVerifier:record("base",verifier)}}};
 const config={chain:"base",chainId:8453,destinationDomain:8453,
  genesisValidatorManifest:"config/validators/initial.json",
  membershipOriginChainId:1643,verifierFormat:"eip2537",
  validatorSnapshot:{blockNumber:null,validators:[]},
  reserve:{minimumWei:"50000000000000",maxExecutorReimbursementWei:"30000000000000",
   perValidatorWei:"100000000000000"},
  sourceFee:{targetWei:"100000000000"},verifierAddress:null};
 try{
  for(const dir of ["config/chains/base","config/validators","deployments/chains","public/base"])
   mkdirSync(join(root,dir),{recursive:true});
  writeFileSync(join(root,"config/chains/base/bootstrap.json"),JSON.stringify(config));
  writeFileSync(join(root,"config/validators/initial.json"),JSON.stringify({
   schemaVersion:1,kind:"xita-initial-validator-set",originChainId:1643,validators}));
  writeFileSync(join(root,chain.observedInfrastructure),JSON.stringify(dest));
  proofs.forEach((proof,i)=>writeFileSync(
   join(root,"public/base/validator-"+(i+1)+".txt"),JSON.stringify(proof)));
  const calls=[];
  const rpc=async(url,method)=>{
   calls.push({url,method});
   if(url!=="https://base.test")throw Error("Unexpected origin PoS/Interchain RPC in Genesis deployment");
   if(method==="eth_getCode")return code;
   if(method==="eth_chainId")return "0x2105";
   throw Error("Unexpected RPC method "+method);
  };
  const result=await readDeploymentReadiness({
   root,chain,inventory:{chains:[origin,chain]},
   boot:{ready:false,missing:["manual snapshot missing"]},
   baseDir:join(root,"public"),mainCurrent:true,rpc,
   verifyProof:async proof=>({validator:proof.validator,verified:true})
  });
  assert.equal(result.evidenceVerified,true,JSON.stringify(result));
  assert.equal(result.verifiedValidatorCount,3);
  assert.equal(result.bootstrapReady,true);
  assert.equal(result.manifestMatchesEvidence,true);
  assert.equal(result.snapshotSource,"explicit-interchain-genesis");
  assert.equal(result.verifiedSnapshot.blockNumber,null);
  assert.equal(result.originSnapshotBlock,null);
  assert.deepEqual(calls.map(v=>v.method),["eth_getCode"]);
  assert.equal(result.transactionSimulation,"requires-verified-artifact-and-gas-estimation");
  assert.ok(!result.missing.some(v=>v.includes("manual snapshot")));
 }finally{rmSync(root,{recursive:true,force:true})}
});
