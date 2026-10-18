// Native XGR TVL: compare complete finalized Gateway history with a live,
// codehash-authenticated custody router balance. A partial transfer index,
// pending delivery or a foreign deposit ALWAYS yields unavailable, never zero.
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {routeIndexCoverage} from "./transfer-index-store.mjs";
import {keccak256} from "../../apps/web/keccak.js";
const UINT=/^(0|[1-9][0-9]*)$/;
const HASH=/^0x[0-9a-f]{64}$/i;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const norm=x=>String(x||"").toLowerCase();
const fail=reason=>({status:"unavailable",reason});
const amount=x=>{if(!UINT.test(String(x??"")))throw Error("invalid canonical amount");return BigInt(x);};
export function reconcileNativeEscrow({catalog,cursors,operations,routeList,routerAddress,routerCode,routerBalance,observedAt,now=Date.now()}){
 const all=deployedRoutes(catalog).filter(x=>x.asset==="XGR"&&(x.source==="xgrchain"||x.destination==="xgrchain"));
 if(!all.length||!all.some(x=>x.source==="xgrchain")||!all.some(x=>x.destination==="xgrchain"))return fail("no-complete-bidirectional-route");
 const native=catalog?.assets?.XGR?.deployment?.representations?.filter(r=>r.chain==="xgrchain"&&r.component==="nativeRouter");
 if(native?.length!==1||!ADDRESS.test(native[0].address)||!HASH.test(native[0].runtimeCodeKeccak256)||norm(native[0].address)!==norm(routerAddress))
  return fail("native-router-not-verified");
 if(!Array.isArray(cursors)||!Array.isArray(operations)||!Array.isArray(routeList))return fail("index-coverage-unavailable");
 if(routeList.length!==all.length||!routeList.every(r=>all.some(c=>c.source===r.sourceChain&&c.destination===r.destinationChain&&
   norm(c.routeId)===norm(r.routeId)&&norm(c.gateway)===norm(r.gateway))))return fail("unmatched-route-receipts");
 const coverage=routeIndexCoverage(catalog,cursors,{now,maxAgeMs:120000,routeList});
 if(!coverage.complete)return fail("index-incomplete");
 if(!Number.isFinite(Date.parse(observedAt))||Math.abs(now-Date.parse(observedAt))>120000)
  return fail("escrow-observation-stale");
 const routeMap=new Map(all.map(r=>[r.source+":"+norm(r.routeId),r]));
 const seen=new Set();let locks=0n,unlocks=0n,countLocked=0,countUnlocked=0;
 for(const row of operations){
  if(row.asset!=="XGR")continue;
  const route=routeMap.get(row.source_chain+":"+norm(row.route_id));
  if(!route||norm(row.gateway)!==norm(route.gateway)||!HASH.test(row.message_id||"")||
   !HASH.test(row.source_block_hash||"")||row.delivered!==true||
   !UINT.test(String(row.amount_raw??""))||BigInt(row.amount_raw)<=0n)
    return fail("unverified-or-pending-operation");
  const cursor=cursors.find(c=>c.source_chain===row.source_chain&&norm(c.route_id)===norm(row.route_id));
  if(!cursor||Number(cursor.scanned_to)<Number(row.source_block_number))return fail("operation-not-scanned");
  const message=row.source_chain+":"+norm(row.message_id);
  if(seen.has(message))return fail("duplicate-operation");
  seen.add(message);
  if(route.source==="xgrchain"){locks+=amount(row.amount_raw);countLocked++;}
  else if(route.destination==="xgrchain"){unlocks+=amount(row.amount_raw);countUnlocked++;}
  else return fail("unexpected-xgr-route");
 }
 if(unlocks>locks)return fail("escrow-underflow");
 const expected=locks-unlocks;
 if(!HEX.test(routerBalance||"")||!/^0x(?:[0-9a-f]{2})*$/i.test(routerCode||""))
  return fail("invalid-router-rpc");
 const bytepairs=routerCode.slice(2).match(/../g);
 if(!bytepairs?.length||norm(keccak256(Uint8Array.from(bytepairs.map(x=>parseInt(x,16)))))!==norm(native[0].runtimeCodeKeccak256))
  return fail("router-codehash-mismatch");
 if(BigInt(routerBalance)!==expected)return fail("escrow-balance-mismatch");
 return {status:"verified",assetId:catalog.assets.XGR.metadata.assetId,
  netLockedRaw:expected.toString(),escrowRouter:norm(routerAddress),
  lockedOperations:countLocked,unlockedOperations:countUnlocked,asOf:observedAt,
  codeHash:norm(native[0].runtimeCodeKeccak256)};
}
export function pricedNativeEscrow(proof,price){
 if(proof?.status!=="verified")return fail("custody-not-verified");
 if(typeof price?.priceUsd!=="number"||!Number.isFinite(price.priceUsd)||
   price.priceUsd<=0||!Number.isFinite(Date.parse(price.asOf)))return fail("price-unavailable");
 const p=price.priceUsd.toFixed(8);
 if(!/^[0-9]+\.[0-9]{8}$/.test(p))return fail("price-out-of-range");
 const atoms=BigInt(p.replace("."));
 if(atoms<=0n)return fail("price-too-small");
 const usd=(BigInt(proof.netLockedRaw)*atoms/10n**18n).toString().padStart(9,"0");
 return {status:"verified",assetId:proof.assetId,netLockedRaw:proof.netLockedRaw,
  lockedUsd:usd.slice(0,-8)+"."+usd.slice(-8),priceUsd:price.priceUsd,priceAsOf:price.asOf,
  asOf:proof.asOf,escrowRouter:proof.escrowRouter,codeHash:proof.codeHash};
}
