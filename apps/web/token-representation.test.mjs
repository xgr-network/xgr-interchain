import test from "node:test";
import assert from "node:assert/strict";
import {representationFor} from "./token-representation.js";
import {createUniverseTopology} from "./universe-3d.js";
import {buildExperienceModel,renderDashboard} from "./experience.js";
const cat={chains:{xgrchain:{chainId:1643,nativeCurrency:{symbol:"XGR"}},base:{chainId:8453,nativeCurrency:{symbol:"ETH"}}},assets:{XGR:{profile:{name:"XGR",slug:"xgr"},metadata:{canonical:{chain:"xgrchain"},representations:[{chain:"xgrchain",representation:"native",symbol:"XGR"},{chain:"base",representation:"synthetic",symbol:"wXGR"}]},routes:{routes:[]}}}};
test("canonical native and wrapped XGR are distinctly labelled",()=>{
 const a=cat.assets.XGR.metadata;
 const token={id:"XGR",representations:a.representations};
 assert.deepEqual([representationFor(token,"xgrchain").kind,representationFor(token,"base").kind],["native","wrapped"]);
 assert.equal(representationFor(token,"base").symbol,"wXGR");
});
test("hub system has token planets as well, but no artificial rings required",()=>{
 const topo=createUniverseTopology(buildExperienceModel(cat));
 assert.ok(topo.planets.some(p=>p.system.system.key==="xgrchain"&&p.token.id==="XGR"));
 assert.ok(topo.planets.some(p=>p.system.system.key==="base"&&p.token.id==="XGR"));
});
test("dashboard uses token directory not redundant published routes",()=>{
 const html=renderDashboard(buildExperienceModel(cat),{},"unavailable");
 assert.doesNotMatch(html,/Published directed routes|View all routes/);
 assert.match(html,/Browse tokens/);
});
