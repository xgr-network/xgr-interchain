import test from "node:test";
import assert from "node:assert/strict";
import {selector} from "../../apps/web/keccak.mjs";
import {quoteBaseDeploymentExtras,BASE_GAS_PRICE_ORACLE,BASE_MAX_TX_GAS} from "./base-fee-quote.mjs";
const word=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
test("read-only Base quote includes calldata L1 fee plus operator fee",async()=>{
 const seen=[];
 const rpc=async(url,method,params)=>{
  assert.equal(url,"https://base.example/rpc");
  assert.equal(method,"eth_call");
  assert.equal(params[0].to,BASE_GAS_PRICE_ORACLE);
  assert.equal(params[1],"latest");
  seen.push(params[0].data);
  if(params[0].data.startsWith(selector("getL1FeeUpperBound(uint256)"))){
   assert.equal(BigInt("0x"+params[0].data.slice(10)),521n);
   return word(5000000000000n);
  }
  if(params[0].data.startsWith(selector("getOperatorFee(uint256)"))){
   assert.equal(BigInt("0x"+params[0].data.slice(10)),700000n);
   return word(200000000000n);
  }
  throw Error("Unknown selector");
 };
 const actual=await quoteBaseDeploymentExtras({rpc,url:"https://base.example/rpc",
  transactionData:"0x"+"ff".repeat(9),gasLimit:700000n});
 assert.deepEqual(actual,{l1DataFeeUpperBoundWei:"5000000000000",
  operatorFeeWei:"200000000000",unsignedTxSizeEstimateBytes:521});
 assert.equal(seen.length,2);
});
test("unavailable/malformed Oracle never signs an underquoted paid Base deployment",async()=>{
 const rpc=async()=> "0x";
 await assert.rejects(()=>quoteBaseDeploymentExtras({rpc,url:"https://base.example",
  transactionData:"0xff",gasLimit:600000n}),/GasPriceOracle/);
 await assert.rejects(()=>quoteBaseDeploymentExtras({rpc,url:"https://base.example",
  transactionData:"0xff",gasLimit:BASE_MAX_TX_GAS+1n}),/gas limit/);
 await assert.rejects(()=>quoteBaseDeploymentExtras({rpc,url:"http://base.example",
  transactionData:"0xff",gasLimit:600000n}),/Invalid/);
});
