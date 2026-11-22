import test from "node:test";
import assert from "node:assert/strict";
import {indexedTvlPosition,reconcileEscrow,priceEscrow,verifiedEvidence} from "./tvl-verifier.mjs";
import {indexedRoutes} from "./transfer-index.mjs";
import {tvlSnapshot} from "./tvl-worker.mjs";
import {projectMetrics} from "./server.mjs";
import {readFileSync} from "node:fs";
import {keccak256} from "../../apps/web/keccak.js";

const addr=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
const code="0x60006000";const codeHash=keccak256(Uint8Array.from([0x60,0,0x60,0]));
const route={asset:"XGR",assetId:hash("a"),source:"xgrchain",destination:"base",sourceRouter:addr("1"),
 routeId:hash("b"),gateway:addr("2")};
const reverse={...route,source:"base",destination:"xgrchain",routeId:hash("c"),gateway:addr("3")};
const d={status:"ready",asset:"XGR",assetId:hash("a"),chain:"xgrchain",
 chainConfig:{chainId:1643,confirmations:1},router:addr("1"),codeHash,kind:"native",
 token:null,decimals:18,routes:[route,reverse],escrowRoutes:[route,reverse]};
const now=Date.parse("2026-10-18T14:00:00Z");
const iRoutes=[{asset:"XGR",sourceChain:"xgrchain",destinationChain:"base",routeId:route.routeId,
  gateway:route.gateway,routeName:"xgr_to_base",deploymentBlock:10},
 {asset:"XGR",sourceChain:"base",destinationChain:"xgrchain",routeId:reverse.routeId,
  gateway:reverse.gateway,routeName:"base_to_xgr",deploymentBlock:10}];
const cursors=iRoutes.map(r=>({source_chain:r.sourceChain,route_id:r.routeId,gateway:r.gateway,
 deployment_block:10,scanned_to:200,finalized_head:200,updated_at:new Date(now).toISOString()}));
const g=(r,amount,delivered)=>({asset:"XGR",asset_id:hash("a"),
 source_chain:r.source,destination_chain:r.destination,route_id:r.routeId,gateway:r.gateway,
 delivered,operation_count:"1",bad_count:"0",amount_raw:String(amount),max_source_block:"12"});
const data=(groups,routerBalance,pendingBalance="0x0")=>({catalog:{},descriptor:d,
 indexedRoutes:iRoutes,cursors:structuredClone(cursors),groups,routerCode:code,routerBalance,
 pendingBalance,observedHead:"0xc9",now});
