import test from "node:test";
import assert from "node:assert/strict";
import {publicSponsorshipView} from "./server.mjs";
const message="base:0x"+"a".repeat(64);
test("sponsor status is not falsely green when no grant journal exists",()=>{
 assert.deepEqual(publicSponsorshipView([]),{ok:true,status:"unavailable"});
 assert.deepEqual(publicSponsorshipView([{grant_key:null,status:null,delivered:true}]),
  {ok:true,status:"pending",grants:[]});
});
test("only journalled stage-specific grants are reported",()=>{
 const r=publicSponsorshipView([{grant_key:message+":first-delivery",status:"confirmed"},
  {grant_key:message+":final-delivery",status:"submitted"}]);
 assert.equal(r.status,"tracked");assert.deepEqual(r.grants,[
  {stage:"first-delivery",status:"confirmed"},{stage:"final-delivery",status:"submitted"}]);
});

test("only a matching immutable wallet-aware quote may prove no sponsor needed",()=>{
 assert.deepEqual(publicSponsorshipView([{grant_key:null,wallet_aware:true}]),
  {ok:true,status:"not-required",grants:[]});
 assert.deepEqual(publicSponsorshipView([{grant_key:null,wallet_aware:false}]),
  {ok:true,status:"pending",grants:[]});
});
