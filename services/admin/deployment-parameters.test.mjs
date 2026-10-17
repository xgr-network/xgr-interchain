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

test("GmbH fee recipient, gas sponsor and quote signer share exactly ONE wallet",()=>{
 const service="0x"+"a".repeat(40),admin="0x"+"b".repeat(40);
 assert.deepEqual(deploymentParameters("executionGateway",{
  serviceWallet:service,recoveryAdmin:admin
 }),{serviceWallet:service,recoveryAdmin:admin});
 assert.throws(()=>deploymentParameters("executionGateway",{
  serviceWallet:service,recoveryAdmin:service
 }),/must be different/);
 assert.throws(()=>deploymentParameters("executionGateway",{
  relayerOwner:service,interchainFeeRecipient:admin
 }),/wrong component/);
 assert.throws(()=>deploymentParameters("executionGateway",{
  serviceWallet:service
 }),/required/);
});

test("one global GmbH operational wallet binds all service roles; recovery admin is separate",()=>{
 const serviceWallet="0x"+"a".repeat(40);
 const recoveryAdmin="0x"+"b".repeat(40);
 assert.deepEqual(deploymentParameters("executionGateway",{serviceWallet,recoveryAdmin}),
  {serviceWallet,recoveryAdmin});
 assert.throws(()=>deploymentParameters("executionGateway",
  {serviceWallet,recoveryAdmin:serviceWallet}),/must be different/);
 assert.throws(()=>deploymentParameters("executionGateway",
  {serviceWallet,recoveryAdmin:"0x"+"0".repeat(40)}),/Valid nonzero/);
 assert.throws(()=>deploymentParameters("executionGateway",
  {serviceWallet,recoveryAdmin,relayerOwner:serviceWallet}),/wrong component/);
});
