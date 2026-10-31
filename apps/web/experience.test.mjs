import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {buildExperienceModel,previewRoute,renderDashboard,renderUniverse,renderRoutes,renderPlanRoute,renderFAQ,renderTokenBridge,dashboardMarketRows,transferTokenIdentity,normalizeTransferSelection,executableDestinations,chainFeeIdentity} from "./experience.js";
import {deployedFixture,visibilityFixture} from "./deployed-test-fixture.mjs";
import {freshDeployedCatalog} from "../../services/managed-relay/test-deployments.mjs";
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
test("fee display uses real chain names and native gas denominations from the published catalog",()=>{
 for(const [key,label,coin] of [
  ["xgrchain","XGRChain","XGR"],["base","Base","ETH"],
  ["arbitrum","Arbitrum","ETH"],["bsc","BNB Smart Chain","BNB"]
 ]){
  assert.deepEqual(chainFeeIdentity(catalog,key),{label,coin});
 }
 assert.notEqual(chainFeeIdentity(catalog,"bsc").coin,"bsc");
 const broken=structuredClone(catalog);
 delete broken.chains.bsc.nativeCurrency.symbol;
 assert.throws(()=>chainFeeIdentity(broken,"bsc"),/Fee denomination unavailable/);
 delete broken.chains.bsc;
 assert.throws(()=>chainFeeIdentity(broken,"bsc"),/Fee denomination unavailable/);
 const unnamed=structuredClone(catalog);
 unnamed.chains.bsc.displayName="";
 assert.throws(()=>chainFeeIdentity(unnamed,"bsc"),/Fee network name unavailable/);
});
test("universe always includes the hub and filters forbidden direct spoke routes",()=>{
  const model=buildExperienceModel(catalog,()=>true);
  assert.equal(model.hub.key,"xgrchain");
  assert.equal(model.routes.length,2);
  assert.ok(!model.routes.some(r=>r.name==="base_to_polygon"));
  assert.ok(renderUniverse(model).includes("XGRChain"));
});
test("BSC shows its configured public name on the planet while preserving the chain slug",()=>{
 const published=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const model=buildExperienceModel(published);
 assert.equal(published.chains.bsc.name,"bsc");
 assert.equal(published.chains.bsc.chainId,56);
 assert.equal(model.chains.find(c=>c.key==="bsc")?.label,"BNB Smart Chain");
 assert.match(renderDashboard(model),/BNB Smart Chain/);
 assert.match(renderUniverse(model,"bsc"),/BNB Smart Chain/);
});
test("spoke-to-spoke paths are exactly two directed operations",()=>{
  const model=buildExperienceModel(catalog,()=>true);
  const plan=previewRoute(model,"base","polygon","XGR");
  assert.deepEqual(plan.path,["base","xgrchain","polygon"]);
  assert.equal(plan.hops.length,2);
  assert.equal(plan.active,true);
  assert.match(plan.reason,/approval in the connected wallet/);
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
test("Join XITA navigation consistently highlights the free project application",()=>{
 const index=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const css=readFileSync(new URL("./style.css",import.meta.url),"utf8");
 const app=readFileSync(new URL("./app.js",import.meta.url),"utf8");
 const home=renderDashboard(buildExperienceModel(catalog));
 const faq=renderFAQ();
 assert.match(index,/class="xita-nav-join" href="\/join" data-nav aria-label="Join XITA for free"/);
 assert.match(index,/Join for Free/);
 assert.match(css,/body>header nav a\.xita-nav-join/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(home,/href="\/join">Join XITA/);
 assert.doesNotMatch(home,/href="\/join">Bring Your Token/);
 assert.match(faq,/href="\/join">Join XITA/);
 assert.match(app,/href="\/join">Join XITA/);
 assert.doesNotMatch(app,/href="\/join">Bring your token/);
});

test("FAQ: no XGR purchase required for external chains with quote-bound sponsorship",()=>{
 const faq=renderFAQ();
 const answer=question=>{
  const summary="<summary>"+question+"</summary>";
  const start=faq.indexOf(summary);
  assert.ok(start>=0,"Missing FAQ question: "+question);
  const end=faq.indexOf("</p>",start);
  assert.ok(end>start,"Missing FAQ answer: "+question);
  return faq.slice(start+summary.length,end);
 };
 const xgr=answer("Do I need XGR to transfer tokens between blockchains?");
 assert.match(xgr,/No\. For a supported transfer between external chains/);
 assert.match(xgr,/Base to Arbitrum/);
 assert.match(xgr,/do not need to buy or hold XGR/);
 assert.match(xgr,/passes through XGRChain/);
 assert.match(xgr,/signed quote/);
 assert.match(xgr,/source chain&#39;s native currency/);
 assert.match(xgr,/ETH on Base/);
 assert.match(xgr,/If you start on XGRChain, you need XGR/);
 assert.match(xgr,/Without confirmed sponsorship/);
 const sponsor=answer("How does optional gas sponsorship work?");
 assert.match(sponsor,/personalized signed quote/);
 assert.match(sponsor,/initial source transaction is finalized and verified/);
 assert.match(sponsor,/grants are sent to your wallet and must be confirmed/);
 assert.match(sponsor,/does not cover the initial source-chain gas/);
 const cost=answer("What does a transfer cost?");
 assert.match(cost,/source-chain protocol fee and XITA Service Fee/);
 assert.match(cost,/network gas for the initial source transaction/);
 assert.match(cost,/wallet-paid gas from any quoted sponsorship/);
 assert.match(cost,/Sponsorship does not make the transfer free/);
 assert.doesNotMatch(cost,/gas paid separately.*destination delivery on each hop/);
 const deployment=answer("Is the route deployment free for accepted projects?");
 assert.match(deployment,/XGR sponsors the complete deployment/);
 assert.match(deployment,/downstream gas may be covered by XITA/);
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
 assert.match(html,/Continue transfer · view status/);
 assert.match(html,/Continue this verified transfer in the status window/);
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

test("old awaiting-proof operations never replace a new verified XGR/Base transfer",()=>{
  const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base"});
  const m=buildExperienceModel(deployed);
  assert.ok(executableTransferRoutes(deployed).some(r=>r.asset==="XGR"&&r.source==="xgrchain"&&r.destination==="base"));
  const account="0x"+"1".repeat(40),txHash="0x"+"a".repeat(64);
  const item={account,asset:"XGR",sourceChain:"xgrchain",destinationChain:"base",txHash,
    status:"awaiting-proof",confirmed:true,delivered:false};
  const selection={origin:"xgrchain",destination:"base",asset:"XGR",amount:"0.1"};
  const fresh=renderPlanRoute(m,selection,"ready",{account},
    {items:[item],selectedTxHash:null,scanning:true});
  assert.match(fresh,/>Start Transfer<\/button>/);
  assert.doesNotMatch(fresh,/Transfer XGR → Base|Checking on-chain transfers/);
  assert.match(fresh,/Previous transfers awaiting delivery/);
  assert.match(fresh,/<option value="" selected>New transfer/);
  const selected=renderPlanRoute(m,selection,"ready",{account},
    {items:[item],selectedTxHash:txHash,scanning:true});
  assert.match(selected,/Continue transfer · view status/);
  assert.match(selected,/Continue this verified transfer in the status window/);
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

test("Dashboard hides wallet contracts; token inventory derives verified addresses from generated receipts",async()=>{
  const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base"});
  const m=buildExperienceModel(deployed),wallet={account:"0x"+"1".repeat(40)};
  const html=renderDashboard(m,{},"ready",null,deployed,wallet);
  assert.match(html,/ux-ns-stage/);
  assert.match(html,/Locked TVL/);
  assert.doesNotMatch(html,/Your XGR across chains|XGR · NETWORK REPRESENTATIONS|ux-wallet-inventory|ux-representation-entry|Native currency · no ERC-20 contract/);
  const {renderRepresentationInventory}=await import("./experience.js");
  assert.match(renderRepresentationInventory(m,"XGR","xgrchain",wallet),/Native currency · no ERC-20 contract/);
  const address=transferTokenIdentity(m,"XGR","base").address;
  assert.ok(address,"a test-deployed Base synthetic router must be verifiable");
  assert.match(renderRepresentationInventory(m,"XGR","base",wallet),new RegExp(address,"i"));
});

test("customer-facing transfers never label the route quote as GmbH fee",()=>{
 const model=buildExperienceModel(catalog);
 const html=renderPlanRoute(model,{origin:"xgrchain",destination:"base",asset:"XGR",amount:"1"},"ready");
 assert.doesNotMatch(html,/GmbH Interchain Fee/);
 assert.doesNotMatch(html,/Route, network gas/);
 assert.match(html,/Downstream gas and sponsorship/);
 assert.match(html,/wallet pays the native gas for the initial source-chain transfer/);
 assert.match(renderFAQ(),/XITA Service Fee/);
});

test("transfer derives wXGR and fee spender from in-memory deployment receipts",()=>{
  const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base",reverseRoute:true});
  const model=buildExperienceModel(deployed),acct="0x"+"1".repeat(40);
  const token=transferTokenIdentity(model,"XGR","base");
  const spender=model.feeAdapters.base;
  assert.equal(token.evidence,"deployment");
  assert.ok(token.address&&spender,"fixture must furnish two independently receipt-backed addresses");
  const html=renderPlanRoute(model,{origin:"base",destination:"xgrchain",asset:"XGR",amount:"0.5"},"ready",{account:acct});
  assert.match(html,/Official project/);
  assert.match(html,/https:\/\/xgr\.network/);
  assert.match(html,new RegExp(token.address,"i"));
  assert.match(html,/Native coin · no token contract/);
  assert.match(html,/XITA Execution Gateway/);
  assert.match(html,new RegExp(spender,"i"));
  assert.match(html,/Approval alone does not bridge or burn tokens/);
  assert.match(html,/basescan\.org\/token/);
  assert.match(html,/data-xita-copy-address/);
  assert.equal(transferTokenIdentity(model,"XGR","xgrchain").address,null);
});
test("untrusted project URL and conflicting receipt-backed routers fail closed",()=>{
  const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base",reverseRoute:true});
  deployed.assets.XGR.profile.links.website="javascript:alert(1)";
  deployed.assets.XGR.metadata.representations.find(r=>r.chain==="base").assetAddress="0x"+"f".repeat(40);
  const model=buildExperienceModel(deployed);
  const tokenAddress=transferTokenIdentity(model,"XGR","base").address;
  assert.ok(tokenAddress);
  const html=renderPlanRoute(model,{origin:"base",destination:"xgrchain",asset:"XGR"},"ready");
  assert.doesNotMatch(html,/javascript:alert|Official project/);
  assert.match(html,new RegExp(tokenAddress,"i"));
  const conflict=structuredClone(model);
  const realBase=conflict.deployments.find(r=>r.asset==="XGR"&&r.destination==="base");
  assert.ok(realBase);
  const conflictingAddress=tokenAddress.slice(0,-1)+(tokenAddress.endsWith("0")?"1":"0");
  assert.notEqual(conflictingAddress.toLowerCase(),tokenAddress.toLowerCase());
  conflict.deployments.push({...realBase,destinationRouter:conflictingAddress});
  const info=transferTokenIdentity(conflict,"XGR","base");
  assert.equal(info.address,null);
  assert.equal(info.evidence,"unavailable");
});

test("verified test-route identity is collapsed but its derived contract remains inspectable",()=>{
  const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base",reverseRoute:true});
  const m=buildExperienceModel(deployed);
  const address=transferTokenIdentity(m,"XGR","base").address;
  assert.ok(address);
  const html=renderPlanRoute(m,{origin:"base",destination:"xgrchain",asset:"XGR",amount:"0.5"},"ready");
  assert.match(html,/<details class="ux-route-identity"/);
  assert.doesNotMatch(html,/<details class="ux-route-identity"[^>]* open/);
  assert.match(html,/Contract details/);
  assert.match(html,new RegExp(address,"i"));
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
 assert.match(missing,/id="xita-transfer-primary"[^>]*disabled/);
 assert.match(missing,/id="xita-transfer-primary"[^>]*disabled/);
 const record={account,asset:"XGR",sourceChain:"base",destinationChain:"xgrchain",
  txHash,messageId:"0x"+"e".repeat(64),status:"awaiting-proof",
  confirmed:true,delivered:false};
 const found=renderPlanRoute(model,{origin:"xgrchain",destination:"base",asset:"XGR"},
  "ready",wallet,{items:[record],selectedTxHash:txHash});
 assert.match(found,/Continue transfer · view status/);
 assert.match(found,/Continue this verified transfer in the status window/);
 assert.match(found,/id="xita-open-transfer"/);
 assert.doesNotMatch(found,/Locating previous transfer/);
 const other=renderPlanRoute(model,{origin:"base",destination:"xgrchain",asset:"XGR"},
  "ready",{account:"0x"+"b".repeat(40)},{items:[record],selectedTxHash:txHash});
 assert.match(other,/Locating previous transfer/);
 assert.match(other,/id="xita-transfer-primary"[^>]*disabled/);
});

test("completed Base to XGR delivery is success, never unresolved or repeat-signable",()=>{
 const live=JSON.parse(readFileSync(new URL("catalog.json",import.meta.url),"utf8"));
 const m=buildExperienceModel(live),account="0x"+"a".repeat(40),txHash="0x"+"d".repeat(64);
 const completed={account,asset:"XGR",sourceChain:"base",destinationChain:"xgrchain",
  txHash,messageId:"0x"+"e".repeat(64),confirmed:true,delivered:true,status:"delivered"};
 const html=renderPlanRoute(m,{origin:"base",destination:"xgrchain",asset:"XGR"},"ready",
  {account},{items:[completed],selectedTxHash:txHash});
 assert.match(html,/data-transfer-action="new"/);
 assert.match(html,/>New transfer<\/button>/);
 assert.doesNotMatch(html,/Continue transfer · view status|id="xita-flow-reopen"/);
  assert.match(html,/Transfer costs|id="ux-fee-preview-status"/);
  assert.doesNotMatch(html,/is-recovery/);
 assert.doesNotMatch(html,/Previous transfer not yet verified|Original transfer has not yet been found/);
 assert.doesNotMatch(html,/Continue transfer · view status/);
 const foreign=renderPlanRoute(m,{origin:"base",destination:"xgrchain",asset:"XGR"},"ready",
  {account:"0x"+"b".repeat(40)},{items:[completed],selectedTxHash:txHash});
 assert.match(foreign,/Locating previous transfer/);
 assert.match(foreign,/id="xita-transfer-primary"[^>]*disabled/);
});

test("dashboard derives active directions from generated receipts, never mutable activation flags",()=>{
  const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base"});
  const model=buildExperienceModel(deployed,()=>false);
  const html=renderDashboard(model,{},"ready",null,deployed);
  const expected=executableTransferRoutes(deployed);
  const routeKeys=rows=>rows.map(r=>r.asset+":"+r.name+":"+r.source+":"+r.destination).sort();
  assert.ok(expected.length>0,"generated verified deployment must expose the tested direction");
  assert.deepEqual(routeKeys(model.transferRoutes),routeKeys(expected));
  assert.match(html,new RegExp("<strong>"+expected.length+"</strong><span>Active directions</span>"));
  const liveChains=new Set(expected.flatMap(r=>[r.source,r.destination]));
  for(const chain of Object.keys(deployed.chains)){
    const row=html.match(new RegExp('data-xita-system="'+chain+'"[\\s\\S]*?</button>'))?.[0];
    assert.ok(row,"missing configured chain "+chain);
    const status=chain==="xgrchain"?"Hub":liveChains.has(chain)?"Active":"In preparation";
    assert.ok(row.includes(">"+status+"</span>"),"unsupported active status: "+chain);
  }
  for(const asset of Object.values(deployed.assets))
    for(const route of asset.routes?.routes||[])route.active=true;
  assert.deepEqual(routeKeys(buildExperienceModel(deployed,()=>true).transferRoutes),routeKeys(expected));
  assert.equal((html.match(/class="ux-dashboard-ranking"/g)||[]).length,3);
});

test("TVL chart draws observed snapshots but never invents missing history",()=>{
 const model=buildExperienceModel(freshDeployedCatalog({routeDestination:"base"}).catalog);
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
 assert.doesNotMatch(busy,/id="xita-flow-reopen"/);
 assert.match(busy,/id="xita-transfer-primary"[^>]*disabled/);
 const record={account,asset:"XGR",sourceChain:"arbitrum",destinationChain:"xgrchain",
  finalDestinationChain:"base",txHash:hash,messageId:"0x"+"b".repeat(64),
  confirmed:true,delivered:false,status:"awaiting-proof"};
 const verified=renderPlanRoute(model,selection,"ready",{account},
  {selectedTxHash:hash,items:[record],hasFlow:true});
 assert.match(verified,/data-transfer-action="resume"/);
 assert.doesNotMatch(verified,/id="xita-flow-reopen"/);
 assert.equal((verified.match(/id="xita-transfer-primary"/g)||[]).length,1);
 const resume=renderPlanRoute(model,selection,"ready",{account},{selectedTxHash:hash,items:[]});
 assert.doesNotMatch(resume,/id="xita-flow-reopen"/); // A bare URL hash is not verified ownership.
 assert.match(resume,/id="xita-transfer-primary"[^>]*disabled/);
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
 assert.doesNotMatch(recovery,/id="xita-flow-reopen"/);
});

test("TVL 24h change requires a genuine nearby baseline and colors gain/loss",async()=>{
 const {tvlChange24h}=await import("./experience.js");
 const asOf="2026-10-22T11:00:00.000Z";
 const baseline="2026-10-21T11:00:00.000Z";
 const data={asOf,totals:{lockedUsd:120},history:{points:[{asOf:baseline,lockedUsd:100},{asOf,lockedUsd:120}]}};
 assert.equal(tvlChange24h(data),20);
 const positive=renderDashboard(buildExperienceModel(freshDeployedCatalog({routeDestination:"base"}).catalog),{tvlPeriod:"24h"},"ready",data);
 assert.match(positive,/\+20\.00% · 24h/);
 assert.match(positive,/is-positive/);
 assert.match(positive,/ux-ns-tvl-axis/);
 assert.match(positive,/data-tvl-period="30d"/);
 const neg={...data,totals:{lockedUsd:80}};
 assert.equal(tvlChange24h(neg),-20);
 assert.match(renderDashboard(buildExperienceModel(freshDeployedCatalog({routeDestination:"base"}).catalog),{},"ready",neg),/is-negative/);
 const noBaseline={...data,history:{points:[{asOf:"2026-10-21T07:00:00.000Z",lockedUsd:100},{asOf,lockedUsd:120}]}};
 assert.equal(tvlChange24h(noBaseline),null);
 assert.match(renderDashboard(buildExperienceModel(freshDeployedCatalog({routeDestination:"base"}).catalog),{},"ready",noBaseline),/24h —/);
});

test("TVL chart spreads actual short-window measurements across full plot",()=>{
 const model=buildExperienceModel(freshDeployedCatalog({routeDestination:"base"}).catalog),asOf="2026-10-22T10:00:00Z";
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
 assert.match(renderDashboard(buildExperienceModel(freshDeployedCatalog({routeDestination:"base"}).catalog),{},"ready",metrics),/\+5\.00% · 24h/);
 const short={totals:{lockedUsd:null},history:{points:[
  {asOf:"2026-10-22T09:55:00Z",lockedUsd:100},
  {asOf:"2026-10-22T10:00:00Z",lockedUsd:105}
 ]}};
 assert.equal(tvlChange24h(short),null);
});
test("last verified collateral is marked historic for a fixture-public asset",()=>{
  const c={assets:{XGR:deployedFixture("XGR","xgrchain")}};
  const metrics={visibility:visibilityFixture({XGR:"public"}),
    lastVerifiedAssets:{XGR:{lockedUsd:.011503,asOf:"2026-10-22T09:47:00Z"}}};
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

test("Top Tokens shows approved profile logos only for receipt-backed public fixture assets",()=>{
  const configured=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
  const deployed={assets:Object.fromEntries(Object.entries(configured.assets).map(([id,entry])=>[
    id,{...deployedFixture(id,entry.metadata.canonical.chain),profile:structuredClone(entry.profile)}
  ]))};
  const assets=Object.fromEntries(Object.keys(deployed.assets).map(id=>[id,{
    assetId:id,verified:false,market:{status:"market-data",source:"coingecko",
      marketCapUsd:id==="ARB"?200:100,priceUsd:1,circulating:100},
    custody:{status:"unavailable"},movement:{status:"unavailable"}
  }]));
  const snapshot={schemaVersion:1,kind:"xita-asset-metrics-v1",assets,
    visibility:visibilityFixture(Object.fromEntries(Object.keys(assets).map(id=>[id,"public"])))};
  const html=renderDashboard(buildExperienceModel(deployed),{},"ready",snapshot,deployed);
  assert.equal((html.match(/class="ux-dashboard-ranking"/g)||[]).length,3);
  assert.doesNotMatch(html,/ux-token-sphere/);
  assert.match(html,/class="ux-dashboard-token-logo-img"/);
  assert.match(html,/xgr_logo200\.png/);
  assert.match(html,/arb\.jpg/);
  assert.match(html,/ux-dashboard-token-fallback/);
  const broken=structuredClone(deployed);
  broken.assets.XGR.profile.branding.logoUrl="javascript:alert(1)";
  const invalid=renderDashboard(buildExperienceModel(broken),{},"ready",snapshot,broken);
  assert.doesNotMatch(invalid,/src="javascript:/);
  assert.match(invalid,/ux-dashboard-token-fallback/);
});

test("verified direct routes have neutral CTA; undeployed direct and two-hop routes never become signable",()=>{
  const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base",reverseRoute:true});
  const model=buildExperienceModel(deployed),wallet={account:"0x"+"1".repeat(40)};
  for(const [origin,destination] of [["xgrchain","base"],["base","xgrchain"]]){
    const html=renderPlanRoute(model,{origin,destination,asset:"XGR",amount:"1"},"ready",wallet,{});
    assert.match(html,/>Start Transfer<\/button>/);
    assert.doesNotMatch(html,/Transfer XGR → Base|Transfer XGR via XGRChain/);
  }
  const missingFee=freshDeployedCatalog({routeDestination:"base",reverseRoute:true}).catalog;
  for(const chain of ["xgrchain","base"])delete missingFee.infrastructure[chain].xitaV315.components.executionGateway;
  const without=buildExperienceModel(missingFee);
  for(const [origin,destination,asset] of [["xgrchain","base","XGR"],["arbitrum","base","XGR"],["xgrchain","base","ARB"]]){
    const html=renderPlanRoute(without,{origin,destination,asset,amount:"1"},"ready",wallet,{});
    assert.match(html,/id="xita-transfer-primary"[^>]*disabled/);
    assert.match(html,/Interchain Fee gateway not deployed/);
    assert.doesNotMatch(html,/Start Transfer<\/button>/);
  }
});

test("transfer form never offers identical origin and destination, including Arbitrum",()=>{
 const {catalog:c}=freshDeployedCatalog({routeDestination:"base",reverseRoute:true});
 const model=buildExperienceModel(c);
 const html=renderPlanRoute(model,{origin:"base",destination:"base",asset:"XGR"},"ready");
 const source=html.match(/<select id="ux-origin"[^>]*>([\s\S]*?)<\/select>/)?.[1]||"";
 const target=html.match(/<select id="ux-destination"[^>]*>([\s\S]*?)<\/select>/)?.[1]||"";
 assert.match(source,/value="base"/);
 assert.doesNotMatch(target,/value="base"/);
 assert.ok(target.includes('value="xgrchain"'));
 assert.equal(executableDestinations(model,"XGR","base").some(x=>x.key==="base"),false);
 const arbitrum={...model,chains:[...model.chains,{key:"arbitrum",label:"Arbitrum"}],
  transferRoutes:[...model.transferRoutes,
   {asset:"XGR",source:"arbitrum",destination:"xgrchain"},
   {asset:"XGR",source:"xgrchain",destination:"arbitrum"}]};
 const fromArb=renderPlanRoute(arbitrum,{origin:"arbitrum",destination:"arbitrum",asset:"XGR"},"ready");
 const toArb=fromArb.match(/<select id="ux-destination"[^>]*>([\s\S]*?)<\/select>/)?.[1]||"";
 assert.doesNotMatch(toArb,/value="arbitrum"/);
 assert.ok(toArb.includes('value="xgrchain"'));
});

test("select destination Arbitrum then source Arbitrum reconciles to XGRChain",()=>{
 const {catalog:c}=freshDeployedCatalog({names:["xgrchain","base","arbitrum"],routeDestination:"arbitrum",reverseRoute:true});
 const m=buildExperienceModel(c);
 // Source includes Arbitrum reverse route; destination is independently executable.
 const model={...m,transferRoutes:[...m.transferRoutes,
  {asset:"XGR",source:"arbitrum",destination:"xgrchain"},
  {asset:"XGR",source:"xgrchain",destination:"arbitrum"},
  {asset:"XGR",source:"base",destination:"xgrchain"}],
  chains:[{key:"xgrchain",label:"XGRChain"}, {key:"base",label:"Base"},
   {key:"arbitrum",label:"Arbitrum"}]};
 const before=normalizeTransferSelection(model,{asset:"XGR",origin:"xgrchain",destination:"arbitrum"},"destination");
 assert.deepEqual(before,{asset:"XGR",origin:"xgrchain",destination:"arbitrum"});
 const after=normalizeTransferSelection(model,{...before,origin:"arbitrum"},"origin");
 assert.deepEqual(after,{asset:"XGR",origin:"arbitrum",destination:"xgrchain"});
 const html=renderPlanRoute(model,{...after,amount:"20"},"ready",
  {account:"0x"+"1".repeat(40),tokenBalances:{
   "XGR:arbitrum":{status:"ready",balanceRaw:"50000000000000000000",decimals:18,symbol:"wXGR"},
   "XGR:xgrchain":{status:"ready",balanceRaw:"1939453108210000000000",decimals:18,symbol:"XGR"}}});
 const from=html.match(/<select id="ux-origin"[^>]*>([\s\S]*?)<\/select>/)?.[1]||"";
 const to=html.match(/<select id="ux-destination"[^>]*>([\s\S]*?)<\/select>/)?.[1]||"";
 assert.match(from,/<option value="arbitrum" selected>/);
 assert.match(to,/<option value="xgrchain" selected>/);
 assert.match(html,/Available on Arbitrum/);
 assert.match(html,/50 wXGR/);
 assert.doesNotMatch(html,/Available on XGRChain/);
 assert.match(html,/Arbitrum · wXGR → XGRChain · XGR/);
});
test("repeated chain edits preserve feasible destinations, never self-transfer",()=>{
 const m={chains:[{key:"xgrchain"},{key:"base"},{key:"arbitrum"}],
  assets:[{id:"XGR"}],transferRoutes:[
   {asset:"XGR",source:"base",destination:"xgrchain"},
   {asset:"XGR",source:"xgrchain",destination:"base"},
   {asset:"XGR",source:"arbitrum",destination:"xgrchain"},
   {asset:"XGR",source:"xgrchain",destination:"arbitrum"}]};
 let s={asset:"XGR",origin:"base",destination:"arbitrum"};
 for(const [key,value] of [["origin","arbitrum"],["destination","base"],
   ["origin","base"],["origin","xgrchain"],["destination","arbitrum"]]){
  s=normalizeTransferSelection(m,{...s,[key]:value},key);
  assert.notEqual(s.origin,s.destination);
  assert.ok(executableDestinations(m,s.asset,s.origin).some(c=>c.key===s.destination));
 }
});

test("selected unfinished journey displays exactly one status action and no new fee quote",()=>{
 const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base",reverseRoute:true});
 const model=buildExperienceModel(deployed),account="0x"+"1".repeat(40);
 const txHash="0x"+"a".repeat(64);
 const item={account,asset:"XGR",sourceChain:"xgrchain",destinationChain:"base",
  txHash,messageId:"0x"+"b".repeat(64),status:"awaiting-proof",
  confirmed:true,delivered:false};
 const html=renderPlanRoute(model,{asset:"XGR"},"ready",{account},
  {items:[item],selectedTxHash:txHash,hasFlow:true});
 assert.match(html,/data-transfer-action="resume"/);
 assert.match(html,/Continue transfer · view status/);
 assert.doesNotMatch(html,/id="xita-flow-reopen"/);
 assert.doesNotMatch(html,/Transfer costs|id="ux-fee-preview-status"/);
 assert.match(html,/is-recovery/);
});
test("completed journey loses stale status CTA and can reset to new transfer",()=>{
 const {catalog:deployed}=freshDeployedCatalog({routeDestination:"base",reverseRoute:true});
 const model=buildExperienceModel(deployed),account="0x"+"1".repeat(40);
 const txHash="0x"+"a".repeat(64);
 const done={account,asset:"XGR",sourceChain:"xgrchain",destinationChain:"base",
  txHash,messageId:"0x"+"b".repeat(64),status:"delivered",confirmed:true,delivered:true};
 const html=renderPlanRoute(model,{asset:"XGR"},"ready",{account},
  {items:[done],selectedTxHash:txHash,hasFlow:true});
 assert.match(html,/data-transfer-action="new"/);
 assert.match(html,/>New transfer<\/button>/);
 assert.doesNotMatch(html,/id="xita-flow-reopen"|View transfer status/);
  assert.match(html,/id="ux-fee-preview-status"/);
  assert.match(html,/id="ux-fee-info-trigger"/);
  assert.doesNotMatch(html,/is-recovery/);
});

test("outreach FAQ covers finality, recovery and sponsorship",()=>{
 const faq=renderFAQ();
 for(const needle of ["Why can a transfer take several minutes?","My Transfers","gas sponsorship","connected wallet","href=\"/contact\""])
  assert.ok(faq.includes(needle),needle);
 assert.doesNotMatch(faq,/must be confirmed by the user in MetaMask/);
});
