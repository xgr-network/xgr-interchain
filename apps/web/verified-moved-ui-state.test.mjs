import test from "node:test";
import assert from "node:assert/strict";
import {retainVerifiedMovedHistory} from "./verified-moved-ui-state.js";

const at="2026-11-22T10:00:00Z", later="2026-11-22T10:01:00Z";
const historical={status:"verified",pricing:"current-reference-price",asOf:at,
 points:[{asOf:"2026-11-20T10:00:00Z",totalUsd:30000},
 {asOf:at,totalUsd:30378.46}]};
const old={status:"verified",asOf:at,totalUsd:30378.46,reconstructed:historical};
test("incomplete periodic refresh keeps last verified full curve",()=>{
 const fresh={status:"verified",asOf:later,totalUsd:30380,
  points:[{asOf:later,totalUsd:30380}]};
 const next=retainVerifiedMovedHistory(old,fresh);
 assert.strictEqual(next.reconstructed,historical);
 assert.equal(next.asOf,later);
 assert.equal(next.totalUsd,30380);
 assert.equal(next.points.length,1,"new lifetime total remains current");
});
test("new verified curve replaces older cached curve",()=>{
 const nextCurve={...historical,asOf:later,
  points:[historical.points[0],{asOf:later,totalUsd:30380}]};
 const next={status:"verified",asOf:later,totalUsd:30380,reconstructed:nextCurve};
 assert.strictEqual(retainVerifiedMovedHistory(old,next),next);
});
test("never resurrects stale, future, decreasing or invalid curves",()=>{
 const current={status:"verified",asOf:"2026-11-22T17:00:00Z",totalUsd:30380};
 assert.strictEqual(retainVerifiedMovedHistory(old,current),current);
 const decreasing={status:"verified",asOf:later,totalUsd:30300};
 assert.strictEqual(retainVerifiedMovedHistory(old,decreasing),decreasing);
 const noLongerCurrent={...old,reconstructed:{...historical,points:[
  historical.points[0],{asOf:at,totalUsd:29999}]}};
 assert.strictEqual(retainVerifiedMovedHistory(noLongerCurrent,
  {status:"verified",asOf:later,totalUsd:30380}).reconstructed,undefined);
});
