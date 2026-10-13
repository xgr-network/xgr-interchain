import test from "node:test";
import assert from "node:assert/strict";
import {artifactTemplate,verifyRuntimeTemplate} from "./trusted-artifacts.mjs";
const raw={
 abi:[{type:"constructor",inputs:[]}],
 bytecode:{object:"0x"+"60".repeat(100)},
 deployedBytecode:{object:"0x"+"60".repeat(90),immutableReferences:{"7":[{start:10,length:32}]}},
 metadata:JSON.stringify({compiler:{version:"0.8.24+commit.e11b9ed9"}})
};
const artifact=artifactTemplate(raw,{component:"blsVerifier",commit:"a".repeat(40),forgeVersion:"forge 1.4.0"});
test("immutable fields may differ but no other runtime byte may differ",()=>{
 const at=2+10*2,length=64;
 const onchain=raw.deployedBytecode.object.slice(0,at)+"ab".repeat(32)+raw.deployedBytecode.object.slice(at+length);
 assert.match(verifyRuntimeTemplate(artifact,onchain),/^0x[0-9a-f]{64}$/);
 const malicious=onchain.slice(0,4)+"ff"+onchain.slice(6);
 assert.throws(()=>verifyRuntimeTemplate(artifact,malicious),/outside compiler-declared/);
});
test("constructor bytecode, metadata, overlap and provenance are strictly checked",()=>{
 assert.throws(()=>artifactTemplate({...raw,bytecode:{object:"0x1234"}},{component:"blsVerifier",commit:"a".repeat(40),forgeVersion:"forge 1.4.0"}),/creation/);
 assert.throws(()=>artifactTemplate({...raw,deployedBytecode:{...raw.deployedBytecode,immutableReferences:{a:[{start:1,length:12}],b:[{start:5,length:12}]}}},{component:"blsVerifier",commit:"a".repeat(40),forgeVersion:"forge 1.4.0"}),/Overlapping/);
 assert.throws(()=>artifactTemplate(raw,{component:"blsVerifier",commit:"invalid",forgeVersion:"forge 1.4.0"}),/provenance/);
});

test("Factory trusted ABI is exactly the gas-free ten-argument constructor",()=>{
 const factoryTypes=["uint64","uint32","address","address","address","address",
  "uint256","address","address","address"];
 const shape=types=>({
  ...raw,abi:[{type:"constructor",inputs:types.map((type,i)=>({type,name:"p"+i}))}]
 });
 const ok=artifactTemplate(shape(factoryTypes),{
  component:"factory",commit:"a".repeat(40),forgeVersion:"forge 1.8.5"
 });
 assert.equal(ok.component,"factory");
 // Regression: the obsolete constructor exposed a second uint256 gas hint.
 assert.throws(()=>artifactTemplate(shape([
  ...factoryTypes.slice(0,7),"uint256",...factoryTypes.slice(7)
 ]),{component:"factory",commit:"a".repeat(40),forgeVersion:"forge 1.8.5"}),/Unexpected constructor ABI/);
});

test("Base BLS verifier accepts only a 32-byte Solidity 0.8.24 IPFS digest difference",()=>{
 const prefix="a2646970667358221220";
 const suffix="64736f6c63430008180033";
 const core="0x"+"60".repeat(180);
 const makeMeta=digest=>core+prefix+digest.repeat(32)+suffix;
 const build=makeMeta("11"),onchain=makeMeta("22");
 const code={...raw,deployedBytecode:{object:build,immutableReferences:{}}};
 const bls=artifactTemplate(code,{component:"blsVerifier",
  commit:"a".repeat(40),forgeVersion:"forge 1.8.5"});
 assert.match(verifyRuntimeTemplate(bls,onchain),/^0x[0-9a-f]{64}$/);
 // Executable tampering is never excused by an IPFS digest difference.
 assert.throws(()=>verifyRuntimeTemplate(bls,"0x61"+onchain.slice(4)),/differs/);
 // Compiler version and the CBOR structure MUST be unchanged.
 assert.throws(()=>verifyRuntimeTemplate(bls,onchain.slice(0,-8)+"08190033"),/differs/);
 assert.throws(()=>verifyRuntimeTemplate(bls,onchain.replace("a2646970667358221220","a2646970667358221221")),/differs/);
 // No metadata exception for RouterDeployer or any other XITA contract.
 const moduleArtifact=artifactTemplate(code,{component:"nativeRouterDeployer",
  commit:"a".repeat(40),forgeVersion:"forge 1.8.5"});
 assert.throws(()=>verifyRuntimeTemplate(moduleArtifact,onchain),/differs/);
});
