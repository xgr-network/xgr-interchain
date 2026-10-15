import test from "node:test";
import assert from "node:assert/strict";
import {nextPhase} from "./status-notifier.mjs";
const record={assetId:"0x"+"a".repeat(64),input:{symbol:"EXMP"},pr:{number:123,url:"https://github.com/xgr-network/xgr-interchain/pull/123"},phase:"under-review"};
const snap=(status,lockedUsd=0,deployment="deployed")=>({
 schemaVersion:1,kind:"xita-visibility-v1",assets:{EXMP:{assetId:record.assetId,status,lockedUsd,deployment}}
});
test("XITA notifications arise only from merged GitHub proposal and independently validated visibility",()=>{
 const review={state:"open",merged_at:null},approved={state:"closed",merged_at:"2026-10-15T12:00:00Z"};
 assert.equal(nextPhase(record,review,snap("public",500)),"under-review");
 assert.equal(nextPhase(record,{state:"closed",merged_at:null},snap("public",500)),"rejected");
 assert.equal(nextPhase(record,approved,null),"approved");
 assert.equal(nextPhase(record,approved,snap("unknown",null)),"deployed");
 assert.equal(nextPhase(record,approved,snap("accepted",150)),"first-lock");
 assert.equal(nextPhase(record,approved,snap("public",150)),"listed");
 assert.equal(nextPhase({...record,phase:"listed"},approved,snap("accepted",150)),"delisted");
 assert.equal(nextPhase({...record,phase:"listed"},approved,snap("unknown",null)),"listed");
 assert.equal(nextPhase({...record,phase:"listed"},approved,null),"listed");
 assert.equal(nextPhase({...record,phase:"listed"},approved,snap("accepted",0)),"delisted");
 const wrongAsset=snap("public",150);
 wrongAsset.assets.EXMP.assetId="0x"+"b".repeat(64);
 assert.equal(nextPhase(record,approved,wrongAsset),"approved");
});
