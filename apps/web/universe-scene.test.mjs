import test from "node:test";
import assert from "node:assert/strict";
import {makeStellarDisc,makeSystemOrbitTrack,placeStellarDisc,sceneComposition} from "./universe-scene.js";
import {createUniverseTopology} from "./universe-3d.js";
import {buildExperienceModel} from "./experience.js";
const catalog={chains:{xgrchain:{chainId:1643},base:{chainId:8453},polygon:{chainId:137},arbitrum:{chainId:42161}},assets:{
 XGR:{metadata:{canonical:{chain:"xgrchain"},representations:[
 {chain:"xgrchain",symbol:"XGR",representation:"native"},
 {chain:"base",symbol:"wXGR",representation:"synthetic"}]}}}};
test("stellar geometry exists for each chain and includes real depth",()=>{
 const t=createUniverseTopology(buildExperienceModel(catalog));
 assert.equal(sceneComposition(t).hub,1);
 assert.equal(sceneComposition(t).inclinedOrbits,3);
 assert.equal(sceneComposition(t).nativeOrWrappedPlanets,2);
 for(const system of t.systems){
  const disc=makeStellarDisc(system);
  assert.ok(disc.length>700);
  assert.ok(disc.every(Number.isFinite));
  assert.ok(new Set(Array.from(disc).filter((_,i)=>i%3===1).map(n=>n.toFixed(3))).size>40);
  const next=placeStellarDisc(disc,[3,4,5],5,system);
  assert.equal(next.length,disc.length);
  assert.notDeepEqual(Array.from(next.slice(0,3)),Array.from(disc.slice(0,3)));
 }
 assert.equal(makeSystemOrbitTrack(t.byKey.get("xgrchain")).length,0);
 assert.ok(makeSystemOrbitTrack(t.byKey.get("base")).length>300);
});
