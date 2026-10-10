import test from "node:test";
import assert from "node:assert/strict";
import {planAssetRoutes,planCatalogRoutes,routeInstanceIdV315} from "./route-lifecycle.mjs";
const addr=n=>"0x"+n.toString(16).padStart(40,"0");
const assetId="0x"+"a".repeat(64);
const chains=[
 {name:"xgrchain",chainId:1643,domainId:1643},
 {name:"base",chainId:8453,domainId:8453},
 {name:"polygon",chainId:137,domainId:137}
];
const infra=chains.map(c=>({name:c.name,chainId:c.chainId}));
const make=({hub=addr(1),base=null,polygon=null}={})=>{
 const rep=(chain,role,router)=>({chain,role,deployedContracts:router?
  [{component:role==="native"?"nativeRouter":"syntheticRouter",address:router,routeName:null}]:[]});
 const route=(name,source,destination)=>({
  name,source,destination,receipts:[],components:{gateways:[]},routeIds:[]
 });
 return {key:"XGR",assetId,canonicalChain:"xgrchain",canonicalToken:null,
  representations:{xgrchain:rep("xgrchain","native",hub),
   base:rep("base","synthetic",base),polygon:rep("polygon","synthetic",polygon)},
  routes:[route("xgr_to_base","xgrchain","base"),
   route("base_to_xgr","base","xgrchain"),
   route("xgr_to_polygon","xgrchain","polygon"),
   route("polygon_to_xgr","polygon","xgrchain")]
 };
};
test("new Base spoke creates ONE wrapped router for both directed paths",()=>{
 const p=planAssetRoutes(make(),chains,infra);
 assert.equal(p.representations.filter(x=>x.chain==="base"&&x.action==="deploy-once").length,1);
 assert.equal(p.representations.find(x=>x.chain==="base").deployMethod,"deployWrappedXGRRouter");
 assert.equal(p.representations.find(x=>x.chain==="xgrchain").action,"reuse-verified");
 assert.equal(p.routes.filter(x=>x.kind==="route-prepare"&&x.source==="base").length,1);
 assert.equal(p.routes.filter(x=>x.kind==="route-prepare"&&x.destination==="base").length,1);
 assert.ok(p.routes.every(x=>x.routeId===null));
});
test("return route REUSES existing synthetic mint/burn router",()=>{
 const p=planAssetRoutes(make({base:addr(2)}),chains,infra);
 const b=p.representations.find(x=>x.chain==="base");
 assert.equal(b.action,"reuse-verified");
 const outward=p.routes.find(x=>x.kind==="route-prepare"&&x.name==="xgr_to_base");
 const inbound=p.routes.find(x=>x.kind==="route-prepare"&&x.name==="base_to_xgr");
 assert.equal(outward.router,addr(1));assert.equal(outward.remoteRouter,addr(2));
 assert.equal(inbound.router,addr(2));assert.equal(inbound.remoteRouter,addr(1));
 assert.notEqual(outward.routeId,inbound.routeId);
 assert.equal(p.pairs[0].readyForAttestation,false);
});
test("Polygon is the same process without chain-specific branches",()=>{
 const p=planAssetRoutes(make({base:addr(2)}),chains,infra);
 assert.equal(p.representations.find(x=>x.chain==="polygon").action,"deploy-once");
 assert.equal(p.pairs.length,2);
 assert.equal(p.routes.filter(x=>x.kind==="route-activate").length,4);
});
test("duplicate or mismatched router observations always fail closed",()=>{
 const a=make({base:addr(2)});
 a.representations.base.deployedContracts.push({component:"syntheticRouter",address:addr(3)});
 assert.throws(()=>planAssetRoutes(a,chains,infra),/Ambiguous/);
 const b=make({base:addr(2)});b.routes[0].routeIds=["0x"+"f".repeat(64)];
 assert.throws(()=>planAssetRoutes(b,chains,infra),/Route ID does not match/);
});
test("unidirectional or direct spoke route is not activatable",()=>{
 const a=make();a.routes=a.routes.filter(x=>x.name!=="base_to_xgr");
 assert.throws(()=>planAssetRoutes(a,chains,infra),/Reciprocal/);
 const b=make();b.routes[0].source="polygon";
 assert.throws(()=>planAssetRoutes(b,chains,infra),/Spoke-to-spoke/);
});
test("same canonical pair derives deterministic reverse-distinct route hashes",()=>{
 const f=routeInstanceIdV315(assetId,chains[0],chains[1],addr(1),addr(2));
 const r=routeInstanceIdV315(assetId,chains[1],chains[0],addr(2),addr(1));
 assert.match(f,/^0x[0-9a-f]{64}$/);assert.notEqual(f,r);
 assert.equal(f,routeInstanceIdV315(assetId,chains[0],chains[1],addr(1),addr(2)));
 assert.throws(()=>routeInstanceIdV315(assetId,chains[1],chains[2],addr(2),addr(3)),/hub/);
});
