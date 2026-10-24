import test from "node:test";
import assert from "node:assert/strict";
import {downstreamGasProjection,GAS_SAFETY_BPS,formatWeiFee} from "./fee-gas-projection.js";
const stages=[
 {chain:"xgrchain",kind:"first-delivery",gasUnits:"1200000",gasPriceWei:"1000000000000"},
 {chain:"xgrchain",kind:"onward-bridge-gas",gasUnits:"1200000",gasPriceWei:"1000000000000"},
 {chain:"xgrchain",kind:"onward-protocol-fee",gasUnits:"0",gasPriceWei:"0",protocolNativeFeeWei:"3000000000000000000"},
 {chain:"arbitrum",kind:"final-delivery",gasUnits:"1200000",gasPriceWei:"40000000"}
];
test("two-hop gas buffers each stage by 30 percent, never double counts onward protocol fee",()=>{
 const rows=downstreamGasProjection(stages,{enabled:true,chains:{xgrchain:true,arbitrum:true}});
 assert.equal(GAS_SAFETY_BPS,13000n);
 assert.deepEqual(rows.map(r=>r.chain),["xgrchain","arbitrum"]);
 assert.equal(rows[0].rawWei,2400000000000000000n);
 assert.equal(rows[0].gasWithBufferWei,3120000000000000000n);
 assert.equal(rows[1].rawWei,48000000000000n);
 assert.equal(rows[1].gasWithBufferWei,62400000000000n);
 assert.deepEqual(rows.map(r=>r.conditionalNetWei),[0n,0n]);
});
test("global off and unsupported destination show its full buffered gas and no credit",()=>{
 const rows=downstreamGasProjection(stages,{enabled:true,chains:{xgrchain:true,arbitrum:false}});
 assert.equal(rows[0].conditionalNetWei,0n);
 assert.equal(rows[1].conditionalNetWei,62400000000000n);
 assert.equal(rows[1].potentialSponsorWei,0n);
 const all=downstreamGasProjection(stages,{enabled:false,chains:{xgrchain:true,arbitrum:true}});
 assert.ok(all.every(r=>r.conditionalNetWei===r.gasWithBufferWei));
});
test("negative, excessive or unpriced gas stages fail visibly and native protocol principal is excluded",()=>{
 for(const cost of [{chain:"base",gasUnits:"-1",gasPriceWei:"100"},
  {chain:"base",gasUnits:"9000000",gasPriceWei:"100"},
  {chain:"base",gasUnits:"21000",gasPriceWei:"0"}]){
  assert.throws(()=>downstreamGasProjection([cost]),/Invalid downstream gas stage/);
 }
 assert.deepEqual(downstreamGasProjection([{chain:"xgrchain",gasUnits:"0",gasPriceWei:"0",protocolNativeFeeWei:"123"}]),[]);
});

test("native gas formatting handles sponsored zero and whole or tiny fractional amounts",()=>{
 assert.equal(formatWeiFee(0n),"0");
 assert.equal(formatWeiFee(10n**18n),"1");
 assert.equal(formatWeiFee(48000000000000n),"0.000048");
 assert.equal(formatWeiFee(1n),"< 0.000000001");
 assert.throws(()=>formatWeiFee(-1n),/Invalid native wei amount/);
});
