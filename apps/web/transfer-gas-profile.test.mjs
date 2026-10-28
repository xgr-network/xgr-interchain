import test from "node:test";
import assert from "node:assert/strict";
import {transferGasProfile,quotedGasUnits,DEFAULT_GAS_UNITS} from "./transfer-gas-profile.js";
const H=x=>"0x"+x.repeat(64),A=x=>"0x"+x.repeat(40);
function setup(){
 const route={asset:"T",source:"arbitrum",destination:"xgrchain",
  sourceRouter:A("a"),destinationRouter:A("b")};
 const catalog={assets:{T:{deployment:{representations:[
  {chain:"arbitrum",component:"collateralRouter",address:A("a"),runtimeCodeKeccak256:H("1")},
  {chain:"xgrchain",component:"syntheticRouter",address:A("b"),runtimeCodeKeccak256:H("2")}
 ]}}},infrastructure:{xgrchain:{xitaV315:{components:{
  mailbox:{runtimeCodeKeccak256:H("3")},executionGateway:{runtimeCodeKeccak256:H("4")}
 }}}}};
 return {route,catalog};
}
test("contract-based profile distinguishes collateral mint from synthetic burn",()=>{
 const {route,catalog}=setup();
 const first=transferGasProfile(catalog,route,"first-delivery");
 assert.equal(first.operation,"mint");
 assert.equal(first.sourceRepresentation,"collateral");
 const reverse={...route,source:"xgrchain",destination:"arbitrum",
  sourceRouter:A("b"),destinationRouter:A("a")};
 catalog.infrastructure.arbitrum={xitaV315:{components:{
  mailbox:{runtimeCodeKeccak256:H("5")},executionGateway:{runtimeCodeKeccak256:H("6")}
 }}};
 const back=transferGasProfile(catalog,reverse,"first-delivery");
 assert.equal(back.operation,"unlock");
 const onward=transferGasProfile(catalog,reverse,"hub-onward");
 assert.equal(onward.operation,"burn");
 assert.notEqual(first.key,back.key);
});
test("safe initial estimate, sufficient profile, upgrade invalidation",()=>{
 assert.equal(quotedGasUnits(null),DEFAULT_GAS_UNITS);
 assert.equal(quotedGasUnits({sample_count:19,p95_gas_units:250000}),DEFAULT_GAS_UNITS);
 assert.equal(quotedGasUnits({sample_count:20,p95_gas_units:250000}),250000n);
 const {route,catalog}=setup();
 const a=transferGasProfile(catalog,route,"first-delivery");
 catalog.assets.T.deployment.representations[1].runtimeCodeKeccak256=H("f");
 const b=transferGasProfile(catalog,route,"first-delivery");
 assert.notEqual(a.key,b.key);
});
