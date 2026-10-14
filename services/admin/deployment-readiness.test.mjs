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

test("Base Registry is ready from verified public PoPs and finalized XGR Registry without hand-copied candidate/snapshot",async()=>{
 const {selector,keccak256}=await import("../../apps/web/keccak.mjs");
 const root=mkdtempSync(join(tmpdir(),"xita-live-base-bootstrap-"));
 const address=i=>"0x"+BigInt(i).toString(16).padStart(40,"0");
 const word=n=>BigInt(n).toString(16).padStart(64,"0");
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
 const registry=address(550),verifier=address(551);
 const source={xitaV315:{components:{validatorRegistry:record("xgrchain",registry)}}};
 const dest={xitaV315:{components:{blsVerifier:record("base",verifier)}}};
 const config={chain:"base",chainId:8453,destinationDomain:8453,
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
   originChainId:1643,validators}));
  writeFileSync(join(root,origin.observedInfrastructure),JSON.stringify(source));
  writeFileSync(join(root,chain.observedInfrastructure),JSON.stringify(dest));
  proofs.forEach((proof,i)=>writeFileSync(
   join(root,"public/base/validator-"+(i+1)+".txt"),JSON.stringify(proof)));
  const rpc=async(url,method,args)=>{
   if(method==="eth_getCode")return code;
   if(url==="https://xgr.test"){
    if(method==="eth_chainId")return "0x66b";
    if(method==="eth_blockNumber")return "0x80";
    if(method==="eth_getBlockByNumber")return {number:"0x7f",hash:"0x"+"b".repeat(64)};
    if(method==="eth_call"){
     const sig=args[0].data.slice(0,10);
     if(sig===selector("getValidator(address)")){
      const addr="0x"+args[0].data.slice(-40);
      const i=validators.findIndex(a=>a.toLowerCase()===addr.toLowerCase());
      if(i<0)throw Error("Unknown validator in fixture");
      const key=proofs[i].blsPublicKey.slice(2);
      return "0x"+word(1)+word(96)+word(1000)+word(48)+key+"0".repeat(32);
     }
     const responses={
      [selector("destinationDomain()")]:1643,
      [selector("originChainId()")]:1643,
      [selector("registryVersion()")]:3,
      [selector("setId()")]:1,
      [selector("quorumThreshold()")]:2
     };
     if(Object.hasOwn(responses,sig))return "0x"+word(responses[sig]);
    }
   }
   if(url==="https://base.test"&&method==="eth_chainId")return "0x2105";
   throw Error("Unexpected RPC request "+url+" "+method);
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
  assert.equal(result.snapshotSource,"confirmed-xgrchain-registry-v3");
  assert.equal(result.verifiedSnapshot.blockNumber,127);
  assert.equal(result.transactionSimulation,"requires-verified-artifact-and-gas-estimation");
  assert.ok(!result.missing.some(v=>v.includes("manual snapshot")));
 }finally{rmSync(root,{recursive:true,force:true})}
});
