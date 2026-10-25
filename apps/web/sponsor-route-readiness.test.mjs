import test from "node:test";
import assert from "node:assert/strict";
import {requiredSponsorChains,sponsorRouteReady,requiredCommittedSponsorChains} from "./sponsor-route-readiness.js";
test("broken Base cannot block Base-free XGR and Arbitrum transfers",()=>{
 const s={enabled:true,chains:{base:false,xgrchain:true,arbitrum:true}};
 assert.deepEqual(requiredSponsorChains("xgrchain","arbitrum"),["arbitrum"]);
 assert.deepEqual(requiredSponsorChains("arbitrum","xgrchain"),["xgrchain"]);
 assert.deepEqual(requiredSponsorChains("base","arbitrum"),["xgrchain","arbitrum"]);
 assert.equal(sponsorRouteReady(s,"xgrchain","arbitrum"),true);
 assert.equal(sponsorRouteReady(s,"arbitrum","xgrchain"),true);
 assert.equal(sponsorRouteReady(s,"base","arbitrum"),true);
 assert.equal(sponsorRouteReady(s,"arbitrum","base"),false);
 assert.equal(sponsorRouteReady(s,"xgrchain","base"),false);
});
test("fail closed when an actually required chain is unavailable",()=>{
 const s={enabled:true,chains:{base:true,xgrchain:false,arbitrum:true}};
 assert.equal(sponsorRouteReady(s,"base","arbitrum"),false);
 assert.equal(sponsorRouteReady({...s,enabled:false},"xgrchain","arbitrum"),false);
 assert.throws(()=>requiredSponsorChains("base","base"),/Invalid/);
});

test("quoted zero-grant chains cannot block a transfer from paying its own gas",()=>{
 assert.deepEqual(requiredCommittedSponsorChains([]),[]);
 assert.deepEqual(requiredCommittedSponsorChains([
  {chain:"xgrchain",stage:"first-delivery",amountWei:"0"},
  {chain:"base",stage:"final-delivery",amountWei:"0"}]),[]);
 assert.deepEqual(requiredCommittedSponsorChains([
  {chain:"xgrchain",stage:"first-delivery",amountWei:"13"},
  {chain:"xgrchain",stage:"hub-onward",amountWei:"9"},
  {chain:"base",stage:"final-delivery",amountWei:"0"}]),["xgrchain"]);
 assert.throws(()=>requiredCommittedSponsorChains([{chain:"base",amountWei:"-1"}]),/Invalid/);
});
