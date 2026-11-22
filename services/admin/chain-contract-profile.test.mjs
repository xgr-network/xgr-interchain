import test from "node:test";
import assert from "node:assert/strict";
import {chainContractProfile,chainArtifactKey,assertChainArtifact} from "./chain-contract-profile.mjs";

const chain=(chainId,format,scheme)=>({
 chainId,domainId:chainId,blsVerifierFormat:format,...(scheme?{signatureScheme:scheme}:{})
});
test("deployed V3 BLS chains always retain their identical registry and ISM artifacts",()=>{
 for(const id of [1643,8453,42161,10,56]){
  const format=id===1643?"compressed":"eip2537",p=chainContractProfile(chain(id,format));
  assert.equal(p.scheme,"bls");assert.equal(p.registryVersion,3);
  assert.equal(p.registryContract,"XGRInterchainValidatorRegistryV3");
  assert.equal(p.ismContract,"XITADirectBLSISM");
  assert.equal(chainArtifactKey(chain(id,format),"validatorRegistry"),"validatorRegistry");
  assert.equal(chainArtifactKey(chain(id,format),"ism"),"ism");
 }
});
test("explicit ECDSA chain uses only its own V5 and ECDSA ISM",()=>{
 const xdc=chain(50,"ecdsa","ecdsa"),p=chainContractProfile(xdc);
 assert.equal(p.registryVersion,5);assert.equal(p.keyFormat,3);
 assert.equal(p.registryContract,"XGRInterchainECDSAValidatorRegistryV5");
 assert.equal(p.ismContract,"XITADirectECDSAISM");
 assert.equal(chainArtifactKey(xdc,"validatorRegistry"),"xdcValidatorRegistry");
 assert.equal(chainArtifactKey(xdc,"ism"),"xdcIsm");
 assert.equal(chainArtifactKey(xdc,"ecdsaVerifier"),"ecdsaVerifier");
 assert.throws(()=>chainArtifactKey(xdc,"blsVerifier"));
});
test("a scheme mismatch, implicit ECDSA or wrong artifact always fails closed",()=>{
 const xdc=chain(50,"ecdsa","ecdsa");
 for(const bad of [
  chain(50,"ecdsa"),chain(50,"ecdsa","bls"),
  chain(8453,"eip2537","ecdsa"),chain(8453,"compressed","ecdsa"),
  chain(8453,"unknown"),{...xdc,domainId:8453}
 ])assert.throws(()=>chainContractProfile(bad));
 assert.throws(()=>assertChainArtifact(xdc,"ism",{component:"ism"}));
 assert.throws(()=>assertChainArtifact(chain(8453,"eip2537"),"ism",{component:"xdcIsm"}));
 assert.throws(()=>assertChainArtifact(xdc,"validatorRegistry",{component:"validatorRegistry"}));
 assert.equal(assertChainArtifact(xdc,"ism",{component:"xdcIsm"}),"xdcIsm");
});
