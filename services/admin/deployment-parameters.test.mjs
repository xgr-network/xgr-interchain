import test from "node:test";
import assert from "node:assert/strict";
import {deploymentParameters} from "./deployment-parameters.mjs";
test("Registry values are signed as exact component-scoped Wei, never main config",()=>{
 const v=deploymentParameters("validatorRegistry",{
  minimumWei:"750000000000000000",
  maxExecutorReimbursementWei:"500000000000000000"});
 assert.equal(v.minimumWei,"750000000000000000");
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
  minimumWei:"1",maxExecutorReimbursementWei:"2"}),/Reserve/);
 assert.throws(()=>deploymentParameters("validatorRegistry",{
  minimumWei:"1",maxExecutorReimbursementWei:"1",
  sourceFeeWei:"1"}),/wrong component/);
});
