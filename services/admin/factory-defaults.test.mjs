import test from "node:test";
import assert from "node:assert/strict";
import {factoryDeploymentDefaults} from "./factory-defaults.mjs";
test("prefills per-chain quote and gas",()=>{assert.deepEqual(factoryDeploymentDefaults({chainName:"base",proposal:{values:{sourceFeeWei:"25000",defaultDestinationGasLimit:500000}}}),{sourceFeeWei:"25000",defaultDestinationGasLimit:500000});});
test("xgr fallback never bleeds into another chain",()=>{assert.equal(factoryDeploymentDefaults({chainName:"xgrchain"}).sourceFeeWei,"100000000000");assert.equal(factoryDeploymentDefaults({chainName:"base"}).sourceFeeWei,"");});
