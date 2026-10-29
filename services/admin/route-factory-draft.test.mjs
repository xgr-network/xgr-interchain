import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {factoryRouteDraft,routeSalt,nextAssetRouteTasks,chainReadyForAssetRoutes} from "./route-factory-draft.mjs";
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
  action:"register-route"});
 const reverse=factoryRouteDraft({asset,source:base,destination:hub,
  sourceInfrastructure:infra(base),destinationInfrastructure:infra(hub),
  route:{source:"base",destination:"xgrchain",name:"base_to_xgr",
    router:addr(12),remoteRouter:addr(11),destinationToken:addr(0),routeId:"0x"+"c".repeat(64)},
  action:"register-route"});
 assert.equal(forward.component,"gateway");
 assert.equal(reverse.component,"gateway");
 assert.notEqual(forward.transaction.data,reverse.transaction.data);
 assert.throws(()=>factoryRouteDraft({asset,source:base,destination:hub,
  sourceInfrastructure:infra(base),destinationInfrastructure:infra(hub),
  route:{source:"base",destination:"xgrchain",router:addr(12),
   remoteRouter:addr(11),routeId:id,gateway:addr(18)},action:"register-route"}),/unregistered/);
});

test("generic ERC20 synthetic includes origin, metadata and salt",()=>{
 const token=addr(70);
 const erc={asset:"ALT",assetId,canonicalChain:"xgrchain",canonicalToken:token,
  metadata:{name:"Alt Token",symbol:"ALT",decimals:18}};
 const draft=factoryRouteDraft({asset:erc,source:base,destination:hub,
  sourceInfrastructure:infra(base),destinationInfrastructure:infra(hub),
  representation:representation("base","syntheticRouter",null),action:"deploy-router"});
 assert.equal(draft.component,"syntheticRouter");
 assert.ok(draft.transaction.data.length>400);
});

test("synthetic second hop resolves canonical origin outside source and destination",()=>{
 const asset={asset:"AUD",assetId:"0x"+"a".repeat(64),canonicalChain:"xdc",
  canonicalToken:"0x"+"1".repeat(40),metadata:{decimals:18,name:"Audit",symbol:"AUD"}};
 const source={name:"base",chainId:8453,domainId:8453};
 const dest={name:"xgrchain",chainId:1643,domainId:1643};
 const chain={name:"xdc",chainId:50,domainId:50};
 const infrastructure={components:[{key:"factory",address:"0x"+"2".repeat(40)},
  {key:"sourceRegistry",address:"0x"+"3".repeat(40)}]};
 const draft=factoryRouteDraft({asset,source,destination:dest,
  sourceInfrastructure:infrastructure,destinationInfrastructure:infrastructure,
  representation:{chain:"base",component:"syntheticRouter",router:null},
  action:"deploy-router",chains:[chain,source,dest]});
 assert.ok(draft.transaction.data.startsWith("0x"));
 assert.equal(draft.chain,"base");
});

test("only complete GitHub-documented chain pairs offer routers and gateways",()=>{
 const polygon={name:"polygon",chainId:137,domainId:137};
 const build=(c,deployed)=>({name:c.name,chainId:c.chainId,status:deployed?"documented":"partial",
  components:["validatorRegistry","ism","factory","sourceRegistry"].map(key=>({key,address:deployed?addr(5):null,status:deployed?"documented":"not-deployed"}))});
 const full=[build(hub,true),build(base,true),build(polygon,false)];
 const routes=[
  ["xgr_to_base","xgrchain","base"],["base_to_xgr","base","xgrchain"],
  ["xgr_to_polygon","xgrchain","polygon"],["polygon_to_xgr","polygon","xgrchain"]
 ].map(([name,source,destination])=>({name,source,destination,receipts:[],
  components:{gateways:[]},routeIds:[]}));
 const reps=Object.fromEntries([["xgrchain","native"],["base","synthetic"],["polygon","synthetic"]].map(([chain,role])=>
  [chain,{chain,role,deployedContracts:[]}]));
 const inv={chains:[hub,base,polygon],assets:{XGR:{key:"XGR",assetId,
   canonicalChain:"xgrchain",canonicalToken:null,representations:reps,routes}}};
 assert.equal(chainReadyForAssetRoutes(full[0]),true);
 assert.equal(chainReadyForAssetRoutes(full[2]),false);
 let plan=nextAssetRouteTasks(inv,full);
 assert.deepEqual(plan.eligibleRoutes.map(r=>r.name).sort(),["base_to_xgr","xgr_to_base"]);
 assert.deepEqual(plan.tasks.filter(t=>t.kind==="router").map(t=>t.chain).sort(),["base","xgrchain"]);
 assert.equal(plan.tasks.some(t=>t.chain==="polygon"||t.id.includes("polygon")),false);
 plan=nextAssetRouteTasks(inv,[full[0],full[1],build(polygon,true)]);
 assert.equal(plan.eligibleRoutes.length,4);
 assert.equal(plan.tasks.some(t=>t.chain==="polygon"),true);
 plan=nextAssetRouteTasks(inv,[build(hub,false),full[1],full[2]]);
 assert.equal(plan.tasks.length,0);
 assert.equal(plan.eligibleRoutes.length,0);
});

// Regression: ARB originates on Arbitrum, but wARB router creation happens on Base.
// A Base-to-XGR counterpart alone cannot provide the canonical origin chain ID.
test("ARB synthetic router on Base resolves canonical Arbitrum from full chain inventory",()=>{
 const arbitrum={name:"arbitrum",chainId:42161,domainId:42161};
 const token="0x912ce59144191c1204e64559fe8253a0e49e6548";
 const arb={asset:"ARB",assetId,canonicalChain:"arbitrum",canonicalToken:token,
  metadata:{name:"Arbitrum",symbol:"ARB",decimals:18}};
 const draft=factoryRouteDraft({asset:arb,source:base,destination:hub,
  sourceInfrastructure:infra(base),destinationInfrastructure:infra(hub),
  representation:representation("base","syntheticRouter",null),action:"deploy-router",
  chains:[hub,base,arbitrum]});
 assert.equal(draft.chain,"base");
 assert.equal(draft.component,"syntheticRouter");
 // ABI contains originChainId=42161 and original ARB contract, not Base/XGR token identity.
 assert.ok(draft.transaction.data.toLowerCase().includes((42161).toString(16).padStart(64,"0")));
 assert.ok(draft.transaction.data.toLowerCase().includes(token.slice(2).toLowerCase().padStart(64,"0")));
});

test("asset operator supplies approved chain inventory for every synthetic router",()=>{
 const operator=readFileSync(new URL("./asset-operator.mjs",import.meta.url),"utf8");
 assert.match(operator,/representation,action:"deploy-router",chains:inventory\.chains/);
});

test("XITA admin requires executionGateway before enabling asset route deployment",()=>{
 const complete={name:"bsc",status:"documented",components:[
  {key:"factory",status:"documented",address:addr(3)},
  {key:"sourceRegistry",status:"documented",address:addr(4)},
  {key:"executionGateway",status:"not-deployed",address:null,optional:true}
 ]};
 assert.equal(chainReadyForAssetRoutes(complete),false);
 const missing={...complete,components:complete.components.map(x=>
  x.key==="sourceRegistry"?{...x,status:"not-deployed",address:null}:x)};
 assert.equal(chainReadyForAssetRoutes(missing),false);
});
