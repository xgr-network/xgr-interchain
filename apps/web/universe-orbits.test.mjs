import test from "node:test";
import assert from "node:assert/strict";
import {orbitPosition,decorativePosition,WORLD_LIGHT_DIRECTION,createUniverseTopology} from "./universe-3d.js";
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
