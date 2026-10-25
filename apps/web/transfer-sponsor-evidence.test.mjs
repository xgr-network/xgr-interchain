import test from "node:test";
import assert from "node:assert/strict";
import {transferSponsorVisible,sponsorAllowsContinuation,verifiedZeroGrantSource} from "./transfer-sponsor-evidence.js";
test("paid adapter without committed gas grants must not display sponsorship",()=>{
 const key="arbitrum:message:wallet";
 for(const status of ["not-required","pending","unavailable"])
  assert.equal(transferSponsorVisible({key,status,upfrontRequired:false},key),false);
 assert.equal(transferSponsorVisible({key,status:"pending",upfrontRequired:true},key),true);
 assert.equal(transferSponsorVisible({key:"other",status:"pending",upfrontRequired:true},key),false);
});
test("no grants permits continuation; promised stages remain fail-closed",()=>{
 assert.equal(sponsorAllowsContinuation({ok:true,upfrontRequired:false,status:"not-required"}),true);
 for(const status of ["pending","disabled","unavailable","needs-review","submitted"])
  assert.equal(sponsorAllowsContinuation({ok:true,upfrontRequired:true,status}),false);
 assert.equal(sponsorAllowsContinuation({ok:true,upfrontRequired:true,status:"confirmed"}),true);
 assert.equal(sponsorAllowsContinuation({ok:true,upfrontRequired:false,status:"pending"}),false);
 assert.equal(sponsorAllowsContinuation({ok:true,status:"not-required"}),false);
 assert.equal(sponsorAllowsContinuation(null),false);
});

test("TX2 only accepts immutable exactly matched zero-grants quote",()=>{
 const account="0x"+"1".repeat(40), txHash="0x"+"a".repeat(64);
 const messageId="0x"+"b".repeat(64),executionAdapter="0x"+"2".repeat(40);
 const expected={account,sourceChain:"base",txHash,messageId,
  executionAdapter,interchainFeeWei:"1000000000000"};
 const row={...expected,confirmed:true,sponsorCommitmentEvidence:"no-grants"};
 assert.equal(verifiedZeroGrantSource(row,expected),true);
 for(const evidence of [null,"committed-grants","unverified"])
  assert.equal(verifiedZeroGrantSource({...row,sponsorCommitmentEvidence:evidence},expected),false);
 for(const alter of [
  {account:"0x"+"3".repeat(40)},{sourceChain:"arbitrum"},
  {txHash:"0x"+"c".repeat(64)},{messageId:"0x"+"d".repeat(64)},
  {executionAdapter:"0x"+"4".repeat(40)},{interchainFeeWei:"999"},
  {confirmed:false}
 ])assert.equal(verifiedZeroGrantSource({...row,...alter},expected),false);
});
