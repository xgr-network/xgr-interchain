import test from "node:test";
import assert from "node:assert/strict";
import {sponsorFundingCovered} from "./sponsor-funding.mjs";
test("live quote funding accounts for all grants on one chain",()=>{
 const cfg={balanceWei:4000000n,gasPriceWei:2n,minReserveWei:"500000",commitments:["1000000","1000000"]};
 assert.equal(sponsorFundingCovered(cfg),true);
 assert.equal(sponsorFundingCovered({...cfg,balanceWei:2400000n}),false);
 assert.equal(sponsorFundingCovered({...cfg,commitments:["0"]}),true);
});
test("live funding rejects missing fee estimate or malformed commitments",()=>{
 assert.throws(()=>sponsorFundingCovered({balanceWei:100n,gasPriceWei:0n,minReserveWei:"1",commitments:["1"]}),/Invalid/);
 assert.throws(()=>sponsorFundingCovered({balanceWei:100n,gasPriceWei:1n,minReserveWei:"1",commitments:["-1"]}),/Invalid/);
});
