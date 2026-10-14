import test from "node:test";
import assert from "node:assert/strict";
import {prepareBootstrapEvidence} from "./bootstrap-evidence.mjs";
const addr=i=>"0x"+BigInt(i).toString(16).padStart(40,"0");
const word96=i=>BigInt(i).toString(16).padStart(96,"0");
const chain={name:"demo",chainId:999,domainId:999,
 blsVerifierFormat:"eip2537",rpcUrls:["https://demo.example"]};
const initial={originChainId:1643,validators:[addr(1),addr(2),addr(3)]};
const bootstrap={chain:"demo",chainId:999,destinationDomain:999,
 membershipOriginChainId:1643,verifierFormat:"eip2537",verifierAddress:addr(32),
 validatorSnapshot:{blockNumber:null,validators:[]}};
const proof=(validator,i)=>{
 const x=word96(i+1),y=word96(i+9);
 const publicEip="0x"+"0".repeat(32)+x+"0".repeat(32)+y;
 const compressed="0x80"+x.slice(2);
 const sig="0x"+[3,4,5,6].map(n=>"0".repeat(32)+word96(n+i)).join("");
 const payload="0x"+Buffer.from("XGR_INTERCHAIN_BOOTSTRAP_V1").toString("hex")+
  BigInt(1643).toString(16).padStart(16,"0")+
  BigInt(999).toString(16).padStart(8,"0")+validator.slice(2)+
  "0030"+compressed.slice(2)+"0080"+publicEip.slice(2);
 return {validator,originChainId:1643,destinationDomain:999,
  blsPublicKey:compressed,blsPublicKeyEIP2537:publicEip,
  possessionProof:sig,payload};
};
const proofs=initial.validators.map(proof);
const verifyProof=async p=>({verified:true,validator:p.validator});
const input={chain,bootstrap,initial,proofs,verifyProof,
 rpc:async()=>{throw Error("Origin RPC must never be queried for Genesis");}};
test("manual Genesis proofs become verified constructor records without any origin snapshot",async()=>{
 const config=structuredClone(bootstrap);
 const {candidate,report}=await prepareBootstrapEvidence({...input,proofs:proofs.toReversed()});
 assert.equal(report.verifiedValidatorCount,3);
 assert.equal(report.verification,"destination-verifier-verified-genesis");
 assert.equal(report.snapshotBlock,null);
 assert.equal(candidate.validatorSnapshot.blockNumber,null);
 assert.deepEqual(candidate.validatorSnapshot.validators.map(v=>v.address),initial.validators);
 assert.equal(candidate.validatorSnapshot.validators[0].possessionProof,proofs[0].possessionProof);
 assert.deepEqual(bootstrap,config);
});
test("invalid domain-bound payloads and BLS public keys are rejected",async()=>{
 const wrongDomain=proofs.map(p=>({...p}));
 wrongDomain[1].destinationDomain=137;
 await assert.rejects(()=>prepareBootstrapEvidence({...input,proofs:wrongDomain}),/identity or domain/);
 const wrongKey=proofs.map(p=>({...p}));
 wrongKey[0].blsPublicKey=proofs[1].blsPublicKey;
 await assert.rejects(()=>prepareBootstrapEvidence({...input,proofs:wrongKey}),/BLS keys differ/);
 const wrongPayload=proofs.map(p=>({...p}));
 wrongPayload[2].payload="0x1234";
 await assert.rejects(()=>prepareBootstrapEvidence({...input,proofs:wrongPayload}),/payload mismatch/);
});
test("missing, duplicated, or target-verifier-rejected public proofs are rejected",async()=>{
 await assert.rejects(()=>prepareBootstrapEvidence({...input,proofs:proofs.slice(0,2)}),/proofs/);
 await assert.rejects(()=>prepareBootstrapEvidence({...input,proofs:[proofs[0],proofs[0],proofs[2]]}),/Duplicate/);
 await assert.rejects(()=>prepareBootstrapEvidence({...input,verifyProof:async p=>({
  verified:p.validator!==initial.validators[1],validator:p.validator
 })}),/BLS proof rejected by destination verifier/);
});
