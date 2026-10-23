import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {buildExperienceModel,previewRoute,renderDashboard,renderUniverse,renderRoutes,renderPlanRoute,renderFAQ,renderTokenBridge,dashboardMarketRows,transferTokenIdentity} from "./experience.js";
import {deployedFixture} from "./deployed-test-fixture.mjs";
import {executableTransferRoutes} from "./route-availability.js";



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
  assert.match(plan.reason,/MetaMask approval/);
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
  assert.match(html,/Active directions/);
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

test("token page links to the only transfer workflow without duplicate signing inputs",()=>{
 const html=renderTokenBridge(buildExperienceModel(catalog),"XGR");
 assert.match(html,/Transfer XGR/);
 assert.match(html,/href="\/transfer\?token=XGR"/);
 assert.doesNotMatch(html,/id="ux-token-amount"|id="ux-token-origin"|eth_sendTransaction/);
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
 assert.match(home,/href="\/transfer">Transfer Tokens/);
 assert.match(home,/href="\/join">Join XITA/);
 const heroActions=home.split('<div class="ux-ns-actions">')[1]?.split('</div>')[0];
 assert.ok(heroActions,"Main hero actions must exist");
 assert.ok(heroActions.includes('href="/transfer">Transfer Tokens'));
 assert.ok(heroActions.includes('href="/join">Join XITA'));
 assert.ok(!heroActions.includes("Explore Routes")&&!heroActions.includes("Bring Your Token"));
 assert.match(universe,/ux-selected-details/);
 assert.match(universe,/Explore configured worlds/);
 assert.doesNotMatch(home,/99\.9%|~11s|REAL-TIME UNIVERSE|3 active routes/);
 assert.doesNotMatch(home,/XDC/);
 assert.match(home,/Polygon/);
});

