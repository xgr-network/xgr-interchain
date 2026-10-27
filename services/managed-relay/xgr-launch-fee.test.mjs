import test from "node:test";
import assert from "node:assert/strict";
import {capXgrLaunchServiceFee,XGR_LAUNCH_CAP_XGR_WEI} from "./xgr-launch-fee.mjs";
const WEI=10n**18n;
test("source XGR cap is exactly 100 native XGR, never 1% of amount",()=>{
 const result=capXgrLaunchServiceFee({
  regularFeeWei:(484n*WEI).toString(),
  uiAvailabilityFeeWei:"1000000000000",sourceNativeUsd:0.0001,xgrUsd:0.0001
 });
 assert.equal(result.chargedFeeWei,(100n*WEI).toString());
 assert.equal(result.discountWei,(384n*WEI).toString());
 assert.equal(result.uiAvailabilityFeeWei,"1000000000000");
 assert.equal(result.sponsoredServiceFeeWei,(100n*WEI-1000000000000n).toString());
 assert.equal(XGR_LAUNCH_CAP_XGR_WEI,100n*WEI);
});
test("small normal fees stay unchanged; no fee floor is invented",()=>{
 const result=capXgrLaunchServiceFee({
  regularFeeWei:(10n*WEI).toString(),uiAvailabilityFeeWei:"1000000000000",
  sourceNativeUsd:"0.0001",xgrUsd:"0.0001"
 });
 assert.equal(result.chargedFeeWei,(10n*WEI).toString());
 assert.equal(result.applied,false);
});
test("Base and Arbitrum source fees are exactly capped by fresh XGR/ETH price",()=>{
 const input={regularFeeWei:"5000000000000000",uiAvailabilityFeeWei:"1000000000000",
  sourceNativeUsd:2500,xgrUsd:0.0001};
 const result=capXgrLaunchServiceFee(input);
 assert.equal(result.capWei,"4000000000000");
 assert.equal(result.chargedFeeWei,"4000000000000");
 assert.equal(result.sponsoredServiceFeeWei,"3000000000000");
 const low=capXgrLaunchServiceFee({...input,regularFeeWei:"1000000000000"});
 assert.equal(low.chargedFeeWei,"1000000000000");
});
test("sub-gwei cap cannot be rounded up above 100 XGR value",()=>{
 const result=capXgrLaunchServiceFee({
  regularFeeWei:"100000",uiAvailabilityFeeWei:"1",sourceNativeUsd:"100000000",
  xgrUsd:"0.00000001"
 });
 assert.ok(BigInt(result.chargedFeeWei)<=BigInt(result.capWei));
});
test("invalid or unavailable FX or nonsensical invoice fail closed",()=>{
 const base={regularFeeWei:"100000000000000000000",uiAvailabilityFeeWei:"1",
 sourceNativeUsd:"2500",xgrUsd:"0.0001"};
 for(const patch of [{xgrUsd:0},{sourceNativeUsd:0},{xgrUsd:"NaN"},
 {regularFeeWei:"0"},{uiAvailabilityFeeWei:"0"},
 {uiAvailabilityFeeWei:"100000000000000000001"}]){
  assert.throws(()=>capXgrLaunchServiceFee({...base,...patch}));
 }
});