const result=x=>reconcileEscrow(x);
test("physical balance is counted once, NOT reduced a second time by unlocks",()=>{
 const net=result(data([g(route,100n,true),g(reverse,40n,true)],"0x3c"));
 assert.equal(net.status,"verified");assert.equal(net.netLockedRaw,"60");
});
test("pending reverse unlock retains real escrow backing",()=>{
 const net=result(data([g(route,100n,true),g(reverse,40n,false)],"0x64"));
 assert.equal(net.status,"verified");assert.equal(net.netLockedRaw,"100");
 assert.equal(net.pendingUnlockRaw,"40");
});
test("native pending beneficiary payout is excluded only once",()=>{
 const net=result(data([g(route,100n,true),g(reverse,40n,true)],"0x46","0xa"));
 assert.equal(net.status,"verified");assert.equal(net.netLockedRaw,"60");
});
test("indexed TVL counts each lock once and tracks wrapped balances on every chain",()=>{
 const onward={...reverse,destination:"bsc",routeId:hash("d")};
 const onwardIndexed={...iRoutes[1],routeId:onward.routeId,destinationChain:"bsc"};
 const input={catalog:{},descriptor:{...d,routes:[route,reverse,onward]},
  indexedRoutes:[...iRoutes,onwardIndexed],cursors:[...cursors,{...cursors[1],route_id:onward.routeId}],
  groups:[g(route,100,true),g(reverse,20,false),g(onward,30,true)],now};
 const pending=indexedTvlPosition(input);
 assert.equal(pending.netLockedRaw,"100");
 assert.deepEqual(pending.wrappedByChainRaw,{base:"50",bsc:"30"});
 const settled=indexedTvlPosition({...input,groups:[g(route,100,true),g(reverse,20,true),g(onward,30,true)]});
 assert.equal(settled.netLockedRaw,"80");
 assert.deepEqual(settled.wrappedByChainRaw,pending.wrappedByChainRaw);
 assert.equal(indexedTvlPosition({...input,cursors:cursors}).reason,"index-incomplete");
});
test("periodic TVL snapshots read only XGR RPC even with a foreign canonical vault",async()=>{
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const rows=indexedRoutes(catalog).map(r=>({source_chain:r.sourceChain,route_id:r.routeId,gateway:r.gateway,
  deployment_block:r.deploymentBlock,scanned_to:r.deploymentBlock,finalized_head:r.deploymentBlock,
  updated_at:new Date(now).toISOString()}));
 const rpcCalls=[];
 const snapshot=await tvlSnapshot({catalog,now,pool:{query:async q=>({rows:typeof q==="string"?
  [{cursors:rows,groups:[]}]:[]})},prices:async()=>({records:Object.fromEntries(["arbitrum","xgr"].map(id=>[
   id,{source:"coingecko",priceUsd:1,asOf:new Date(now).toISOString()}
  ]))}),read:async (chain,method)=>{
  rpcCalls.push([chain.chainId,method]);
  throw Error("RPC unavailable");
 }});
 assert.deepEqual(rpcCalls,[[1643,"eth_chainId"]]);
 assert.equal(snapshot.indexedTvl.positions.ARB.netLockedRaw,"0");
 assert.deepEqual(snapshot.indexedTvl.positions.ARB.wrappedByChainRaw,
  Object.fromEntries(Object.keys(catalog.chains).filter(key=>key!=="arbitrum")
   .map(key=>[key,"0"])));
 assert.equal(snapshot.custodyEvidence.statuses.ARB,"physical-vault-not-checked");
 assert.equal(snapshot.custodyEvidence.positions.ARB,undefined);
 assert.equal(projectMetrics(catalog,snapshot).indexedTvl.lockedUsd,0);
 delete snapshot.indexedTvl.positions.ARB;
 assert.equal(projectMetrics(catalog,snapshot).indexedTvl.lockedUsd,null);
});
test("unexpected transfer and incomplete finalized index fail closed",()=>{
 assert.equal(result(data([g(route,100n,true)],"0x65")).reason,"escrow-balance-mismatch");
 const x=data([g(route,100n,true)],"0x64");x.cursors[0].scanned_to=199;
 assert.equal(result(x).reason,"index-incomplete");
});
test("ERC20 requires matching underlying token identity and native reserve zero",()=>{
 const x=data([g(route,100n,true)],"0x64");
 x.descriptor={...d,kind:"erc20",token:addr("e"),decimals:6};
 x.tokenAddress=addr("e");x.tokenDecimals=6;x.tokenCode=code;
 assert.equal(result(x).status,"verified",JSON.stringify(result(x)));
 x.tokenAddress=addr("f");assert.equal(result(x).reason,"underlying-erc20-identity-mismatch");
});
test("price conversion scales native and ERC20 decimals and rejects stale prices",()=>{
 const record={priceUsd:2,asOf:new Date(now).toISOString(),source:"coingecko"};
 const native=priceEscrow({status:"verified",netLockedRaw:"1000000000000000000",decimals:18},record,{now});
 assert.equal(native.lockedUsd,2);
 const erc=priceEscrow({status:"verified",netLockedRaw:"1250000",decimals:6},record,{now});
 assert.equal(erc.lockedUsd,2.5);
 assert.equal(priceEscrow({status:"verified",netLockedRaw:"1",decimals:18},
  {...record,asOf:"2020-01-01T00:00:00Z"},{now}).status,"unavailable");
});
test("asset evidence remains per token and misses do not become zero",()=>{
 const catalog={assets:{XGR:{deployment:{present:true},metadata:{assetId:hash("a")}}}};
 const rows=verifiedEvidence(catalog,{XGR:{status:"unavailable",reason:"no-index"}},now);
 assert.equal(Object.hasOwn(rows.assets,"XGR"),false);
});

test("new blocks after complete index snapshot do not invalidate balanced custody",()=>{
 const x=data([g(route,100n,true)],"0x64");
 x.observedHead="0x10000";
 assert.equal(result(x).status,"verified",JSON.stringify(result(x)));
});
test("invalid finalized cursor and a live balance mismatch still fail closed",()=>{
 const x=data([g(route,100n,true)],"0x64");
 x.observedHead="0x10000";x.cursors[0].finalized_head=201;
 assert.equal(result(x).reason,"index-incomplete");
 const y=data([g(route,100n,true)],"0x65");
 y.observedHead="0x10000";
 assert.equal(result(y).reason,"escrow-balance-mismatch");
});
