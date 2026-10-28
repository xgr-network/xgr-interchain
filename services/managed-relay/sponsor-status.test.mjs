import test from "node:test";
import assert from "node:assert/strict";
import {publicSponsorshipView,enforceSignedQuoteRate} from "./server.mjs";
const message="base:0x"+"a".repeat(64);
test("sponsor status is not falsely green when no grant journal exists",()=>{
 assert.deepEqual(publicSponsorshipView([]),{ok:true,status:"unavailable"});
 assert.deepEqual(publicSponsorshipView([{grant_key:null,status:null,delivered:true}]),
  {ok:true,status:"not-required",grants:[],upfrontRequired:false});
});
test("only journalled stage-specific grants are reported",()=>{
 const r=publicSponsorshipView([{grant_key:message+":first-delivery",status:"confirmed"},
  {grant_key:message+":final-delivery",status:"submitted"}]);
 assert.equal(r.status,"tracked");assert.deepEqual(r.grants,[
  {stage:"first-delivery",status:"confirmed"},{stage:"final-delivery",status:"submitted"}]);
});

test("only a matching immutable wallet-aware quote may prove no sponsor needed",()=>{
 assert.deepEqual(publicSponsorshipView([{grant_key:null,wallet_aware:true,expected_grants:0}]),
  {ok:true,status:"not-required",grants:[],upfrontRequired:false,expectedGrants:0});
 assert.deepEqual(publicSponsorshipView([{grant_key:null,wallet_aware:false}]),
  {ok:true,status:"not-required",grants:[],upfrontRequired:false});
});

test("wallet-aware aggregate stays pending until ALL signed stages confirmed",()=>{
 const base={wallet_aware:true,expected_grants:2};
 const partial=publicSponsorshipView([
  {...base,grant_key:message+":first-delivery",status:"confirmed"},
  {...base,grant_key:message+":final-delivery",status:"reserved"}]);
 assert.equal(partial.status,"reserved");
 assert.equal(partial.upfrontRequired,true);
 assert.equal(partial.expectedGrants,2);
 const complete=publicSponsorshipView([
  {...base,grant_key:message+":first-delivery",status:"confirmed"},
  {...base,grant_key:message+":final-delivery",status:"confirmed"}]);
 assert.equal(complete.status,"confirmed");
 const absent=publicSponsorshipView([{...base,grant_key:null}]);
 assert.equal(absent.status,"pending");
 const review=publicSponsorshipView([{...base,grant_key:message+":first-delivery",
  status:"needs-review"}]);
 assert.equal(review.status,"needs-review");
});

test("All gas grants become usable when mined; safe finality remains separate",()=>{
 const base={wallet_aware:true,expected_grants:2};
 const result=publicSponsorshipView([
  {...base,grant_key:message+":first-delivery",status:"submitted",
   spendable_at:new Date().toISOString()},
  {...base,grant_key:message+":final-delivery",status:"confirmed"}
 ]);
 assert.equal(result.status,"spendable");
 assert.equal(result.upfrontRequired,true);
 assert.equal(result.grants[0].status,"spendable");
 const partial=publicSponsorshipView([
  {...base,grant_key:message+":first-delivery",status:"submitted",
   spendable_at:new Date().toISOString()},
  {...base,grant_key:message+":final-delivery",status:"submitted",
   spendable_at:null}
 ]);
 assert.equal(partial.status,"submitted");
});
test("quote signer bounds unauthenticated attempts before reserving capacity",()=>{
 const ip="203.0.113.88",payer="0x"+"f".repeat(40),now=1700000000000;
 enforceSignedQuoteRate(ip,payer,{now});
 enforceSignedQuoteRate(ip,payer,{now:now+100});
 assert.throws(()=>enforceSignedQuoteRate(ip,payer,{now:now+200}),/rate limit/);
 enforceSignedQuoteRate(ip,payer,{now:now+61000});
});

test("N-05 returns only chain-bound promised stage names",()=>{
 const s=publicSponsorshipView([{wallet_aware:true,expected_grants:2,promised_stages:["hub-onward","final-delivery"],grant_key:null}]);
 assert.equal(s.status,"pending");
 assert.deepEqual(s.promisedStages,["hub-onward","final-delivery"]);
});
