import test from "node:test";
import assert from "node:assert/strict";
import {chainDraft} from "./chain-transaction-draft.mjs";
import {deploymentParameters} from "./deployment-parameters.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {approvedWorkInventory} from "./main-gate.mjs";
import {encodeAbi} from "./abi-encoder.mjs";

const root=new URL("../../",import.meta.url).pathname;
const a=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
const h=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
const chain={name:"xdc",chainId:50,domainId:50,blsVerifierFormat:"ecdsa"};
const deployed=([key,address])=>({key,address,status:"documented"});
function infra(parts=[]){return {name:"xdc",chainId:50,domainId:50,components:parts.map(deployed),hyperlane:{}}}
const artifact=(component,name)=>({component,creation:"0x"+"6000".repeat(80),name});
const genesis={setId:"7",commitment:h(111),validators:[{address:a(1)},{address:a(2)},{address:a(3)}]};

test("XDC mainnet is a separate receipt-free, wallet-deployable ECDSA component inventory",()=>{
 const inv=approvedWorkInventory(root);
 const xdc=inv.chains.find(x=>x.name==="xdc");
 assert.equal(xdc.chainId,50);
 const state=infrastructureInventory(root,[xdc])[0];
 assert.equal(state.status,"not-deployed");
 assert.deepEqual(state.components.slice(0,3).map(x=>x.key),
  ["ecdsaVerifier","validatorRegistry","ism"]);
 assert.deepEqual(state.components.map(x=>x.key).includes("blsVerifier"),false);
 assert.equal(state.components.find(x=>x.key==="executionGateway").optional,true);
});

test("ECDSA verifier is an ordinary wallet creation, NEVER an EIP-2537 verifier",()=>{
 const tx=chainDraft({root,chain,infrastructure:infra(),bootstrap:{chain:"xdc"},
  component:"ecdsaVerifier",artifact:artifact("ecdsaVerifier")});
 assert.equal(tx.operation,"create");
 assert.equal(tx.chainId,50);
 assert.equal(tx.transaction.to,null);
 assert.equal(tx.transaction.value,"0x0");
 const bsc={...chain,name:"bsc",chainId:56,domainId:56,blsVerifierFormat:"eip2537"};
 assert.throws(()=>chainDraft({root,chain:bsc,infrastructure:{...infra(),name:"bsc",chainId:56,domainId:56},
  bootstrap:{chain:"bsc"},component:"ecdsaVerifier"}),/only for ECDSA/);
});

test("XDC Registry constructor is derived from verified XGR epoch/root, without BLS reserves",()=>{
 const snapshot={chain:"xdc",xdcGenesis:genesis};
 const tx=chainDraft({root,chain,infrastructure:infra([["ecdsaVerifier",a(99)]]),
  bootstrap:snapshot,component:"validatorRegistry",
  artifact:artifact("xdcValidatorRegistry")});
 const tail=encodeAbi(["uint64","uint32","address","uint64","bytes32"],[1643,50,a(99),7,h(111)]);
 assert.equal(tx.contract,"XGRInterchainECDSAValidatorRegistry");
 assert.ok(tx.transaction.data.endsWith(tail.slice(2)));
 assert.equal(tx.transaction.value,"0x0");
 assert.deepEqual(deploymentParameters("validatorRegistry",{}, {scheme:"ecdsa"}),{});
 assert.throws(()=>deploymentParameters("validatorRegistry",{perValidatorWei:"1"},{scheme:"ecdsa"}),/no economic/);
 assert.throws(()=>chainDraft({root,chain,infrastructure:infra([["ecdsaVerifier",a(99)]]),
   bootstrap:{chain:"xdc",xdcGenesis:{...genesis,commitment:h(0)}},
   component:"validatorRegistry",artifact:artifact("xdcValidatorRegistry")}),/canonical XGR/);
});

test("XDC ISM binds only the receipt-verified destination ECDSA registry",()=>{
 const tx=chainDraft({root,chain,infrastructure:infra([["validatorRegistry",a(14)]]),
   bootstrap:{chain:"xdc"},component:"ism",artifact:artifact("xdcIsm")});
 assert.equal(tx.contract,"XITADirectECDSAISM");
 assert.equal(tx.transaction.value,"0x0");
 assert.ok(tx.transaction.data.endsWith(encodeAbi(["address"],[a(14)]).slice(2)));
 assert.throws(()=>chainDraft({root,chain,infrastructure:infra(),
   bootstrap:{chain:"xdc"},component:"ism",artifact:artifact("xdcIsm")}),/Verified dependency missing/);
});

test("no XDC deployment can request caller-supplied validator or chain constructor values",()=>{
 assert.throws(()=>deploymentParameters("validatorRegistry",{
  genesisXGRSetCommitment:h(999)},{scheme:"ecdsa"}),/no economic/);
 assert.throws(()=>deploymentParameters("validatorRegistry",{minimumWei:"1"},{scheme:"ecdsa"}),/no economic/);
 assert.throws(()=>chainDraft({root,chain:{...chain,chainId:51},
  infrastructure:infra([["ecdsaVerifier",a(99)]]),bootstrap:{chain:"xdc",xdcGenesis:genesis},
  component:"validatorRegistry",artifact:artifact("xdcValidatorRegistry")}),/identity mismatch/);
});
