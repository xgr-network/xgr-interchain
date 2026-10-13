import test from "node:test";
import assert from "node:assert/strict";
import {planDestinationProcessGas} from "./gas-planner.mjs";
test("relayer sizes the full destination process with independent 30 pct gas buffer",()=>{
 const plan=planDestinationProcessGas(650000n,30000000n);
 assert.equal(plan.gasLimit,875000n);
 assert.equal(plan.marginGas,225000n);
});
test("destination BLS proof can require more than immutable 500000 gas hint",()=>{
 const plan=planDestinationProcessGas(850000n,30000000n);
 assert.equal(plan.gasLimit,1135000n);
 assert.ok(plan.gasLimit>500000n);
});
test("estimation rejects invalid gas or insufficient block headroom",()=>{
 for(const args of [[0n,30000000n],[850000n,900000n],[850000n,1000000n],[-1n,30000000n]])
  assert.throws(()=>planDestinationProcessGas(...args),/Invalid|exceeds/);
});
test("no fixed factory-level ceiling even for a complex destination adapter",()=>{
 assert.equal(planDestinationProcessGas(2200000n,30000000n).gasLimit,2890000n);
});
