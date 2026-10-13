import test from "node:test";
import assert from "node:assert/strict";
import {factoryDeploymentDefaults} from "./factory-defaults.mjs";
test("XGRChain starts with 0.1 XGR irrespective of historical RPC quote",()=>{
 const p=factoryDeploymentDefaults({chainName:"xgrchain",
  readiness:{values:{sourceFeeWei:"100000000000"}},
  proposal:{values:{sourceFeeWei:"5",defaultDestinationGasLimit:700000}}});
 assert.equal(p.sourceFeeWei,"100000000000000000");
 assert.equal(p.defaultDestinationGasLimit,700000);
});
test("XGRChain prefill survives unavailable gas-price suggestions",()=>{
 assert.deepEqual(factoryDeploymentDefaults({chainName:"xgrchain"}),{
  sourceFeeWei:"100000000000000000",defaultDestinationGasLimit:500000
 });
});
test("Base, Polygon, others never inherit XGR native source fee",()=>{
 assert.equal(factoryDeploymentDefaults({chainName:"base"}).sourceFeeWei,"");
 assert.equal(factoryDeploymentDefaults({chainName:"base",proposal:{
  values:{sourceFeeWei:"25000"}}}).sourceFeeWei,"25000");
});
test("non-XGR explicit source fee and chain gas hint take precedence",()=>{
 const p=factoryDeploymentDefaults({chainName:"polygon",
  chain:{defaultDestinationGasLimit:800000},
  readiness:{values:{sourceFeeWei:"1000000000"}},
  proposal:{values:{sourceFeeWei:"25000",defaultDestinationGasLimit:650000}}});
 assert.deepEqual(p,{sourceFeeWei:"1000000000",defaultDestinationGasLimit:800000});
});
