import test from "node:test";
import assert from "node:assert/strict";
import {attachXitaReferenceLag,summarizeILNValidatorStatus} from "./validator-indexer-health.mjs";
const now=Date.parse("2026-10-24T19:38:08.000Z");
test("persisted Base cursor with failed RPC has external reference lag but not validator head",()=>{
 const v=summarizeILNValidatorStatus({version:2,updatedUnix:now/1000,workerAlive:true,
  routes:[{route:"iln_8453_1643",source:"base",destination:"xgrchain",state:"unavailable",
   sourceHead:0,scanCursor:53000000,scanCursorKnown:true,sourceHeadKnown:false,blockLag:0}]},{now});
 const rows=attachXitaReferenceLag([v],{routes:[{source:"base",finalizedHead:53037030,
  updatedAt:new Date(now).toISOString(),state:"ok"}]},{now})[0].routes;
 assert.equal(rows[0].sourceHead,null);
 assert.equal(rows[0].blockLag,null);
 assert.equal(rows[0].scanCursor,53000000);
 assert.equal(rows[0].xitaReferenceLag,37030);
 assert.equal(rows[0].state,"unavailable");
});
test("missing cursor, stale XITA evidence and chain mismatch never fabricate lag",()=>{
 const validator={routes:[{source:"base",scanCursor:null,state:"unavailable"},
  {source:"arbitrum",scanCursor:500,state:"ok"}]};
 const indexed={routes:[{source:"base",finalizedHead:1000,updatedAt:new Date(now).toISOString(),state:"ok"},
  {source:"arbitrum",finalizedHead:2000,updatedAt:new Date(now-700000).toISOString(),state:"stalled"}]};
 const result=attachXitaReferenceLag([validator],indexed,{now});
 assert.equal(result[0].routes[0].xitaReferenceLag,null);
 assert.equal(result[0].routes[1].xitaReferenceLag,null);
});
