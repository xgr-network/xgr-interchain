import test from "node:test";
import assert from "node:assert/strict";
import {approvedBootstrapDocuments} from "./bootstrap-approval.mjs";
const root=new URL("../../",import.meta.url).pathname;
const chain={name:"xgrchain",chainId:1643,domainId:1643,blsVerifierFormat:"compressed"};
const candidate={chain:"xgrchain",chainId:1643,destinationDomain:1643,
 validatorSnapshot:{blockNumber:11449000,validators:[
  {address:"0x"+"1".repeat(40)},{address:"0x"+"2".repeat(40)},{address:"0x"+"3".repeat(40)}
 ]}};
const values={minimumWei:"1000000000000",
 maxExecutorReimbursementWei:"100000000000",
 perValidatorWei:"2000000000000",
 sourceFeeWei:"100000000000",
 defaultDestinationGasLimit:250000};
test("bootstrap approval copies only validator evidence and operator-approved numeric values",()=>{
 const doc=approvedBootstrapDocuments({root,chain,candidate,values});
 assert.equal(doc.bootstrap.validatorSnapshot.blockNumber,11449000);
 assert.equal(doc.bootstrap.reserve.perValidatorWei,values.perValidatorWei);
 assert.equal(doc.bootstrap.sourceFee.targetWei,values.sourceFeeWei);
 assert.equal(doc.chain.defaultDestinationGasLimit,250000);
 assert.equal(doc.bootstrap.verifierAddress,"0x0000000000000000000000000000000000002040");
 assert.equal(Object.keys(doc.paths).length,2);
});
test("invalid economic relationships and floating gas limits refuse approval",()=>{
 assert.throws(()=>approvedBootstrapDocuments({root,chain,candidate,
  values:{...values,minimumWei:"100",maxExecutorReimbursementWei:"101"}}),/reserve/);
 assert.throws(()=>approvedBootstrapDocuments({root,chain,candidate,
  values:{...values,defaultDestinationGasLimit:5.3}}),/Invalid positive/);
 assert.throws(()=>approvedBootstrapDocuments({root,chain,candidate:
  {...candidate,chainId:9999},values}),/candidate identity/);
});
