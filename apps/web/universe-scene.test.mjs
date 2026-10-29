import test from "node:test";
import assert from "node:assert/strict";
import {makeStellarDisc,makeSystemOrbitTrack,placeStellarDisc,sceneComposition} from "./universe-scene.js";
import {createUniverseTopology} from "./universe-3d.js";
import {buildExperienceModel} from "./experience.js";
import {readFileSync} from "node:fs";
const catalog={chains:{xgrchain:{chainId:1643},base:{chainId:8453},polygon:{chainId:137},arbitrum:{chainId:42161}},assets:{
 XGR:{metadata:{canonical:{chain:"xgrchain"},representations:[
 {chain:"xgrchain",symbol:"XGR",representation:"native"},
 {chain:"base",symbol:"wXGR",representation:"synthetic"}]}}}};
test("public Universe hides planned Polygon and includes fully deployed BSC",()=>{
 const live=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const model=buildExperienceModel(live);
 const topology=createUniverseTopology(model);
 const visible=new Set(topology.systems.map(item=>item.system.key));
 for(const key of ["xgrchain","base","arbitrum","bsc"])assert.ok(visible.has(key),key);
 assert.ok(!visible.has("polygon"));
 assert.ok(model.chains.some(item=>item.key==="bsc"),"Admin and configured chain inventory remain intact");
 assert.ok(topology.links.every(link=>visible.has(link.from.system.key)&&visible.has(link.to.system.key)));
 const incomplete=structuredClone(live);
 delete incomplete.infrastructure.bsc.xitaV315.components.sourceRegistry;
 const blocked=createUniverseTopology(buildExperienceModel(incomplete));
 assert.equal(blocked.byKey.has("bsc"),false,"incomplete infrastructure must never appear");
});
test("Northstar decoration keeps subtle hub dust and no spoke particle clouds",()=>{
 const t=createUniverseTopology(buildExperienceModel(catalog));
 assert.equal(sceneComposition(t).hub,1);
 assert.equal(sceneComposition(t).inclinedOrbits,3);
 assert.equal(sceneComposition(t).nativeOrWrappedPlanets,0);
 for(const system of t.systems){
  const disc=makeStellarDisc(system);
  assert.equal(disc.length,system.portal?340*3:0);
  assert.ok(disc.every(Number.isFinite));
  if(system.portal)assert.ok(new Set(Array.from(disc).filter((_,i)=>i%3===1).map(n=>n.toFixed(3))).size>40);
  const next=placeStellarDisc(disc,[3,4,5],5,system);
  assert.equal(next.length,disc.length);
  if(system.portal)assert.notDeepEqual(Array.from(next.slice(0,3)),Array.from(disc.slice(0,3)));
 }
 assert.equal(makeSystemOrbitTrack(t.byKey.get("xgrchain")).length,0);
 assert.ok(makeSystemOrbitTrack(t.byKey.get("base")).length>300);
});
