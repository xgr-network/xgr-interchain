import test from "node:test";
import assert from "node:assert/strict";
import {nextPhase} from "./status-notifier.mjs";
import {routeMilestones} from "./route-milestones.mjs";
const record={assetId:"0x"+"a".repeat(64),input:{symbol:"EXMP"},pr:{number:123,url:"https://github.com/xgr-network/xgr-interchain/pull/123"},phase:"under-review"};
const snap=(status,lockedUsd=0,deployment="deployed")=>({
 schemaVersion:1,kind:"xita-visibility-v1",assets:{EXMP:{assetId:record.assetId,status,lockedUsd,deployment}}
});
test("XITA notifications arise only from merged GitHub proposal and independently validated visibility",()=>{
 const review={state:"open",merged_at:null},approved={state:"closed",merged_at:"2026-10-15T12:00:00Z"};
 assert.equal(nextPhase(record,review,snap("public",500),{readyToTransfer:true}),"under-review");
 assert.equal(nextPhase(record,{state:"closed",merged_at:null},snap("public",500),{readyToTransfer:true}),"rejected");
 assert.equal(nextPhase(record,approved,null),"approved");
 assert.equal(nextPhase(record,approved,snap("public",150)),"approved","Not executable is not deployed");
 assert.equal(nextPhase(record,approved,snap("unknown",null),{readyToTransfer:true}),"deployed");
 assert.equal(nextPhase(record,approved,snap("accepted",150),{readyToTransfer:true}),"first-lock");
 assert.equal(nextPhase(record,approved,snap("public",150),{readyToTransfer:true}),"listed");
 assert.equal(nextPhase({...record,phase:"listed"},approved,snap("accepted",150),{readyToTransfer:true}),"delisted");
 assert.equal(nextPhase({...record,phase:"listed"},approved,snap("unknown",null),{readyToTransfer:true}),"listed");
 assert.equal(nextPhase({...record,phase:"listed"},approved,null),"listed");
 assert.equal(nextPhase({...record,phase:"listed"},approved,snap("accepted",0),{readyToTransfer:true}),"delisted");
 const wrongAsset=snap("public",150);
 wrongAsset.assets.EXMP.assetId="0x"+"b".repeat(64);
 assert.equal(nextPhase(record,approved,wrongAsset),"approved");
});

test("listed and delisted history is not mistaken for a fresh deployed milestone",()=>{
 const approved={state:"closed",merged_at:"2026-10-15T12:00:00Z"};
 const delisted={...record,phase:"delisted"};
 assert.equal(nextPhase(delisted,approved,snap("accepted",0),{readyToTransfer:true}),"delisted");
 assert.equal(nextPhase(delisted,approved,snap("accepted",100),{readyToTransfer:true}),"delisted");
 assert.equal(nextPhase({...record,phase:"first-lock"},approved,snap("accepted",0),{readyToTransfer:true}),"first-lock");
 assert.equal(nextPhase({...record,phase:"listed"},approved,snap("accepted",0),{readyToTransfer:true}),"delisted");
 assert.equal(nextPhase(delisted,approved,snap("public",100),{readyToTransfer:true}),"listed");
 assert.equal(nextPhase({...record,phase:"listed"},approved,snap("public",100),{readyToTransfer:true}),"listed");
});

test("deployed/first-lock mail requires an executable route gate",()=>{
 const pr={state:"closed",merged_at:"2026-10-15T12:00:00Z"};
 assert.equal(nextPhase(record,pr,snap("accepted",10)),"approved");
 assert.equal(nextPhase(record,pr,snap("accepted",10),{readyToTransfer:true}),"first-lock");
});

test("route milestones require both directions of the canonical home route and ALL planned directions for completion",()=>{
 const assetId="0x"+"a".repeat(64);
 const spokes=["arbitrum","base","polygon"];
 const routes=spokes.flatMap(chain=>[
  {name:chain+"_to_xgr",sourceChain:chain,destinationChain:"xgrchain"},
  {name:"xgr_to_"+chain,sourceChain:"xgrchain",destinationChain:chain}
 ]);
 const catalog={chains:Object.fromEntries(["xgrchain",...spokes].map(key=>[key,{name:key}])),
  assets:{ARB:{metadata:{assetId,canonical:{chain:"arbitrum"},representations:
   ["xgrchain",...spokes].map(chain=>({chain}))},deployment:{assetId},
   routes:{routingHub:"xgrchain",protocol:"XITA-v3.1.5",routes}}}};
 const ready=(subset)=>subset.map(row=>({asset:"ARB",assetId,source:row.sourceChain,destination:row.destinationChain}));
 const home=routes.filter(r=>r.sourceChain==="arbitrum"||r.destinationChain==="arbitrum");
 const base=routes.filter(r=>r.sourceChain==="base"||r.destinationChain==="base");
 const none=routeMilestones(catalog,"ARB",assetId,[]);
 assert.equal(none.firstRoute,null);
 assert.equal(none.allComplete,false);
 assert.equal(routeMilestones(catalog,"ARB",assetId,ready(home.slice(0,1))).firstRoute,null,"one-way never sends transfer mail");
 assert.equal(routeMilestones(catalog,"ARB",assetId,ready(base)).firstRoute,null,"another pair cannot replace canonical home");
 const initial=routeMilestones(catalog,"ARB",assetId,ready(home));
 assert.deepEqual(initial.firstRoute,{source:"arbitrum",destination:"xgrchain",network:"arbitrum"});
 assert.equal(initial.allComplete,false);
 const complete=routeMilestones(catalog,"ARB",assetId,ready(routes));
 assert.equal(complete.allComplete,true);
 assert.deepEqual(complete.completedNetworks,spokes);
 assert.deepEqual(complete.plannedNetworks,spokes);
 assert.equal(routeMilestones(catalog,"ARB",assetId,ready(routes.slice(0,-1))).allComplete,false);
 assert.equal(routeMilestones(catalog,"ARB","0x"+"b".repeat(64),ready(routes)).allComplete,false);
 assert.equal(routeMilestones(catalog,"ARB",assetId,ready(routes).map(x=>({...x,asset:"FAKE"}))).firstRoute,null);
 const missingReverse=structuredClone(catalog);
 missingReverse.assets.ARB.routes.routes.pop();
 assert.equal(routeMilestones(missingReverse,"ARB",assetId,ready(routes)).firstRoute,null);
 const duplicate=structuredClone(catalog);
 duplicate.assets.ARB.routes.routes.push(routes[0]);
 assert.equal(routeMilestones(duplicate,"ARB",assetId,ready(routes)).firstRoute,null);
});
