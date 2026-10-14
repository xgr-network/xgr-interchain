import test from "node:test";
import assert from "node:assert/strict";
import {prepareBaseFromXgr} from "./base-bootstrap-from-xgr.mjs";
const addr=i=>"0x"+BigInt(i).toString(16).padStart(40,"0");
const xword=i=>BigInt(i).toString(16).padStart(96,"0");
const validators=[addr(1),addr(2),addr(3)];
const proofs=validators.map((validator,i)=>{
 const x=xword(i+1),y=xword(i+10);
 const compressed="0x80"+x.slice(2);
 const eip="0x"+"0".repeat(32)+x+"0".repeat(32)+y;
 return {validator,originChainId:1643,destinationDomain:8453,
  blsPublicKey:compressed,blsPublicKeyEIP2537:eip,
  possessionProof:"0x"+[3,4,5,6].map(n=>"0".repeat(32)+xword(n+i)).join(""),
  payload:"0x"+Buffer.from("XGR_INTERCHAIN_BOOTSTRAP_V1").toString("hex")+
   "000000000000066b"+"00002105"+validator.slice(2)+"0030"+
   compressed.slice(2)+"0080"+eip.slice(2)};
});
const input={
 xgrChain:{chainId:1643},baseChain:{name:"base",chainId:8453,domainId:8453,
  blsVerifierFormat:"eip2537",rpcUrls:["https://base.test"]},
 initial:{originChainId:1643,validators},
 bootstrap:{chain:"base",chainId:8453,destinationDomain:8453,
  membershipOriginChainId:1643,verifierFormat:"eip2537",verifierAddress:addr(55),
  validatorSnapshot:{blockNumber:null,validators:[]}},
 proofs,rpc:async()=>{throw Error("An origin RPC must never be called");},
 verifyProof:async p=>({validator:p.validator,verified:true})
};
test("invalid initial membership fails before any RPC",async()=>{
 await assert.rejects(()=>prepareBaseFromXgr({...input,
  initial:{originChainId:1643,validators:[]},proofs:[]}),/Invalid pinned/);
});
test("Base public Genesis PoPs validate with NO PoS snapshot or source registry",async()=>{
 const result=await prepareBaseFromXgr(input);
 assert.equal(result.report.verifiedValidatorCount,3);
 assert.deepEqual(result.candidate.validatorSnapshot.validators.map(v=>v.address),validators);
 assert.equal(result.candidate.validatorSnapshot.blockNumber,null);
 assert.equal(result.proofMode,"destination-verifier");
 assert.equal(result.destinationVerifierVerified,true);
 assert.equal(result.deploymentAuthorized,false);
 const invalid=proofs.map(p=>({...p}));
 invalid[1].destinationDomain=1643;
 await assert.rejects(()=>prepareBaseFromXgr({...input,proofs:invalid}),/identity or domain/);
});
