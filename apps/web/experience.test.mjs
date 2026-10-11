import test from "node:test";
import assert from "node:assert/strict";
import {buildExperienceModel,previewRoute,renderDashboard,renderUniverse,renderRoutes,renderPlanRoute,renderFAQ,renderTokenBridge,dashboardMarketRows} from "./experience.js";
import {deployedFixture} from "./deployed-test-fixture.mjs";

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
  assert.match(html,/Awaiting complete verified evidence/);
  assert.match(html,/Verified active/);
  assert.doesNotMatch(html,/99\.9%|18 seconds|In Transit/);
  assert.match(renderRoutes(model),/Alliance projects start with an application and XGR review/);
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

test("CoinGecko market cap in Universe is asset-wide and independent of route activation",()=>{
 const model=buildExperienceModel(catalog,()=>false);
 const snapshot={schemaVersion:1,kind:"xita-asset-metrics-v1",assets:{XGR:{assetId:"XGR",verified:false,
  market:{status:"market-data",source:"coingecko",marketCapUsd:10351.53,priceUsd:0.0001144,circulating:90485400,asOf:"2026-10-10T17:00:00Z"},
  custody:{status:"unavailable"},movement:{status:"unavailable"}}}};
 const html=renderUniverse(model,"polygon",snapshot);
 assert.match(html,/10,351.53/);
 assert.match(html,/Asset-wide market cap/);
 assert.match(html,/not Polygon TVL/);
 assert.match(html,/Verified active routes/);
 const without=renderUniverse(model,"polygon");
 assert.doesNotMatch(without,/ux-market-card/);
});

test("Northstar home and Universe share the immersive stage without changing route data",()=>{
 const model=buildExperienceModel(catalog,()=>false);
 const home=renderDashboard(model,{},"not-deployed");
 const universe=renderUniverse(model,"base");
 assert.match(home,/ux-ns-stage/);
 assert.match(universe,/ux-ns-stage/);
 assert.match(home,/ux-ns-deck/);
 assert.match(home,/ux-ns-card-systems/);
 assert.doesNotMatch(home,/ux-journey-planner|id="ux-origin"|Journey preview/);
 assert.match(home,/XGR Interchain/);
 assert.match(home,/Top Tokens/);
 assert.match(universe,/ux-selected-details/);
 assert.match(universe,/Explore configured worlds/);
 assert.doesNotMatch(home,/99\.9%|~11s|REAL-TIME UNIVERSE|3 active routes/);
 assert.doesNotMatch(home,/XDC/);
 assert.match(home,/Polygon/);
});

test("new Plan a Route and FAQ pages reuse safe planner and show verified-state guidance",()=>{
 const model=buildExperienceModel(catalog,()=>false);
 const planner=renderPlanRoute(model,{},"error");
 assert.match(planner,/Plan a Route/);
 assert.match(planner,/id="ux-origin"/);
 assert.match(planner,/id="ux-destination"/);
 assert.match(planner,/Not verified/);
 assert.doesNotMatch(planner,/ux-3d-canvas/);
 const faq=renderFAQ();
 assert.match(faq,/Understand XITA/);
 assert.match(faq,/XGR Interchain Token Alliance/);
 assert.match(faq,/Why should my project join XITA/);
 assert.match(faq,/positive XGR review/);
 assert.match(faq,/Does XITA provide DEX liquidity or exchange listings/);
 assert.match(faq,/XGR sponsors the complete deployment/);
 assert.match(faq,/Locked TVL and Moved via XGR/);
 assert.match(faq,/href="\/plan-route"/);
});

test("public ranking requires DB-qualified full deployments and sourced caps",()=>{
 const c={assets:{A:deployedFixture("A"),B:deployedFixture("B"),HIDDEN:deployedFixture("HIDDEN")}};
 const row=(id,cap)=>({assetId:id,verified:false,market:{status:"market-data",source:"coingecko",
  marketCapUsd:cap,priceUsd:1,circulating:cap},custody:{status:"unavailable"},movement:{status:"unavailable"}});
 const snapshot={kind:"xita-asset-metrics-v1",schemaVersion:1,assets:{A:row("A",100),B:row("B",200),HIDDEN:row("HIDDEN",1000000)},
 visibility:{kind:"xita-visibility-v1",schemaVersion:1,assets:{
  A:{status:"public",assetId:c.assets.A.metadata.assetId},
  B:{status:"public",assetId:c.assets.B.metadata.assetId},
  HIDDEN:{status:"accepted",assetId:c.assets.HIDDEN.metadata.assetId}}}};
 assert.deepEqual(dashboardMarketRows(c,snapshot).map(r=>r.id),["B","A"]);
 assert.deepEqual(dashboardMarketRows(c,null),[]);
});

test("dashboard never treats partial TVL as verified and planner stays on its own page",()=>{
 const model=buildExperienceModel(catalog);
 const data={schemaVersion:1,kind:"xita-asset-metrics-v1",totals:null,assets:{}};
 const home=renderDashboard(model,{},"ready",data);
 assert.match(home,/Locked TVL/);
 assert.match(home,/Moved via XGR/);
 assert.match(home,/Awaiting complete verified evidence/);
 assert.doesNotMatch(home,/id="ux-origin"|id="ux-journey-planner"/);
 const planner=renderPlanRoute(model,{},"ready");
 assert.match(planner,/id="ux-origin"/);
 assert.match(planner,/id="ux-destination"/);
 assert.match(planner,/id="ux-journey-planner"/);
});

test("Northstar hero explains holders and projects with matching actions",()=>{
 const html=renderDashboard(buildExperienceModel(catalog));
 assert.match(html,/Explore the <em>Universe\.<\/em>/);
 assert.match(html,/Move tokens between worlds/);
 assert.match(html,/Bring your token to new chains/);
 assert.match(html,/href="\/plan-route">Explore Routes/);
 assert.match(html,/href="\/join">Bring Your Token/);
 assert.match(html,/FOR TOKEN HOLDERS/);
 assert.match(html,/FOR TOKEN PROJECTS/);
 assert.match(html,/Check route availability/);
 assert.match(html,/configured threshold/);
 assert.doesNotMatch(html,/id="ux-journey-planner"/);
});

test("partner program describes review, sponsorship and threshold-based listing",()=>{
 const faq=renderFAQ(),home=renderDashboard(buildExperienceModel(catalog));
 for(const content of [faq,home]){
  assert.match(content,/review/i);
  assert.match(content,/sponsor/i);
  assert.match(content,/threshold/i);
 }
 assert.doesNotMatch(faq,/discretionary Alliance approval|No central Alliance vote|permissionless XITA Factory/i);
});
