import test from "node:test";
import assert from "node:assert/strict";
import {requiredSponsorChains,sponsorRouteReady} from "./sponsor-route-readiness.js";
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
