import test from "node:test";
import assert from "node:assert/strict";
import {factoryDeploymentDefaults} from "./factory-defaults.mjs";
test("XGRChain starts at 0.1 XGR regardless of RPC fee quote",()=>{
 const p=factoryDeploymentDefaults({chainName:"xgrchain",
  readiness:{values:{sourceFeeWei:"100000000000"}},
  proposal:{values:{sourceFeeWei:"5",defaultDestinationGasLimit:700000}}});
 assert.deepEqual(p,{sourceFeeWei:"100000000000000000"});
});
test("0.1 XGR is prefilled even without a quote",()=>{
 assert.deepEqual(factoryDeploymentDefaults({chainName:"xgrchain"}),{sourceFeeWei:"100000000000000000"});
});
test("other chains do not inherit XGR fee or expose destination gas input",()=>{
 assert.deepEqual(factoryDeploymentDefaults({chainName:"base"}),{sourceFeeWei:""});
 assert.deepEqual(factoryDeploymentDefaults({chainName:"base",
  proposal:{values:{sourceFeeWei:"25000",defaultDestinationGasLimit:800000}}}),
  {sourceFeeWei:"25000"});
});
