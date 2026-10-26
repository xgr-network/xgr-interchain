import test from "node:test";
import assert from "node:assert/strict";
import {sponsorFundingCovered,sponsorCapacityCovered} from "./sponsor-funding.mjs";
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

test("N-07 aggregate signed quotes cannot overcommit liquid sponsor wallet",()=>{
 const options={balanceWei:3000000n,gasPriceWei:2n,minReserveWei:"500000",
  currentOutstandingWei:"1000000",currentOutstandingCount:1,
  newCommitments:["500000"],spentTodayWei:"200000",
  dailyMaxWei:"4000000",gasUnitsPerGrant:21000n};
 assert.equal(sponsorCapacityCovered(options).funded,true);
 assert.equal(sponsorCapacityCovered({...options,balanceWei:1600000n}).funded,false);
 assert.equal(sponsorCapacityCovered({...options,dailyMaxWei:"1500000"}).withinDaily,false);
 assert.equal(sponsorCapacityCovered({...options,currentOutstandingWei:"0",
  currentOutstandingCount:0}).funded,true);
 assert.throws(()=>sponsorCapacityCovered({...options,newCommitments:["-1"]}),/Invalid/);
});
