import test from "node:test";
import assert from "node:assert/strict";
import {factoryRouteDraft,routeSalt,nextAssetRouteTasks} from "./route-factory-draft.mjs";
const addr=n=>"0x"+n.toString(16).padStart(40,"0");
const assetId="0x"+"a".repeat(64);
const hub={name:"xgrchain",chainId:1643,domainId:1643};
const base={name:"base",chainId:8453,domainId:8453};
const infra=chain=>({name:chain.name,chainId:chain.chainId,
 components:[{key:"factory",address:addr(3)},{key:"sourceRegistry",address:addr(4)}]});
const asset={asset:"XGR",assetId,canonicalChain:"xgrchain",canonicalToken:null};
const representation=(chain,kind,router)=>({chain,component:kind,router});
test("first Base route needs exactly one synthetic router, not two",()=>{
 const b=factoryRouteDraft({asset,source:base,destination:hub,
 sourceInfrastructure:infra(base),destinationInfrastructure:infra(hub),
 representation:representation("base","syntheticRouter",null),action:"deploy-router"});
 assert.equal(b.component,"syntheticRouter");
 assert.equal(b.transaction.to,addr(3));
 assert.ok(b.transaction.data.startsWith("0x"));
 assert.throws(()=>factoryRouteDraft({asset,source:base,destination:hub,
  sourceInfrastructure:infra(base),destinationInfrastructure:infra(hub),
  representation:representation("base","syntheticRouter",addr(7)),action:"deploy-router"}),/Existing router/);
});
test("XGRChain native router only on hub, Polygon works with same path",()=>{
 const a=factoryRouteDraft({asset,source:hub,destination:base,
  sourceInfrastructure:infra(hub),destinationInfrastructure:infra(base),
  representation:representation("xgrchain","nativeRouter",null),action:"deploy-router"});
 assert.equal(a.component,"nativeRouter");
 assert.equal(routeSalt(assetId,1643,"nativeRouter"),a.salt);
 const polygon={name:"polygon",chainId:137,domainId:137};
 const p=factoryRouteDraft({asset,source:polygon,destination:hub,
  sourceInfrastructure:infra(polygon),destinationInfrastructure:infra(hub),
  representation:representation("polygon","syntheticRouter",null),action:"deploy-router"});
 assert.equal(p.component,"syntheticRouter");
});
test("each direction gets its own route instance, same two router addresses reversed",()=>{
 const id="0x"+"b".repeat(64);
 const forward=factoryRouteDraft({asset,source:hub,destination:base,
  sourceInfrastructure:infra(hub),destinationInfrastructure:infra(base),
  route:{source:"xgrchain",destination:"base",name:"xgr_to_base",
    router:addr(11),remoteRouter:addr(12),destinationToken:addr(12),routeId:id},
  action:"prepare-route"});
 const reverse=factoryRouteDraft({asset,source:base,destination:hub,
  sourceInfrastructure:infra(base),destinationInfrastructure:infra(hub),
  route:{source:"base",destination:"xgrchain",name:"base_to_xgr",
    router:addr(12),remoteRouter:addr(11),destinationToken:addr(0),routeId:"0x"+"c".repeat(64)},
  action:"prepare-route"});
 assert.equal(forward.component,"gateway");
 assert.equal(reverse.component,"gateway");
 assert.notEqual(forward.transaction.data,reverse.transaction.data);
 assert.throws(()=>factoryRouteDraft({asset,source:base,destination:hub,
  sourceInfrastructure:infra(base),destinationInfrastructure:infra(hub),
  route:{source:"base",destination:"xgrchain",router:addr(12),
   remoteRouter:addr(11),routeId:id,gateway:addr(18)},action:"prepare-route"}),/unprepared/);
});
