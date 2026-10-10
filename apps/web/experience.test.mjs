import test from "node:test";
import assert from "node:assert/strict";
import {buildExperienceModel,previewRoute,renderDashboard,renderUniverse,renderRoutes,renderTokenBridge} from "./experience.js";

const catalog={
  chains:{xgrchain:{chainId:1643,domainId:1643,nativeCurrency:{symbol:"XGR"}},
    base:{chainId:8453,domainId:8453,nativeCurrency:{symbol:"ETH"}},
    polygon:{chainId:137,domainId:137,nativeCurrency:{symbol:"POL"}}},
  assets:{XGR:{profile:{name:"XGR",slug:"xgr"},metadata:{canonical:{chain:"xgrchain"},
    representations:[{chain:"xgrchain"},{chain:"base"},{chain:"polygon"}]},
    routes:{routes:[
      {name:"base_to_xgr",sourceChain:"base",destinationChain:"xgrchain"},
      {name:"xgr_to_polygon",sourceChain:"xgrchain",destinationChain:"polygon"},
      {name:"base_to_polygon",sourceChain:"base",destinationChain:"polygon"}
    ]}}}
};
test("universe always includes the hub and filters forbidden direct spoke routes",()=>{
  const model=buildExperienceModel(catalog,()=>true);
  assert.equal(model.hub.key,"xgrchain");
  assert.equal(model.routes.length,2);
  assert.ok(!model.routes.some(r=>r.name==="base_to_polygon"));
  assert.ok(renderUniverse(model).includes("XGRChain"));
});
test("spoke-to-spoke paths are exactly two directed operations",()=>{
  const model=buildExperienceModel(catalog,()=>true);
  const plan=previewRoute(model,"base","polygon","XGR");
  assert.deepEqual(plan.path,["base","xgrchain","polygon"]);
  assert.equal(plan.hops.length,2);
  assert.equal(plan.active,true);
  assert.match(plan.reason,/not automated/);
});
test("unknown or unverified routes never become executable",()=>{
  const model=buildExperienceModel(catalog,()=>{throw Error("Missing deployment evidence")});
  assert.equal(previewRoute(model,"base","polygon","XGR").active,false);
  assert.equal(previewRoute(model,"polygon","base","XGR").configured,false);
  assert.equal(previewRoute(model,"base","base","XGR").configured,false);
});
test("dashboard and inventory do not invent real-time operational metrics",()=>{
  const model=buildExperienceModel(catalog);
  const html=renderDashboard(model,{},"error");
  assert.match(html,/Unavailable/);
  assert.match(html,/Not activated/);
  assert.doesNotMatch(html,/99\.9%|18 seconds|In Transit/);
  assert.match(renderRoutes(model),/Source-native validator fees are chain-wide/);
});
test("catalog-sourced strings are escaped in markup",()=>{
  const hostile={...catalog,chains:{...catalog.chains,foreign:{chainId:999,domainId:999,name:'<img src=x onerror=alert(1)>',nativeCurrency:{symbol:'ETH'}}}};
  const model=buildExperienceModel(hostile);
  const html=renderUniverse(model);
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
});

test("v3.1.5 token bridge remains disabled until verified deployment",()=>{
 const model=buildExperienceModel(catalog,()=>true);
 const markup=renderTokenBridge(model,"XGR",{origin:"base",destination:"polygon",amount:"5"},{account:null});
 assert.match(markup,/Base/);
 assert.match(markup,/XGRChain/);
 assert.match(markup,/Polygon/);
 assert.match(markup,/disabled/);
 assert.match(markup,/two independent source transactions/);
 assert.doesNotMatch(markup,/quoteILN|ILNGateway/);
});

test("selected chain details distinguish native and wrapped asset symbols",()=>{
 const rich={...catalog,assets:{XGR:{...catalog.assets.XGR,metadata:{
 canonical:{chain:"xgrchain"},representations:[
 {chain:"xgrchain",representation:"native",symbol:"XGR"},
 {chain:"base",representation:"synthetic",symbol:"wXGR"},
 {chain:"polygon",representation:"synthetic",symbol:"wXGR"}]}}}};
 const html=renderUniverse(buildExperienceModel(rich),"base");
 assert.match(html,/wXGR/);
 assert.match(html,/Wrapped/);
});
