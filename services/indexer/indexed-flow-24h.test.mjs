import test from "node:test";
import assert from "node:assert/strict";
import {indexedGrossFlow24h} from "./indexed-flow-24h.mjs";
const hash=x=>"0x"+x.repeat(64),addr=x=>"0x"+x.repeat(40);
const now=Date.parse("2026-10-22T09:00:00.000Z");
const forward={source:"xgrchain",destination:"base",routeId:hash("1"),gateway:addr("1")};
const reverse={source:"base",destination:"xgrchain",routeId:hash("2"),gateway:addr("2")};
const descriptor={status:"ready",asset:"XGR",assetId:hash("a"),chain:"xgrchain",
 decimals:18,escrowRoutes:[forward,reverse]};
const price={source:"coingecko",priceUsd:2,asOf:new Date(now).toISOString()};
const row=(route,messageId,extra={})=>({asset:"XGR",asset_id:hash("a"),
 source_chain:route.source,destination_chain:route.destination,
 route_id:route.routeId,gateway:route.gateway,source_block_hash:hash("d"),
 amount_raw:"1000000000000000000",message_id:hash(messageId),delivered:true,...extra});
const calculate=rows=>indexedGrossFlow24h({descriptor,rows,coverage:{complete:true},price,now});
test("one verified lock plus one observed unlock gives gross 4 USD, not net zero",()=>{
 const result=calculate([
  row(forward,"3",{source_block_at:new Date(now-5000).toISOString()}),
  row(reverse,"4",{escrow_outflow_observed_at:new Date(now-3000).toISOString()})
 ]);
 assert.equal(result.status,"verified");
 assert.equal(result.inflowRaw,"1000000000000000000");
 assert.equal(result.outflowRaw,"1000000000000000000");
 assert.equal(result.movedUsd,4);
});
test("pending unlock, unknown past timestamp and old locks do not inflate 24h",()=>{
 const rows=[
  row(reverse,"3",{delivered:false,escrow_outflow_observed_at:null}),
  row(forward,"4",{source_block_at:null}),
  row(forward,"5",{source_block_at:new Date(now-86500000).toISOString()})
 ];
 const result=calculate(rows);
 assert.equal(result.status,"verified");assert.equal(result.movedUsd,0);
});
test("duplicate messages, incomplete coverage and invalid provenance fail closed",()=>{
 const r=row(forward,"3",{source_block_at:new Date(now-1000).toISOString()});
 assert.equal(calculate([r,r]).status,"unavailable");
 assert.equal(indexedGrossFlow24h({descriptor,rows:[r],coverage:{complete:false},price,now}).status,"unavailable");
 assert.equal(calculate([{...r,gateway:addr("9")}]).status,"unavailable");
});
