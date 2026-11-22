import test from "node:test";
import assert from "node:assert/strict";
import {chainDraft} from "./chain-transaction-draft.mjs";
import {deploymentParameters} from "./deployment-parameters.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {approvedWorkInventory} from "./main-gate.mjs";
import {encodeAbi} from "./abi-encoder.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
const root=new URL("../../",import.meta.url).pathname;
const a=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
const chain={name:"xdc",chainId:50,domainId:50,blsVerifierFormat:"ecdsa",signatureScheme:"ecdsa"};
const infra=parts=>({name:"xdc",chainId:50,domainId:50,
 components:parts.map(([key,address])=>({key,address,status:"documented"})),hyperlane:{}});
const artifact=component=>({component,creation:"0x"+"6000".repeat(80)});
test("XDC V5 has approved Genesis values and awaits deployment evidence",()=>{
 const inv=approvedWorkInventory(root),xdc=inv.chains.find(x=>x.name==="xdc");
 assert.equal(xdc.chainId,50);
 const state=infrastructureInventory(root,[xdc])[0];
 assert.equal(state.status,"not-deployed");
 assert.equal(state.components.find(c=>c.key==="validatorRegistry").status,"not-deployed");
 const plan=bootstrapPlan(root,xdc);
 assert.equal(plan.ready,true);
 assert.equal(plan.initialValidators.length,3);
 assert.equal(plan.reserveWei,"2400000000000000000");
});
test("XDC V5 requires positive native reserve and executor cap",()=>{
 const p={minimumWei:"10000",maxExecutorReimbursementWei:"1000",perValidatorWei:"20000"};
 assert.deepEqual(deploymentParameters("validatorRegistry",p,{scheme:"ecdsa"}),p);
 assert.throws(()=>deploymentParameters("validatorRegistry",{}, {scheme:"ecdsa"}),/Positive/);
 assert.throws(()=>deploymentParameters("validatorRegistry",
  {...p,perValidatorWei:"1"},{scheme:"ecdsa"}),/Reserve/);
 assert.throws(()=>deploymentParameters("validatorRegistry",
  {...p,minimumWei:"1"},{scheme:"ecdsa"}),/Reserve/);
});
test("XDC V5 genesis is individually selected and funded, never auto-imported",()=>{
 const parameters={minimumWei:"10000",maxExecutorReimbursementWei:"1000",perValidatorWei:"20000"};
 const vs=[a(1),a(2),a(3)];
 const proofs=vs.map((address,i)=>({address,possessionProof:"0x"+"aa".repeat(64)+(i%2?"1c":"1b")}));
 const bootstrap={chain:"xdc",ready:true,initialValidators:vs,validatorSnapshot:{validators:proofs}};
 const d=chainDraft({root,chain,infrastructure:infra([["ecdsaVerifier",a(9)]]),
  bootstrap,component:"validatorRegistry",parameters,artifact:artifact("xdcValidatorRegistry")});
 assert.equal(d.contract,"XGRInterchainECDSAValidatorRegistryV5");
 assert.equal(d.transaction.value,"0x"+(60000).toString(16));
 const tail=encodeAbi(["uint64","uint32","address","uint256","uint256","address[]","bytes[]"],
  [1643,50,a(9),"10000","1000",vs,proofs.map(v=>v.possessionProof)]);
 assert.ok(d.transaction.data.endsWith(tail.slice(2)));
 assert.throws(()=>chainDraft({root,chain,infrastructure:infra([["ecdsaVerifier",a(9)]]),
  bootstrap:{...bootstrap,ready:false},component:"validatorRegistry",
  parameters,artifact:artifact("xdcValidatorRegistry")}),/Explicit/);
 assert.throws(()=>chainDraft({root,chain,infrastructure:infra([["ecdsaVerifier",a(9)]]),
  bootstrap:{...bootstrap,validatorSnapshot:{validators:proofs.slice(0,2)}},
  component:"validatorRegistry",parameters,artifact:artifact("xdcValidatorRegistry")}),/Explicit/);
});
test("XDC V5 uses the ECDSA ISM bound to a verified destination Registry",()=>{
 const d=chainDraft({root,chain,infrastructure:infra([["validatorRegistry",a(14)]]),
  bootstrap:{chain:"xdc"},component:"ism",artifact:artifact("xdcIsm")});
 assert.equal(d.contract,"XITADirectECDSAISM");
 assert.equal(d.transaction.value,"0x0");
 assert.ok(d.transaction.data.endsWith(encodeAbi(["address"],[a(14)]).slice(2)));
});
