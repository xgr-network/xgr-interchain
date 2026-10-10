import test from "node:test";
import assert from "node:assert/strict";
import {suggestBootstrapValues} from "./bootstrap-suggestions.mjs";
const chain={name:"xgrchain",chainId:1643,domainId:1643};
const bootstrap={chain:"xgrchain",chainId:1643,reserve:{
 minimumWei:null,maxExecutorReimbursementWei:null,perValidatorWei:null
},proposedFeeWei:null};
test("missing bootstrap economics receive editable gas-price-based nonapproved estimates",()=>{
 const p=suggestBootstrapValues({chain,bootstrap,gasPriceWei:"1000000000000"});
 assert.deepEqual(p.values,{
  minimumWei:"750000000000000000",
  maxExecutorReimbursementWei:"500000000000000000",
  perValidatorWei:"1000000000000000000",
  sourceFeeWei:"100000000000000",
  defaultDestinationGasLimit:500000
 });
 assert.equal(p.totalInitialReserveWei,"3000000000000000000");
 assert.ok(Object.values(p.sources).every(v=>v==="unapproved-estimate"));
});
test("approved Base fee and explicitly configured fields override all estimates",()=>{
 const c={name:"base",chainId:8453,defaultDestinationGasLimit:350000};
 const b={chain:"base",chainId:8453,
  reserve:{minimumWei:"20000000",maxExecutorReimbursementWei:"10000000",
   perValidatorWei:"30000000"},proposedFeeWei:"100000000000"};
 const p=suggestBootstrapValues({chain:c,bootstrap:b,gasPriceWei:"5000000"});
 assert.deepEqual(p.values,{
  minimumWei:"20000000",maxExecutorReimbursementWei:"10000000",
  perValidatorWei:"30000000",sourceFeeWei:"100000000000",
  defaultDestinationGasLimit:350000
 });
 assert.ok(Object.values(p.sources).every(v=>v==="main"));
});
test("chain mismatch, zero and unreasonable gas price fail closed",()=>{
 assert.throws(()=>suggestBootstrapValues({chain,bootstrap,gasPriceWei:"0"}),/positive/);
 assert.throws(()=>suggestBootstrapValues({chain,bootstrap,gasPriceWei:"10000000000000000"}),/Unreasonable/);
 assert.throws(()=>suggestBootstrapValues({chain:{...chain,chainId:137},bootstrap,gasPriceWei:"100"}),/identity/);
});
