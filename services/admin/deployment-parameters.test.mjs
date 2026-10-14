import test from "node:test";
import assert from "node:assert/strict";
import {deploymentParameters} from "./deployment-parameters.mjs";
test("Registry values are signed as exact component-scoped Wei, never main config",()=>{
 const v=deploymentParameters("validatorRegistry",{
  minimumWei:"750000000000000000",
  maxExecutorReimbursementWei:"500000000000000000",perValidatorWei:"900000000000000000"});
 assert.equal(v.minimumWei,"750000000000000000");
 assert.equal(v.perValidatorWei,"900000000000000000");
 assert.ok(!Object.hasOwn(v,"sourceFeeWei"));
});
test("Factory accepts source-native fee only; router metadata hint is internal",()=>{
 const v=deploymentParameters("factory",{sourceFeeWei:"100000000000"});
 assert.deepEqual(v,{sourceFeeWei:"100000000000"});
 assert.throws(()=>deploymentParameters("factory",{sourceFeeWei:"1",defaultDestinationGasLimit:500000}),/wrong component/);
 assert.deepEqual(deploymentParameters("ism",{}),{});
 assert.deepEqual(deploymentParameters("sourceRegistry",{}),{});
});
test("malformed fee, mismatched input and reserve relationships fail before signing",()=>{
 assert.throws(()=>deploymentParameters("factory",{sourceFeeWei:"0"}),/Positive/);
 assert.throws(()=>deploymentParameters("ism",{sourceFeeWei:"1"}),/wrong component/);
 assert.throws(()=>deploymentParameters("validatorRegistry",{
  minimumWei:"1",maxExecutorReimbursementWei:"2",perValidatorWei:"3"}),/Reserve/);
 assert.throws(()=>deploymentParameters("validatorRegistry",{
  minimumWei:"1",maxExecutorReimbursementWei:"1",perValidatorWei:"1",
  sourceFeeWei:"1"}),/wrong component/);
});

test("validator initial reserve must be explicit and at least minimum",()=>{
 assert.deepEqual(deploymentParameters("validatorRegistry",{
  minimumWei:"1000",maxExecutorReimbursementWei:"500",perValidatorWei:"2000"
 }),{minimumWei:"1000",maxExecutorReimbursementWei:"500",perValidatorWei:"2000"});
 assert.throws(()=>deploymentParameters("validatorRegistry",{
  minimumWei:"1000",maxExecutorReimbursementWei:"500"}),/perValidatorWei/);
 assert.throws(()=>deploymentParameters("validatorRegistry",{
  minimumWei:"1000",maxExecutorReimbursementWei:"500",perValidatorWei:"999"}),/Reserve/);
});
