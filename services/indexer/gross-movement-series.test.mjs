import test from "node:test";
import assert from "node:assert/strict";
import {indexedGrossMovementEvents,combineGrossMovementEvents} from "./gross-movement-series.mjs";

const hex=c=>"0x"+c.repeat(64),address=c=>"0x"+c.repeat(40);
const now=Date.parse("2026-11-22T10:00:00Z"),day=86400000;
const first={source:"xgrchain",destination:"base",routeId:hex("a"),gateway:address("a")};
const reverse={source:"base",destination:"xgrchain",routeId:hex("b"),gateway:address("b")};
const descriptor={status:"ready",asset:"XGR",assetId:hex("c"),chain:"xgrchain",
 decimals:18,escrowRoutes:[first,reverse]};
const price={priceUsd:2};
const row=(route,id,extra={})=>({asset:"XGR",asset_id:descriptor.assetId,
 source_chain:route.source,destination_chain:route.destination,
 route_id:route.routeId,gateway:route.gateway,message_id:hex(id),
 source_block_hash:hex("f"),amount_raw:"1000000000000000000",
 delivered:true,source_block_at:null,source_indexed_at:new Date(now-day).toISOString(),
 escrow_outflow_observed_at:null,delivery_checked_at:new Date(now-day).toISOString(),...extra});
const make=rows=>indexedGrossMovementEvents({descriptor,rows,
 coverage:{complete:true},price,now});

test("finalized lock and delivered unlock yield independent rising 30-day gross chart",()=>{
 const rows=[
  row(first,"1",{source_block_at:new Date(now-6*3600000).toISOString()}),
  row(reverse,"2",{escrow_outflow_observed_at:new Date(now-2*3600000).toISOString()})];
 const result=make(rows);
 assert.equal(result.status,"verified");
 const history=combineGrossMovementEvents([result],{now});
 assert.equal(history.status,"verified");
 assert.equal(history.points.length,721);
 assert.equal(history.points[0].movedWindowUsd,0);
 assert.equal(history.points.at(-1).movedWindowUsd,4);
 assert.ok(history.points.some(p=>p.movedWindowUsd===2));
 assert.ok(history.points.every((p,i)=>!i||p.movedWindowUsd>=history.points[i-1].movedWindowUsd));
});
test("gross chart survives failed independent collateral reconstruction",()=>{
 const recent=make([row(first,"3",{source_block_at:new Date(now-3600000).toISOString()})]);
 const history=combineGrossMovementEvents([recent],{now});
 assert.equal(history.status,"verified");
 assert.equal(history.points.at(-1).movedWindowUsd,2);
});
test("missing recent canonical time labels chart partial, never fabricates event time",()=>{
 const result=make([row(first,"4",{source_indexed_at:new Date(now-60000).toISOString()})]);
 assert.equal(result.status,"partial");
 assert.equal(result.unknownTime,1);
 assert.equal(result.events.length,0);
 assert.equal(combineGrossMovementEvents([result],{now}).status,"partial");
});
test("old unknown timestamp safely excluded from 30 days",()=>{
 const result=make([row(first,"5",{source_indexed_at:new Date(now-40*day).toISOString()})]);
 assert.equal(result.status,"verified");
 assert.equal(result.events.length,0);
});
test("no missing canonical identity, duplicate message, or incomplete index coverage passes",()=>{
 const source=row(first,"6",{source_block_at:new Date(now-60000).toISOString()});
 assert.equal(make([source,source]).status,"unavailable");
 assert.equal(make([{...source,source_block_hash:null}]).status,"unavailable");
 assert.equal(indexedGrossMovementEvents({descriptor,rows:[source],coverage:{complete:false},price,now}).status,"unavailable");
});
