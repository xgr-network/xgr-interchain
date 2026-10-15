import test from "node:test";
import assert from "node:assert/strict";
import {orbitPosition,decorativePosition,WORLD_LIGHT_DIRECTION,createUniverseTopology,overviewHubLinks,hubSpokeSegments} from "./universe-3d.js";
import {buildExperienceModel} from "./experience.js";
const catalog={chains:{xgrchain:{chainId:1643,domainId:1643,nativeCurrency:{symbol:"XGR"}},base:{chainId:8453,domainId:8453,nativeCurrency:{symbol:"ETH"}},polygon:{chainId:137,domainId:137,nativeCurrency:{symbol:"POL"}},arbitrum:{chainId:42161,domainId:42161,nativeCurrency:{symbol:"ETH"}}},assets:{}};
test("the gateway stays central and spokes use distinct inclined 3D orbital planes",()=>{
 const topology=createUniverseTopology(buildExperienceModel(catalog));
 assert.deepEqual(orbitPosition(topology.byKey.get("xgrchain"),150),[0,0,0]);
 const spokes=topology.systems.filter(s=>!s.portal);
 assert.equal(new Set(spokes.map(s=>s.orbital.inclination)).size,spokes.length);
 assert.ok(spokes.some(s=>s.orbital.axis[0]!==0));
 assert.equal(new Set(spokes.map(s=>s.orbital.node)).size,spokes.length);
 assert.ok(spokes.every(s=>orbitPosition(s,12).every(Number.isFinite)));
 assert.ok(spokes.some(s=>Math.abs(orbitPosition(s,125)[1]-orbitPosition(s,0)[1])>.2));
 assert.ok(Math.min(...spokes.map(s=>s.orbital.origin[0]))<0);
 assert.ok(Math.max(...spokes.map(s=>s.orbital.origin[0]))>0);
});
test("reduced-motion setting freezes orbital positions",()=>{
 const s=createUniverseTopology(buildExperienceModel(catalog)).byKey.get("base");
 assert.deepEqual(orbitPosition(s,0,true),orbitPosition(s,10000,true));
});

test("XGR remains fixed while spokes and their decorative moons move consistently",()=>{
 const t=createUniverseTopology(buildExperienceModel(catalog));
 const hub=t.byKey.get("xgrchain");
 const base=t.byKey.get("base");
 for(const time of [0,1,20,500,1000]){
  assert.deepEqual(orbitPosition(hub,time),[0,0,0]);
 }
 const moon=base.decorations[0];
 const p0=decorativePosition(base,moon,0);
 const p1=decorativePosition(base,moon,30);
 assert.notDeepEqual(p0,p1);
 assert.ok(Math.hypot(...p0.map((v,i)=>v-orbitPosition(base,0)[i]))>moon.orbit*.75);
 assert.ok(Math.hypot(...p1.map((v,i)=>v-orbitPosition(base,30)[i]))>moon.orbit*.75);
 assert.deepEqual(decorativePosition(base,moon,0,true),decorativePosition(base,moon,200,true));
 assert.equal(t.planets.length,0,"decorative moons must not publish tokens");
});
test("illumination is one normalized fixed world-space direction",()=>{
 assert.equal(WORLD_LIGHT_DIRECTION.length,3);
 assert.ok(Math.abs(Math.hypot(...WORLD_LIGHT_DIRECTION)-1)<1e-12);
 assert.ok(Object.isFrozen(WORLD_LIGHT_DIRECTION));
});

test("overview only draws real configured hub-to-spoke edges, never loose fragments",()=>{
 const model=buildExperienceModel(catalog);
 model.routes=[
  {source:"base",destination:"xgrchain",active:false},
  {source:"xgrchain",destination:"base",active:true},
  {source:"polygon",destination:"xgrchain",active:false},
  {source:"base",destination:"polygon",active:true},
  {source:"unknown",destination:"xgrchain",active:true}
 ];
 const topology=createUniverseTopology(model);
 const links=overviewHubLinks(model,topology.byKey);
 assert.deepEqual(links.map(e=>e.to.system.key),["base","polygon"]);
 assert.ok(links.every(e=>e.from.system.key==="xgrchain"));
 assert.equal(links.find(e=>e.to.system.key==="base").active,true);
 for(const link of links){
  const a=orbitPosition(link.from,40),b=orbitPosition(link.to,40);
  const v=hubSpokeSegments(a,b);
  assert.equal(v.length,48*6);
  assert.deepEqual(Array.from(v.slice(0,3)),a);
  assert.ok(Math.hypot(...v.slice(-3).map((x,i)=>x-b[i]))<.00001);
  for(let i=0;i<47;i++){
   const end=v.slice(i*6+3,i*6+6),next=v.slice(i*6+6,i*6+9);
   assert.deepEqual(end,next,"continuous route without detached sections");
  }
 }
});
test("orbital planes, speeds and phases stay generic for arbitrary configured systems",()=>{
 const chains={xgrchain:{chainId:1643}};
 for(let i=0;i<20;i++)chains["network-"+String(i).padStart(2,"0")]={chainId:9000+i};
 const t=createUniverseTopology(buildExperienceModel({chains,assets:{}}));
 const spokes=t.systems.filter(s=>!s.portal);
 assert.equal(spokes.length,20);
 assert.equal(new Set(spokes.map(s=>s.orbital.node.toFixed(8))).size,20);
 assert.equal(new Set(spokes.map(s=>s.orbital.speed.toFixed(8))).size,20);
 assert.equal(new Set(spokes.map(s=>s.orbital.inclination.toFixed(8))).size,20);
 for(const sec of [0,10,120,1000]){
  assert.ok(spokes.every(s=>orbitPosition(s,sec).every(Number.isFinite)));
  assert.deepEqual(orbitPosition(t.byKey.get("xgrchain"),sec),[0,0,0]);
 }
 assert.equal(t.planets.length,0);
 const a=createUniverseTopology(buildExperienceModel({chains,assets:{}}));
 assert.deepEqual(spokes.map(s=>s.orbital),a.systems.filter(s=>!s.portal).map(s=>s.orbital));
});

test("every spoke gets a different star distance and independent angular motion",()=>{
 const t=createUniverseTopology(buildExperienceModel(catalog));
 const spokes=t.systems.filter(s=>!s.portal);
 const radii=spokes.map(s=>s.orbital.radius.toFixed(6));
 const speeds=spokes.map(s=>s.orbital.speed);
 assert.equal(new Set(radii).size,spokes.length);
 assert.equal(new Set(speeds.map(v=>v.toFixed(8))).size,spokes.length);
 assert.ok(speeds.some(v=>v>0)&&speeds.some(v=>v<0));
 assert.ok(Math.max(...speeds.map(Math.abs))-Math.min(...speeds.map(Math.abs))>0.002);
 for(const s of spokes){
  const p=orbitPosition(s,0),q=orbitPosition(s,1000);
  assert.ok(Math.hypot(...p)>12&&Math.hypot(...q)>12);
  assert.notDeepEqual(p,q);
 }
});