test("Transfer Tokens and FAQ use a single canonical transaction UI",()=>{
 const planner=renderPlanRoute(buildExperienceModel(catalog),{},"error");
 assert.match(planner,/Transfer Tokens/);
 assert.match(planner,/XGR.Network GmbH provides this web interface/);
 assert.match(planner,/private keys/);
 assert.match(planner,/public smart contracts/);
 assert.match(planner,/Use at your own risk/);
 assert.match(planner,/id="ux-origin"/);
 assert.match(planner,/id="ux-destination"/);
 assert.match(planner,/id="xita-transfer-primary"/);
 assert.doesNotMatch(planner,/ux-3d-canvas|eth_sendTransaction/);
 const faq=renderFAQ();
 assert.match(faq,/XGR Interchain Token Alliance/);
 assert.match(faq,/Why should my project join XITA/);
 assert.match(faq,/Locked TVL and Moved via XGR/);
 assert.match(faq,/href="\/transfer"/);
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
 assert.match(html,/href="\/transfer">Transfer Tokens/);
 assert.match(html,/href="\/join">Join XITA/);
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


test("single action stays non-signing in read-only planner HTML",()=>{
 const model=buildExperienceModel(catalog);
 const wallet={account:"0x1111111111111111111111111111111111111111",
  balances:{base:{status:"ready",balanceWei:"1000000000000000000"}}};
 const html=renderPlanRoute(model,{origin:"base",destination:"xgrchain",asset:"XGR"},"ready",wallet);
 assert.match(html,/Transfer Tokens/);
 assert.match(html,/id="xita-transfer-primary"/);
 assert.match(html,/id="ux-transfer-amount"/);
 assert.match(html,/id="ux-destination"/);
 assert.doesNotMatch(html,/eth_sendTransaction|onclick=.*process/);
});
test("wallet-driven open transfer is one destination continuation, no browser WAL",()=>{
 const model=buildExperienceModel(catalog);
 const account="0x1111111111111111111111111111111111111111";
 const record={account,asset:"XGR",status:"awaiting-proof",sourceChain:"xgrchain",
  destinationChain:"base",txHash:"0x"+"a".repeat(64),messageId:"0x"+"b".repeat(64),confirmed:true};
 const html=renderPlanRoute(model,{},"ready",{account},{items:[record],selectedTxHash:record.txHash});
 assert.match(html,/Continue delivery/);
 assert.match(html,/Existing source transfer selected/);
 assert.match(html,/xita-open-transfer/);
 assert.doesNotMatch(html,/localStorage|sessionStorage|journal/);
});
test("no catalog deployment does not invent actionable transfer routes",()=>{
 const model=buildExperienceModel({chains:catalog.chains,assets:{}});
 const html=renderPlanRoute(model,{},"not-deployed",{account:"0x1111111111111111111111111111111111111111"});
 assert.match(html,/Interchain Fee gateway not deployed/);
 assert.doesNotMatch(html,/eth_sendTransaction/);
});


test("Transfer CTA follows structured route fees without old gas diagnostics",()=>{
 const model=buildExperienceModel(catalog);
 const wallet={account:"0x1111111111111111111111111111111111111111",
  tokenBalances:{"XGR:xgrchain":{status:"ready",balanceRaw:"12000000000000000000",decimals:18,symbol:"XGR"}},
  balances:{xgrchain:{status:"ready",balanceWei:"12000000000000000000"},
   base:{status:"ready",balanceWei:"2000000000000000"}}};
 const html=renderPlanRoute(model,{origin:"xgrchain",destination:"base",asset:"XGR",amount:"0.1"},"ready",wallet);
 assert.ok(html.indexOf('id="ux-transfer-amount"')<html.indexOf('id="xita-transfer-primary"'));
 assert.match(html,/ADDITIONAL ROUTE FEES/);
 assert.match(html,/Transfer costs/);
 assert.match(html,/network gas for wallet transactions/);
 assert.match(html,/Gas sponsorship|gas sponsorship/);
 assert.doesNotMatch(html,/Route, network gas &amp; safety checks/);
 assert.doesNotMatch(html,/ux-transfer-advanced/);
 assert.ok(html.indexOf('id="xita-transfer-primary"')<html.indexOf('id="ux-fee-preview-status"'));
 assert.doesNotMatch(html,/Transfer progress/);
 assert.match(html,/class="ux-transfer-side"/);
 assert.match(html,/id="ux-fee-info-trigger"/);
 assert.match(html,/<dialog id="ux-fee-info-dialog"/);
 assert.match(html,/data-fee-info-close/);
 assert.match(html,/ux-transfer-available/);
 assert.match(html,/Available on /);
 // This fixture has no deployment receipts, so the UI must not invent an available amount.
 assert.match(html,/Interchain Fee gateway not deployed/);
 assert.equal((html.match(/Token balances/g)||[]).length,0);
 assert.match(html,/New transfers need a verified Interchain Fee/);
 assert.doesNotMatch(html,/Route delivery not verified\. No signing or sending is enabled/);
 const noWallet=renderPlanRoute(model,{},"ready");
 assert.ok(noWallet.indexOf("Connect wallet to transfer")<noWallet.indexOf("ADDITIONAL ROUTE FEES"));
 assert.match(noWallet,/id="xita-transfer-primary"/);
});

test("old awaiting-proof operations never replace the new XGR/Base transfer",()=>{
 const c=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const m=buildExperienceModel(c);
 const account="0x"+"1".repeat(40),txHash="0x"+"a".repeat(64);
 const item={account,asset:"XGR",sourceChain:"xgrchain",destinationChain:"base",txHash,
  status:"awaiting-proof",confirmed:true,delivered:false};
 const fresh=renderPlanRoute(m,{origin:"xgrchain",destination:"base",asset:"XGR",amount:"0.1"},"ready",
  {account},{items:[item],selectedTxHash:null,scanning:true});
 assert.match(fresh,/Transfer XGR → Base/);
 assert.doesNotMatch(fresh,/Interchain Fee gateway not deployed/);
 assert.doesNotMatch(fresh,/Checking on-chain transfers/);
 assert.match(fresh,/Previous transfers awaiting delivery/);
 assert.match(fresh,/<option value="" selected>New transfer/);
 assert.match(fresh,/Transfer XGR → Base/);
 const selected=renderPlanRoute(m,{origin:"xgrchain",destination:"base",asset:"XGR",amount:"0.1"},"ready",
  {account},{items:[item],selectedTxHash:txHash,scanning:true});
 assert.match(selected,/Continue delivery/);
 assert.match(selected,/Existing source transfer selected/);
 assert.doesNotMatch(fresh,/One transfer page/);
});

test("transfer screen has only route fees, status is exclusively modal",()=>{
 const c=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const m=buildExperienceModel(c),account="0x"+"1".repeat(40);
 const html=renderPlanRoute(m,{origin:"arbitrum",destination:"base",asset:"XGR",amount:"50"},
  "ready",{account},{notice:"Checking allowance",error:"RPC unavailable"});
 assert.match(html,/id="xita-transfer-primary"/);
 assert.match(html,/class="ux-transfer-side"/);
 assert.match(html,/Transfer costs/);
 assert.doesNotMatch(html,/Transfer progress|id="xita-flow-open"|class="ux-transfer-progress/);
 assert.match(html,/id="xita-transfer-form-error"[^>]*>RPC unavailable<\/p>/);
});

test("Dashboard never displays XGR wallet inventory or contract-address panels",async ()=>{
 const c=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const m=buildExperienceModel(c),wallet={account:"0x"+"1".repeat(40)};
 const html=renderDashboard(m,{},"ready",null,c,wallet);
 assert.match(html,/ux-ns-stage/);
 assert.match(html,/Locked TVL/);
 assert.doesNotMatch(html,/Your XGR across chains|XGR · NETWORK REPRESENTATIONS|ux-wallet-inventory|ux-representation-entry|Native currency · no ERC-20 contract/);
 // Contract and wallet information still belongs on the XGR token detail view.
 const {renderRepresentationInventory}=await import("./experience.js");
 assert.match(renderRepresentationInventory(m,"XGR","xgrchain",wallet),/Native currency · no ERC-20 contract/);
 assert.match(renderRepresentationInventory(m,"XGR","base",wallet),/0x2ca97eff807744f81f13c59a75a8eb0add1c715d/i);
});

test("customer-facing transfers never label the route quote as GmbH fee",()=>{
 const model=buildExperienceModel(catalog);
 const html=renderPlanRoute(model,{origin:"xgrchain",destination:"base",asset:"XGR",amount:"1"},"ready");
 assert.doesNotMatch(html,/GmbH Interchain Fee/);
 assert.doesNotMatch(html,/Route, network gas/);
 assert.match(html,/Network gas is additional/);
 assert.match(renderFAQ(),/XITA Service Fee/);
});

test("transfer displays documented wXGR token contract, native XGR and official website",()=>{
 const c=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const model=buildExperienceModel(c),acct="0x"+"1".repeat(40);
 const html=renderPlanRoute(model,{origin:"base",destination:"xgrchain",asset:"XGR",amount:"0.5"},"ready",{account:acct});
 assert.match(html,/Official project/);
 assert.match(html,/https:\/\/xgr\.network/);
 assert.match(html,/0x2ca97eff807744f81f13c59a75a8eb0add1c715d/i);
 assert.match(html,/Native coin · no token contract/);
 assert.match(html,/XITA Execution Gateway/);
 assert.match(html,/0x9b6b92ef1745611f402341965f7fc649cbe0da8c/i);
 assert.match(html,/Approval alone does not bridge or burn tokens/);
 assert.match(html,/basescan\.org\/token/);
 assert.match(html,/data-xita-copy-address/);
 assert.equal(transferTokenIdentity(model,"XGR","xgrchain").address,null);
 assert.equal(transferTokenIdentity(model,"XGR","base").evidence,"deployment");
});
test("untrusted project URI is not rendered as executable link; conflicting synthetic is not verified",()=>{
 const c=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 c.assets.XGR.profile.links.website="javascript:alert(1)";
 c.assets.XGR.metadata.representations.find(x=>x.chain==="base").assetAddress="0x"+"f".repeat(40);
 const model=buildExperienceModel(c);
 const html=renderPlanRoute(model,{origin:"base",destination:"xgrchain",asset:"XGR"},"ready");
 assert.doesNotMatch(html,/javascript:alert/);
 assert.doesNotMatch(html,/Official project/);
 assert.match(html,/0x2ca97eff807744f81f13c59a75a8eb0add1c715d/i);
 const conflict=structuredClone(model);
 conflict.deployments.push({...conflict.deployments.find(x=>x.source==="base"),sourceToken:"0x"+"f".repeat(40)});
 const info=transferTokenIdentity(conflict,"XGR","base");
 assert.equal(info.address,null);
 assert.equal(info.evidence,"unavailable");
});

test("token identity is collapsed by default while full contract data stays accessible",()=>{
 const c=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const m=buildExperienceModel(c);
 const html=renderPlanRoute(m,{origin:"base",destination:"xgrchain",asset:"XGR",amount:"0.5"},"ready");
 assert.match(html,/<details class="ux-route-identity"/);
 assert.doesNotMatch(html,/<details class="ux-route-identity"[^>]* open/);
 assert.match(html,/Contract details/);
 assert.match(html,/0x2ca97eff807744f81f13c59a75a8eb0add1c715d/i);
 assert.match(html,/Official project/);
});

test("resume query intent never becomes a new source transaction when index unavailable",()=>{
 const live=JSON.parse(readFileSync(new URL("catalog.json",import.meta.url),"utf8"));
 const model=buildExperienceModel(live),account="0x"+"a".repeat(40),
  txHash="0x"+"d".repeat(64);
 const wallet={account};
 const missing=renderPlanRoute(model,{origin:"base",destination:"xgrchain",asset:"XGR"},
  "ready",wallet,{items:[],selectedTxHash:txHash});
 assert.match(missing,/Locating previous transfer/);
 assert.match(missing,/id="xita-transfer-primary" disabled/);
 assert.match(missing,/id="xita-transfer-primary" disabled/);
 const record={account,asset:"XGR",sourceChain:"base",destinationChain:"xgrchain",
  txHash,messageId:"0x"+"e".repeat(64),status:"awaiting-proof",
  confirmed:true,delivered:false};
 const found=renderPlanRoute(model,{origin:"xgrchain",destination:"base",asset:"XGR"},
  "ready",wallet,{items:[record],selectedTxHash:txHash});
 assert.match(found,/Continue delivery/);
 assert.match(found,/Existing source transfer selected/);
 assert.match(found,/id="xita-open-transfer"/);
 assert.doesNotMatch(found,/Locating previous transfer/);
 const other=renderPlanRoute(model,{origin:"base",destination:"xgrchain",asset:"XGR"},
  "ready",{account:"0x"+"b".repeat(40)},{items:[record],selectedTxHash:txHash});
 assert.match(other,/Locating previous transfer/);
 assert.match(other,/id="xita-transfer-primary" disabled/);
});

test("completed Base to XGR delivery is success, never unresolved or repeat-signable",()=>{
 const live=JSON.parse(readFileSync(new URL("catalog.json",import.meta.url),"utf8"));
 const m=buildExperienceModel(live),account="0x"+"a".repeat(40),txHash="0x"+"d".repeat(64);
 const completed={account,asset:"XGR",sourceChain:"base",destinationChain:"xgrchain",
  txHash,messageId:"0x"+"e".repeat(64),confirmed:true,delivered:true,status:"delivered"};
 const html=renderPlanRoute(m,{origin:"base",destination:"xgrchain",asset:"XGR"},"ready",
  {account},{items:[completed],selectedTxHash:txHash});
 assert.match(html,/Transfer complete/);
 assert.match(html,/Transfer complete/);
 assert.doesNotMatch(html,/Continue delivery/);
 assert.match(html,/id="xita-transfer-primary" disabled/);
 assert.match(html,/id="xita-transfer-primary" disabled/);
 assert.doesNotMatch(html,/Previous transfer not yet verified|Original transfer has not yet been found/);
 assert.doesNotMatch(html,/Continue delivery/);
 const foreign=renderPlanRoute(m,{origin:"base",destination:"xgrchain",asset:"XGR"},"ready",
  {account:"0x"+"b".repeat(40)},{items:[completed],selectedTxHash:txHash});
 assert.match(foreign,/Locating previous transfer/);
 assert.match(foreign,/id="xita-transfer-primary" disabled/);
});

test("dashboard derives active transfers from deployed catalog receipts, not mutable activation flags",()=>{
 const c=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const model=buildExperienceModel(c,()=>false);
 const html=renderDashboard(model,{},"ready",null,c);
 const expected=executableTransferRoutes(c);
 const routeKeys=rows=>rows.map(r=>r.asset+":"+r.name+":"+r.source+":"+r.destination).sort();
 assert.ok(expected.length>0,"deployed catalog must contain verified execution-ready directions");
 assert.deepEqual(routeKeys(model.transferRoutes),routeKeys(expected),
  "every active dashboard direction must have independently documented execution adapters");
 assert.match(html,new RegExp("<strong>"+expected.length+"</strong><span>Active directions</span>"));
 const liveChains=new Set(expected.flatMap(r=>[r.source,r.destination]));
 for(const chain of Object.keys(c.chains)){
  const row=html.match(new RegExp('data-xita-system="'+chain+'"[\\s\\S]*?</button>'))?.[0];
  assert.ok(row,"missing configured chain "+chain);
  const expectedStatus=chain==="xgrchain"?"Hub":liveChains.has(chain)?"Active":"In preparation";
  assert.ok(row.includes(">"+expectedStatus+"</span>"),
   chain+" status must follow verified route receipts, not activation flags");
 }
 // Even malicious/stale editable activation flags cannot enable missing routes.
 for(const asset of Object.values(c.assets))
  for(const route of asset.routes?.routes||[])route.active=true;
 assert.deepEqual(routeKeys(buildExperienceModel(c,()=>true).transferRoutes),routeKeys(expected));
 assert.equal((html.match(/class="ux-dashboard-ranking"/g)||[]).length,3);
});

test("TVL chart draws observed snapshots but never invents missing history",()=>{
 const model=buildExperienceModel(catalog);
 const pending=renderDashboard(model);
 assert.match(pending,/TVL history is being collected/);
 const metrics={totals:{lockedUsd:5,movedUsd:null},history:{points:[
  {asOf:"2026-10-20T12:00:00Z",lockedUsd:4},
  {asOf:"2026-10-21T12:00:00Z",lockedUsd:5}
 ]}};
 const html=renderDashboard(model,{tvlPeriod:"7d"},"ready",metrics);
 assert.match(html,/ux-ns-tvl-sparkline/);
 assert.match(html,/ux-ns-tvl-axis/);
 assert.match(html,/Moved via XGR/);
});

test("transfer status can be reopened without a new wallet action",()=>{
 const model=buildExperienceModel(JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8")));
 const account="0x"+"1".repeat(40),hash="0x"+"a".repeat(64);
 const selection={origin:"arbitrum",destination:"base",asset:"XGR",amount:"50"};
 assert.doesNotMatch(renderPlanRoute(model,selection,"ready",{account},{}),/id="xita-flow-reopen"/);
 const busy=renderPlanRoute(model,selection,"ready",{account},{busy:true,hasFlow:true});
 assert.match(busy,/id="xita-flow-reopen"/);
 assert.match(busy,/View transfer status/);
 assert.match(busy,/id="xita-transfer-primary" disabled/);
 const resume=renderPlanRoute(model,selection,"ready",{account},{selectedTxHash:hash,items:[]});
 assert.doesNotMatch(resume,/id="xita-flow-reopen"/); // A bare URL hash is not verified ownership.
 assert.match(resume,/id="xita-transfer-primary" disabled/);
 assert.doesNotMatch(renderPlanRoute(model,selection,"ready",{}, {hasFlow:true}),/id="xita-flow-reopen"/);
});

test("failed input preflight stays inline with NO modal or status reopening",()=>{
 const model=buildExperienceModel(JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8")));
 const account="0x"+"1".repeat(40);
 const markup=renderPlanRoute(model,{origin:"xgrchain",destination:"base",asset:"XGR",amount:""},
  "ready",{account},{error:"Enter a valid token amount",busy:false,hasFlow:false});
 assert.match(markup,/id="xita-transfer-form-error"/);
 assert.match(markup,/Enter a valid token amount/);
 assert.doesNotMatch(markup,/id="xita-flow-reopen"/);
 const recovery=renderPlanRoute(model,{origin:"xgrchain",destination:"base",asset:"XGR"},
  "ready",{account},{hasFlow:true});
 assert.match(recovery,/id="xita-flow-reopen"/);
});

test("TVL 24h change requires a genuine nearby baseline and colors gain/loss",async()=>{
 const {tvlChange24h}=await import("./experience.js");
 const asOf="2026-10-22T11:00:00.000Z";
 const baseline="2026-10-21T11:00:00.000Z";
 const data={asOf,totals:{lockedUsd:120},history:{points:[{asOf:baseline,lockedUsd:100},{asOf,lockedUsd:120}]}};
 assert.equal(tvlChange24h(data),20);
 const positive=renderDashboard(buildExperienceModel(catalog),{tvlPeriod:"24h"},"ready",data);
 assert.match(positive,/\+20\.00% · 24h/);
 assert.match(positive,/is-positive/);
 assert.match(positive,/ux-ns-tvl-axis/);
 assert.match(positive,/data-tvl-period="30d"/);
 const neg={...data,totals:{lockedUsd:80}};
 assert.equal(tvlChange24h(neg),-20);
 assert.match(renderDashboard(buildExperienceModel(catalog),{},"ready",neg),/is-negative/);
 const noBaseline={...data,history:{points:[{asOf:"2026-10-21T07:00:00.000Z",lockedUsd:100},{asOf,lockedUsd:120}]}};
 assert.equal(tvlChange24h(noBaseline),null);
 assert.match(renderDashboard(buildExperienceModel(catalog),{},"ready",noBaseline),/24h —/);
});

test("TVL chart spreads actual short-window measurements across full plot",()=>{
 const model=buildExperienceModel(catalog),asOf="2026-10-22T10:00:00Z";
 const metrics={asOf,totals:{lockedUsd:null,movedUsd:null},history:{points:[
  {asOf:"2026-10-22T09:55:00Z",lockedUsd:0.0115},
  {asOf:"2026-10-22T09:57:00Z",lockedUsd:0.0116},
  {asOf,lockedUsd:0.011503}
 ]}};
 const html=renderDashboard(model,{tvlPeriod:"24h"},"ready",metrics);
 assert.match(html,/M8\.00 /);
 assert.match(html,/L292\.00 /);
 assert.match(html,/Observed 5 min/);
 assert.match(html,/Last verified:/);
});
test("24h delta uses final verified observations even if current snapshot unavailable",async()=>{
 const {tvlChange24h}=await import("./experience.js");
 const metrics={totals:{lockedUsd:null},history:{points:[
  {asOf:"2026-10-21T10:00:00Z",lockedUsd:100},
  {asOf:"2026-10-22T10:00:00Z",lockedUsd:105}
 ]}};
 assert.equal(tvlChange24h(metrics),5);
 assert.match(renderDashboard(buildExperienceModel(catalog),{},"ready",metrics),/\+5\.00% · 24h/);
 const short={totals:{lockedUsd:null},history:{points:[
  {asOf:"2026-10-22T09:55:00Z",lockedUsd:100},
  {asOf:"2026-10-22T10:00:00Z",lockedUsd:105}
 ]}};
 assert.equal(tvlChange24h(short),null);
});
test("last verified collateral remains explicitly historic in Locked TVL ranking",()=>{
 const c=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const metrics={lastVerifiedAssets:{XGR:{lockedUsd:.011503,asOf:"2026-10-22T09:47:00Z"}}};
 const html=renderDashboard(buildExperienceModel(c),{},"ready",metrics,c);
 assert.match(html,/by Locked TVL/);
 assert.match(html,/Last verified/);
 assert.match(html,/\$0\.011503/);
});

test("two-hop resume dropdown names the final Base destination, never the hub",()=>{
 const model=buildExperienceModel(JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8")));
 const account="0x"+"a".repeat(40),tx="0x"+"9".repeat(64);
 const row={account,txHash:tx,asset:"XGR",sourceChain:"arbitrum",
  destinationChain:"xgrchain",finalDestinationChain:"base",
  confirmed:true,delivered:true,onwardRouteId:"0x"+"2".repeat(64),
  status:"awaiting-final-proof"};
 const html=renderPlanRoute(model,{origin:"arbitrum",destination:"base",asset:"XGR"},
  "ready",{account},{items:[row],selectedTxHash:tx});
 assert.match(html,/XGR · arbitrum → base · 0x99999999/);
 assert.doesNotMatch(html,/XGR · arbitrum → xgrchain · 0x99999999/);
});

test("Top Tokens rankings show real approved token logos instead of decorative planets",()=>{
 const live=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const assets={};
 for(const [id,entry] of Object.entries(live.assets)){
  assets[id]={assetId:id,verified:false,market:{status:"market-data",source:"coingecko",
   marketCapUsd:id==="ARB"?200:100,priceUsd:1,circulating:100},
   custody:{status:"unavailable"},movement:{status:"unavailable"}};
 }
 const html=renderDashboard(buildExperienceModel(live),{},"ready",
  {schemaVersion:1,kind:"xita-asset-metrics-v1",assets},live);
 assert.equal((html.match(/class="ux-dashboard-ranking"/g)||[]).length,3);
 assert.doesNotMatch(html,/ux-token-sphere/);
 assert.match(html,/class="ux-dashboard-token-logo-img"/);
 assert.match(html,/xgr_logo200\.png/);
 assert.match(html,/arb\.jpg/);
 assert.match(html,/ux-dashboard-token-fallback/);
 const broken=structuredClone(live);
 broken.assets.XGR.profile.branding.logoUrl="javascript:alert(1)";
 const invalid=renderDashboard(buildExperienceModel(broken),{},"ready",
  {schemaVersion:1,kind:"xita-asset-metrics-v1",assets},broken);
 assert.doesNotMatch(invalid,/src="javascript:/);
 assert.match(invalid,/ux-dashboard-token-fallback/);
});
