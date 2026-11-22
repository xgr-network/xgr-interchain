import test from "node:test";
import assert from "node:assert/strict";
import {indexedEscrowDeltas,combineEscrowHistory} from "./historical-escrow-series.mjs";

const h=n=>"0x"+String(n).repeat(64),addr=n=>"0x"+String(n).repeat(40);
const at=Date.parse("2026-11-22T10:00:00Z"),day=86400000;
const origin={source:"xgrchain",destination:"base",routeId:h("1"),gateway:addr("1")};
const back={source:"base",destination:"xgrchain",routeId:h("2"),gateway:addr("2")};
const descriptor={status:"ready",asset:"XGR",assetId:h("a"),chain:"xgrchain",
 decimals:18,escrowRoutes:[origin,back]};
const price={source:"coingecko",priceUsd:2,asOf:new Date(at).toISOString()};
const amount=n=>(BigInt(n)*1000000000000000000n).toString();
const row=(r,id,n,extra={})=>({asset:"XGR",asset_id:h("a"),source_chain:r.source,
 destination_chain:r.destination,route_id:r.routeId,gateway:r.gateway,
 message_id:h(id),source_block_hash:h("f"),amount_raw:amount(n),delivered:true,
 source_indexed_at:new Date(at-day).toISOString(),
 delivery_checked_at:new Date(at-day).toISOString(),...extra});
const x=(rows,net=6)=>indexedEscrowDeltas({descriptor,rows,
 coverage:{complete:true},position:{status:"verified",netLockedRaw:amount(net)},
 price,now:at});
test("reconstructs a full 30d window from finality-confirmed locks and releases",()=>{
 const rows=[row(origin,"3",2,{source_block_at:new Date(at-20*3600000).toISOString()}),
  row(back,"4",1,{escrow_outflow_observed_at:new Date(at-2*3600000).toISOString()})];
 const one=x(rows);assert.equal(one.status,"verified");assert.equal(one.openingRaw,amount(5));
 const series=combineEscrowHistory([one],{now:at});
 assert.equal(series.status,"verified");assert.equal(series.points.length,721);
 assert.equal(series.points[0].lockedUsd,10);
 assert.equal(series.points.at(-1).lockedUsd,12);
 assert.equal(series.points.at(-1).movedWindowUsd,6);
 assert.ok(series.points.some(p=>p.lockedUsd===14));
 assert.ok(series.points.every((p,i)=>!i||p.movedWindowUsd>=series.points[i-1].movedWindowUsd));
});
test("unknown recent historical timestamps are incomplete, never replaced by indexing time",()=>{
 const uncertain=row(origin,"3",1,{source_block_at:null,source_indexed_at:new Date(at-3600000).toISOString()});
 const result=x([uncertain],6);
 assert.equal(result.status,"partial");assert.equal(result.unknownTime,1);
 const chart=combineEscrowHistory([result],{now:at});
 assert.equal(chart.status,"partial");
 assert.equal(chart.points.at(-1).lockedUsd,12);
 assert.equal(chart.points.at(-1).movedWindowUsd,0);
});
test("unknown old timestamps may be excluded only if independently indexed before 30d",()=>{
 const old=row(origin,"3",1,{source_block_at:null,
  source_indexed_at:new Date(at-40*day).toISOString()});
 assert.equal(x([old]).status,"verified");
 assert.equal(x([old]).events.length,0);
});
test("fails closed on duplicate, incomplete route coverage and impossible historical balance",()=>{
 const event=row(origin,"3",2,{source_block_at:new Date(at-3600000).toISOString()});
 assert.equal(x([event,event]).status,"unavailable");
 const missing=indexedEscrowDeltas({descriptor,rows:[event],
  coverage:{complete:false},position:{status:"verified",netLockedRaw:amount(6)},price,now:at});
 assert.equal(missing.status,"unavailable");
 assert.equal(x([event],1).status,"unavailable");
 assert.equal(combineEscrowHistory([x([event],1)],{now:at}).status,"unavailable");
});
test("multiple assets aggregate without extra SQL or RPC and preserve monotonic gross movements",()=>{
 const a=x([row(origin,"3",2,{source_block_at:new Date(at-12*3600000).toISOString()})],6);
 const b={...x([],5),asset:"ARB",priceUsd:3};
 const out=combineEscrowHistory([a,b],{now:at});
 assert.equal(out.status,"verified");
 assert.equal(out.points[0].lockedUsd,23);
 assert.equal(out.points.at(-1).lockedUsd,27);
 assert.equal(out.points.at(-1).movedWindowUsd,4);
});
