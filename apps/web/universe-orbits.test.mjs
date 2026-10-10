import test from "node:test";
import assert from "node:assert/strict";
import {orbitPosition,createUniverseTopology} from "./universe-3d.js";
import {buildExperienceModel} from "./experience.js";
const catalog={chains:{xgrchain:{chainId:1643,domainId:1643,nativeCurrency:{symbol:"XGR"}},base:{chainId:8453,domainId:8453,nativeCurrency:{symbol:"ETH"}},polygon:{chainId:137,domainId:137,nativeCurrency:{symbol:"POL"}},arbitrum:{chainId:42161,domainId:42161,nativeCurrency:{symbol:"ETH"}}},assets:{}};
test("the gateway stays central and spokes use distinct inclined 3D orbital planes",()=>{
 const topology=createUniverseTopology(buildExperienceModel(catalog));
 assert.deepEqual(orbitPosition(topology.byKey.get("xgrchain"),150),[0,0,0]);
 const spokes=topology.systems.filter(s=>!s.portal);
 assert.equal(new Set(spokes.map(s=>s.orbital.inclination)).size,spokes.length);\n assert.ok(spokes.some(s=>s.orbital.axis[0]!==0));
 assert.equal(new Set(spokes.map(s=>s.orbital.node)).size,spokes.length);
 assert.ok(spokes.every(s=>orbitPosition(s,12).every(Number.isFinite)));
 assert.ok(spokes.some(s=>Math.abs(orbitPosition(s,125)[1]-orbitPosition(s,0)[1])>.2));\n assert.ok(Math.min(...spokes.map(s=>s.orbital.origin[0]))<0);\n assert.ok(Math.max(...spokes.map(s=>s.orbital.origin[0]))>0);
});
test("reduced-motion setting freezes orbital positions",()=>{
 const s=createUniverseTopology(buildExperienceModel(catalog)).byKey.get("base");
 assert.deepEqual(orbitPosition(s,0,true),orbitPosition(s,10000,true));
});
