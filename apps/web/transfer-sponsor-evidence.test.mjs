import test from "node:test";
import assert from "node:assert/strict";
import {transferSponsorVisible,sponsorAllowsContinuation} from "./transfer-sponsor-evidence.js";
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
 assert.equal(sponsorAllowsContinuation({ok:true,status:"not-required"}),false);
 assert.equal(sponsorAllowsContinuation(null),false);
});
