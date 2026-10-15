import {deployedRoutes,supportedRouteChains} from "./route-availability.js";
import {representationFor} from "./token-representation.js";
import {openWalletTransfers,selectedRecovery} from "./wallet-transfer-selection.js";
import {verifiedMetrics,formatUsd,rankAssets,buildLeaderboardRows} from "./leaderboard-data.js";
// XITA Universe and Dashboard: present verified inventory without inventing live state.
// This module is deliberately pure and does not sign, quote or submit transfers.
// The token detail page remains the only bridge execution entry point.
export const HUB = "xgrchain";
const LABELS = {xgrchain:"XGRChain",base:"Base",polygon:"Polygon",arbitrum:"Arbitrum",xdc:"XDC"};
const POSITIONS = [
  {x:23,y:25},{x:77,y:27},{x:78,y:75},{x:22,y:74},{x:50,y:11},{x:50,y:91}
];
const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const chainLabel = (key,chain) => LABELS[key] || chain?.name || key;
const tokenLink = token => "/token/"+encodeURIComponent(token.slug);
const pill = (isActive) => '<span class="ux-badge '+(isActive?"is-verified":"is-pending")+'">'+(isActive?"Verified active":"Not verified")+"</span>";
const valueOrDash = value => value===null||value===undefined ? "—" : String(value);

export function buildExperienceModel(catalog, isVerified = () => false) {
  const assets = Object.entries(catalog?.assets||{}).map(([id,entry])=>({
    id, name:entry?.profile?.name||entry?.metadata?.name||id,
    slug:entry?.profile?.slug||id.toLowerCase(),
    canonical:entry?.metadata?.canonical?.chain||null,
    representations:Array.isArray(entry?.metadata?.representations)?entry.metadata.representations:[]
  }));
  const chains = Object.entries(catalog?.chains||{}).map(([key,entry])=>({
    key,label:chainLabel(key,entry),chainId:entry?.chainId??null,
    domainId:entry?.domainId??null,
    nativeCurrency:entry?.nativeCurrency?.symbol||"native",
    nativeCurrencyDecimals:Number.isInteger(entry?.nativeCurrency?.decimals)&&entry.nativeCurrency.decimals>=0&&entry.nativeCurrency.decimals<=36?entry.nativeCurrency.decimals:18,
    tokens:assets.filter(a=>a.canonical===key||a.representations.some(r=>r.chain===key))
  })).sort((a,b)=>a.key===HUB?-1:b.key===HUB?1:a.label.localeCompare(b.label));
  const chainKeys = new Set(chains.map(c=>c.key));
  const routes=[];
  for(const [assetId,entry] of Object.entries(catalog?.assets||{})){
    for(const item of entry?.routes?.routes||[]){
      const source=item?.sourceChain,destination=item?.destinationChain;
      // v3.1.5: every directed route touches XGRChain exactly once.
      if(!chainKeys.has(source)||!chainKeys.has(destination)||((source===HUB)===(destination===HUB)))continue;
      let active=false;
      try { active=isVerified(assetId,item.name)===true; } catch { active=false; }
      routes.push({assetId,name:item.name,source,destination,active});
    }
  }
  return {assets,chains,routes,hub:chains.find(c=>c.key===HUB)||null,deployments:deployedRoutes(catalog)};
}

export function previewRoute(model,source,destination,assetId){
  const available = new Set(model.chains.map(c=>c.key));
  const selected = model.assets.some(a=>a.id===assetId);
  if(!available.has(source)||!available.has(destination)||!selected||source===destination){
    return {path:[],hops:[],configured:false,active:false,reason:"Choose an asset and two different supported systems."};
  }
  const path=source===HUB||destination===HUB?[source,destination]:[source,HUB,destination];
  const hops=path.slice(1).map((to,i)=>model.routes.find(r=>r.assetId===assetId&&r.source===path[i]&&r.destination===to)||null);
  const configured=hops.every(Boolean);
  const active=configured&&hops.every(r=>r.active);
  const reason=!configured?"No complete directed route is configured for this asset.":!active?"Configured routes are not yet independently verified for delivery.":hops.length===2?"Two independent transfers are required; the second hop is not automated.":"A verified single-hop route is available.";
  return {path,hops,configured,active,reason};
}

function systemNode(system,style,selected,compact){
  const count=Math.min(system.tokens.length,3);
  return '<button type="button" class="ux-system'+(system.key===HUB?" ux-hub":"")+(system.key===selected?" is-selected":"")+'" '+
    'data-xita-system="'+esc(system.key)+'" aria-pressed="'+(system.key===selected)+'" '+
    'aria-label="Explore '+esc(system.label)+'" style="--ux-x:'+style.x+'%;--ux-y:'+style.y+'%">'+
    '<span class="ux-orbit" aria-hidden="true"><span class="ux-orbit-ring"></span><span class="ux-orbit-ring ring-2"></span>'+
    '<span class="ux-sun"></span>'+Array.from({length:count},(_,i)=>'<span class="ux-planet planet-'+(i+1)+'"></span>').join("")+
    '</span><span class="ux-system-name">'+esc(system.label)+'</span>'+
    (compact?"":'<span class="ux-system-sub">'+esc(system.nativeCurrency)+' · '+system.tokens.length+' asset'+(system.tokens.length===1?"":"s")+'</span>')+
    '</button>';
}

export function universeMap(model,selected,compact=false){
  const spokes=model.chains.filter(c=>c.key!==HUB).slice(0,POSITIONS.length);
  const hub=model.hub;
  const lanes=spokes.map((s,i)=>{
    const pos=POSITIONS[i], px=pos.x*10,py=pos.y*5.6;
    const bend=px<500?-48:48;
    const verified=model.routes.some(r=>r.active&&(r.source===s.key||r.destination===s.key));
    return '<path class="ux-lane'+(verified?" is-live":"")+'" d="M 500 280 Q '+(500+bend)+' '+((280+py)/2)+' '+px+' '+py+'" />';
  }).join("");
  return '<div class="ux-universe-map'+(compact?" is-compact":"")+'" role="group" aria-label="XITA chain universe and routes via XGRChain">'+
    '<span class="ux-map-grid" aria-hidden="true"></span><svg class="ux-lanes" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">'+lanes+'</svg>'+
    (hub?systemNode(hub,{x:50,y:50},selected,compact):"")+
    spokes.map((s,i)=>systemNode(s,POSITIONS[i],selected,compact)).join("")+
    '<div class="ux-map-legend">XGRChain is the mandatory transit hub · Dashed paths do not prove secure delivery</div></div>';
}

function systemDetails(model,selected,metrics=null){
  const system=model.chains.find(c=>c.key===selected)||model.hub||model.chains[0];
  if(!system)return '<p class="ux-muted">No configured chains found.</p>';
  const associated=model.routes.filter(r=>r.source===system.key||r.destination===system.key);
  const active=associated.filter(r=>r.active).length;
  const list=system.tokens.slice(0,5).map(t=>{const rep=representationFor(t,system.key);return '<a class="ux-asset" data-nav href="'+esc(tokenLink(t))+'"><span class="ux-dot"></span><span>'+esc(rep.symbol)+'</span><span class="ux-small">'+esc(rep.label)+'</span><span class="ux-arrow">↗</span></a>';}).join("");
  const marketRows=system.tokens.map(token=>{
   const facts=verifiedMetrics(metrics,token.id);
   const row=metrics?.assets?.[token.id];
   if(facts?.marketCapUsd===null||facts?.marketCapUsd===undefined||
      row?.market?.source!=="coingecko"||row.market.status!=="market-data")return "";
   const date=typeof row.market.asOf==="string"&&Number.isFinite(Date.parse(row.market.asOf))?
    new Date(row.market.asOf).toLocaleString("en-US",{timeZone:"UTC",dateStyle:"medium",timeStyle:"short"})+" UTC":"Time unavailable";
   return '<div class="ux-market-card"><span class="ux-kicker">'+esc(token.id)+' · COINGECKO</span>'+
    '<strong>'+esc(formatUsd(facts.marketCapUsd))+'</strong>'+
    '<span class="ux-small">Asset-wide market cap · not '+esc(system.label)+' TVL</span>'+
    '<span class="ux-small">Price: '+esc(formatUsd(row.market.priceUsd))+' · '+esc(date)+'</span></div>';
  }).filter(Boolean).join("");
  return '<div class="ux-panel-head"><span class="ux-kicker">Selected stellar system</span><span class="ux-label">'+(system.key===HUB?"Interchain hub":"Spoke network")+'</span></div>'+
    '<h3 class="ux-detail-name">'+esc(system.label)+'</h3><p class="ux-muted">'+(system.key===HUB?
    "XGRChain is the mandatory interchain transit point. Transfers between external systems require two independent route operations.":
    "This chain connects to the XGRChain hub through individually registered directed routes.")+'</p>'+
    '<div class="ux-keyvals"><div><span>Chain ID</span><strong>'+esc(valueOrDash(system.chainId))+'</strong></div>'+
    '<div><span>Native gas asset</span><strong>'+esc(system.nativeCurrency)+'</strong></div>'+
    '<div><span>Configured directed routes</span><strong>'+associated.length+'</strong></div>'+
    '<div><span>Verified active routes</span><strong>'+active+'</strong></div></div>'+
    (marketRows?'<h4>Market data</h4>'+marketRows:'')+
    '<h4>Tokens on this system</h4>'+(list||'<p class="ux-muted">No listed token representations yet.</p>')+
    (system.tokens.length>5?'<p class="ux-small">+'+(system.tokens.length-5)+' more tokens · <a data-nav href="/markets">Browse directory →</a></p>':"");
}
function chainOptions(model,selected){
  return model.chains.map(c=>'<option value="'+esc(c.key)+'"'+(c.key===selected?" selected":"")+'>'+esc(c.label)+'</option>').join("");
}
function assetOptions(model,selected){
  return model.assets.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===selected?" selected":"")+'>'+esc(a.name)+' ('+esc(a.id)+')</option>').join("");
}
function routePath(model,plan){
  if(!plan.path.length)return '<p class="ux-muted">Select different source and destination networks.</p>';
  const names=Object.fromEntries(model.chains.map(c=>[c.key,c.label]));
  return '<div class="ux-journey">'+plan.path.map((key,i)=>'<div class="ux-journey-stop'+(key===HUB?" stop-hub":"")+'">'+
    '<span class="ux-journey-planet"></span><strong>'+esc(names[key]||key)+'</strong>'+
    '<small>'+(i===0?"Origin":i===plan.path.length-1?"Destination":"Transit hub")+'</small></div>'+
    (i<plan.path.length-1?'<span class="ux-journey-line" aria-hidden="true">→</span>':"")).join("")+'</div>';
}
function metric(label,value,desc){
  return '<div class="ux-metric"><span class="ux-kicker">'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(desc)+'</small></div>';
}

// Read-only route preflight. A positive balance is not a gas cost estimate.
export function renderWalletGasChecklist(model,plan,wallet={}){
 if(!plan.path.length)return "";
 const byKey=Object.fromEntries(model.chains.map(c=>[c.key,c]));
 const keys=[...new Set(plan.path)];
 const connected=typeof wallet.account==="string"&&/^0x[0-9a-f]{40}$/i.test(wallet.account);
 const rows=keys.map((key,i)=>{
  const chain=byKey[key]||{},raw=wallet.balances?.[key],symbol=chain.nativeCurrency||"native";
  let status="unavailable",detail="Balance not checked";
  if(!connected)detail="Connect wallet to check";
  else if(wallet.loading){status="loading";detail="Checking native balance…"}
  else if(raw?.status==="ready" && /^\d+$/.test(String(raw.balanceWei))){
   const wei=BigInt(raw.balanceWei);
   const decimals=chain.nativeCurrencyDecimals??18,scale=10n**BigInt(decimals);
   const whole=wei/scale,part=decimals===0?"":(wei%scale).toString().padStart(decimals,"0").slice(0,8).replace(/0+$/,"");
   const fmt=whole.toString()+(part?"."+part:"");
   const label=wei>0n&&fmt==="0"&&decimals>8?"less than 0.00000001":fmt;
   status=wei===0n?"empty":"funded";
   detail=label+" "+symbol+(wei===0n?" · no gas funds":" · fee sufficiency not verified");
  }else if(connected)detail="Balance unavailable · RPC may block browser reads";
  return '<div class="ux-gas-check-row is-'+status+'" data-gas-chain="'+esc(key)+'">'+
   '<div><strong>'+esc(chain.label||key)+'</strong><small>'+
   esc(i===0?"First source":i===keys.length-1?"Final destination":"Transit hub & next source")+
   '</small></div><span>'+esc(detail)+'</span></div>';
 }).join("");
 const steps=plan.hops.flatMap((hop,i)=>{
  const from=byKey[plan.path[i]]||{},to=byKey[plan.path[i+1]]||{};
  return [
   '<li><strong>Send on '+esc(from.label||plan.path[i])+'</strong> · MetaMask confirms source transfer and pays '+esc(from.nativeCurrency||"native")+
   ' gas plus the on-chain validator fee. ERC-20 may need an approval first.</li>',
   '<li><strong>Receive on '+esc(to.label||plan.path[i+1])+'</strong> · wait for verified BLS proof, then pay '+esc(to.nativeCurrency||"native")+
   ' gas in MetaMask to call Mailbox.process().</li>'
  ];
 }).join("");
 return '<section class="ux-gas-check" aria-label="Wallet gas balance preflight">'+
  '<div class="ux-gas-check-heading"><strong>Wallet gas across the full journey</strong>'+
  (connected&&!wallet.hideGasRefresh?'<button type="button" data-xita-gas-refresh class="ux-gas-refresh"'+(wallet.loading?' disabled':'')+'>Refresh balances</button>':'')+'</div>'+
  (connected?'<p class="ux-small">Account '+esc(wallet.account.slice(0,6)+"…"+wallet.account.slice(-4))+
    ' · native balances checked via chain RPC; wallet stays on its current network.</p>':
    '<p class="ux-small">Connect Wallet to check source, transit and destination native balances.</p>')+
  '<div class="ux-gas-check-rows" aria-live="polite">'+rows+'</div>'+
  '<p class="ux-small">Positive balance does not mean enough gas. Exact transaction gas, validator fee, transferable amount and approvals must be simulated before sending. Checks are snapshots; never start without destination gas already available.</p>'+
  (wallet.hideStepList?'':('<div class="ux-gas-step-list"><strong>Planned MetaMask steps ('+(plan.hops.length*2)+' transactions)</strong>'+
  '<ol>'+steps+'</ol></div>'))+
  (!plan.active&&!wallet.hideInactiveNote?'<p class="ux-small">'+
    (plan.networkOnly?"This is a chain-only gas balance preview; no eligible token route is currently selected. ":
      "Route delivery not verified. ")+
    'No signing or sending is enabled.</p>':'')+
  '</section>';
}

// Token-first v3.1.5 bridge presentation. There is intentionally no transaction
// action until on-chain Registry/Router/Gateway pairs and the new ABI adapter
// are independently verified. Never reuse a legacy v3.1.4 Gateway call.
// A token detail is a discovery entry, NEVER a second transfer workflow.
export function renderTokenBridge(model,assetId){
 const token=model.assets.find(a=>a.id===assetId);
 if(!token)return "";
 const available=model.deployments.filter(r=>r.asset===assetId);
 return '<div class="ux-token-bridge"><div class="ux-kicker">XITA · TOKEN TRANSFER</div>'+
  '<h2>Transfer '+esc(token.name)+'</h2>'+
  '<p class="ux-muted">One transfer flow for every supported route. Your token is preselected on the transfer page.</p>'+
  '<p class="ux-small">'+available.length+' documented transfer direction'+(available.length===1?"":"s")+'</p>'+
  '<a class="ux-button" data-nav href="/transfer?token='+encodeURIComponent(assetId)+'">Transfer '+esc(assetId)+' →</a>'+
  '</div>';
}


function northstarStage(model,{universe=false}={}){
 const active=model.routes.filter(route=>route.active).length;
 const systems=model.chains.length;
 const introActions=universe?
  '<a data-nav class="ux-ns-primary" href="/markets">Explore tokens <span aria-hidden="true">↗</span></a>'+
  '<a data-nav class="ux-ns-secondary" href="/">Back to dashboard</a>':
  '<a data-nav class="ux-ns-primary" href="/transfer">Transfer Tokens <span aria-hidden="true">→</span></a>'+
  '<a data-nav class="ux-ns-secondary" href="/join">Join XITA <span aria-hidden="true">↗</span></a>';
 return '<div id="xita-3d" class="ux-3d-stage ux-ns-stage" data-northstar="1">'+
  '<canvas class="ux-3d-canvas" tabindex="0" aria-label="Interactive 3D universe with configured blockchain systems. Select a star to explore its tokens."></canvas>'+
  '<div class="ux-3d-labels"></div>'+
  '<div class="ux-ns-hero-copy"><div class="ux-ns-overline">XGR INTERCHAIN TOKEN ALLIANCE</div>'+
  '<h1>Explore the <em>Universe.</em></h1>'+
  '<p class="ux-ns-promise">Move tokens between worlds.<span>Bring your token to new chains.</span></p>'+
  '<p class="ux-ns-subline">Discover interconnected blockchain ecosystems. Bring your project to XITA or explore verified token routes through XGRChain.</p>'+
  '<div class="ux-ns-actions">'+introActions+'</div>'+
  '<div class="ux-ns-signature"><span class="ux-ns-signature-mark" aria-hidden="true">✧</span><span>ONE HUB · MANY ECOSYSTEMS<br>AN OPEN INTERCHAIN FUTURE</span></div></div>'+
  '<div class="ux-ns-network-status"><span class="ux-ns-overline">NETWORK INVENTORY</span>'+
  '<strong>'+systems+' configured systems</strong>'+
  '<small>'+active+' verified active directed routes</small>'+
  '<small class="ux-ns-network-note">Topology preview · no simulated activity</small></div>'+
  '<div class="ux-3d-controls" aria-label="Universe navigation"><button type="button" data-cosmos-action="home" aria-label="Reset to XGRChain hub">◎ XGR Hub</button></div>'+
  '<div class="ux-3d-focus" aria-live="polite"><div class="ux-kicker">EXPLORING SYSTEM</div><h3 class="ux-3d-focus-title"></h3>'+
  '<p class="ux-3d-focus-count"></p><div class="ux-3d-asset-links"></div></div>'+
  '<div class="ux-3d-hint">Drag to orbit · Scroll to zoom · Select a star to explore tokens · Home to reset</div>'+
  '<div class="ux-3d-status">XGR gateway · configured routes only</div></div>';
}


function northstarCards(model,metrics=null){
 const active=model.routes.filter(r=>r.active).length;
 const rows=model.chains;
 return '<section class="ux-ns-deck ux-ns-overview-deck" aria-label="XITA network overview">'+
  '<article class="ux-ns-card ux-ns-card-systems"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">◎</span><h2>Supported systems</h2><span class="ux-ns-card-count">'+rows.length+'</span></div>'+
  '<div class="ux-ns-system-list">'+rows.map(c=>'<button type="button" class="ux-ns-system-row" data-xita-system="'+esc(c.key)+'">'+
    '<span class="ux-ns-orb '+(c.key===HUB?"is-hub":"is-"+esc(c.key))+'"></span>'+
    '<strong>'+esc(c.label)+'</strong><small>'+(c.key===HUB?"Interchain hub":"Configured network")+'</small>'+
    '<span class="ux-ns-system-tag">'+(c.key===HUB?"Hub":"Configured")+'</span></button>').join("")+'</div></article>'+
  '<article class="ux-ns-card ux-ns-network-card"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">↗</span><h2>Interchain network</h2><span class="ux-ns-pill">XGR HUB</span></div>'+
   '<div class="ux-ns-network-numbers"><div><strong>'+model.routes.length+'</strong><span>Configured directions</span></div><div><strong>'+active+'</strong><span>Verified active</span></div></div>'+
   '<p class="ux-small">Routes connect to XGRChain. A configured route is not automatically safe to use.</p>'+
   '<a class="ux-ns-card-link" data-nav href="/transfer">Check route availability →</a></article>'+
  '<article class="ux-ns-card ux-ns-card-tvl"><div class="ux-ns-card-head"><span class="ux-ns-card-icon is-gold">✦</span><h2>Locked TVL</h2></div>'+
   '<strong class="ux-ns-value">'+esc(formatUsd(metrics?.totals?.lockedUsd))+'</strong>'+
   '<p class="ux-small">Verified net collateral held in route-specific escrows.</p>'+
   '<span class="ux-ns-evidence"> '+(metrics?.totals?.lockedUsd==null?"Awaiting complete verified evidence":"Verified on-chain evidence")+'</span></article>'+
  '<article class="ux-ns-card ux-ns-card-moved"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">⇄</span><h2>Moved via XGR</h2></div>'+
   '<strong class="ux-ns-value">'+esc(formatUsd(metrics?.totals?.movedUsd))+'</strong>'+
   '<p class="ux-small">Cumulative completed interchain journey value, counted once per journey.</p>'+
   '<span class="ux-ns-evidence">'+(metrics?.totals?.movedUsd==null?"Awaiting complete verified evidence":"Verified on-chain evidence")+'</span></article></section>';
}
function allianceIntro(){
 return '<section class="ux-alliance-intro" id="about-xita"><div class="ux-alliance-heading"><span class="ux-kicker">THE ALLIANCE BEHIND THE UNIVERSE</span>'+
  '<h2>XGR Interchain <em>Token Alliance.</em></h2>'+
  '<p>Bring your token into new blockchain ecosystems with XITA. Apply to the Alliance, get your project reviewed and let XGR sponsor the complete deployment of approved interchain routes. Once independently verified net locked value meets the configured threshold, the token is publicly discoverable while its collateral remains eligible.</p>'+
  '<div class="ux-alliance-pillars"><span>XGRChain v3.x hub</span><span>PoS validator security</span><span>XGR-sponsored route deployment</span><span>Interchain Token Alliance</span></div></div>'+
  '<div class="ux-alliance-audiences">'+
  '<article class="ux-alliance-audience ux-alliance-audience-holders">'+
  '<div class="ux-alliance-symbol">◈</div><span class="ux-kicker">FOR TOKEN HOLDERS</span>'+
  '<h3>Move tokens between worlds.</h3>'+
  '<p>Find token representations across supported chains, inspect their routes and move assets only when the relevant bridge contracts are independently verified and active.</p>'+
  '<div class="ux-alliance-steps" aria-label="How token holders use XITA">'+
  '<span><small>01</small>Discover your token</span>'+
  '<span><small>02</small>Check route availability</span>'+
  '<span><small>03</small>Transfer when verified</span></div>'+
  '<a data-nav href="/transfer">Transfer Tokens <span aria-hidden="true">↗</span></a></article>'+
  '<article class="ux-alliance-audience ux-alliance-audience-projects">'+
  '<div class="ux-alliance-symbol is-gold">✧</div><span class="ux-kicker">FOR TOKEN PROJECTS</span>'+
  '<h3>Bring your token to new chains.</h3>'+
  '<p>Reach new communities without bearing the contract deployment costs for an approved route. Apply to the Alliance, pass the XGR project review and have XGR fund and arrange the deployment. Once verified net locked collateral reaches the configured threshold, the token appears publicly until the value falls below it.</p>'+
  '<div class="ux-alliance-steps" aria-label="How projects participate in XITA">'+
  '<span><small>01</small>Apply and pass project review</span>'+
  '<span><small>02</small>XGR sponsors route deployment</span>'+
  '<span><small>03</small>Qualifying locked value → public listing</span></div>'+
  '<a data-nav href="/join">Bring Your Token <span aria-hidden="true">↗</span></a></article>'+
  '</div></section>';
}
// UI-only top ten: only public assets and independently sourced market caps.
export function dashboardMarketRows(catalog,metrics){
 const rows=buildLeaderboardRows(catalog,metrics).filter(row=>row.marketCapUsd!==null);
 return rankAssets(rows,"marketCapUsd","desc").slice(0,10);
}
function dashboardTopTokens(catalog,metrics){
 const rows=dashboardMarketRows(catalog,metrics);
 return '<section class="ux-dashboard-ranking" id="top-tokens"><div class="ux-dashboard-ranking-head"><div><span class="ux-kicker">ASSET DISCOVERY · SOURCED MARKETS</span>'+
  '<h2>Top Tokens <em>by Market Cap</em></h2><p>Up to ten publicly listed assets, ranked only when independent market data is available. Market cap is not bridge TVL.</p></div>'+
  '<a data-nav href="/markets">Browse tokens ↗</a></div>'+
  (rows.length?'<div class="ux-dashboard-token-table"><div class="ux-dashboard-token-header"><span>Rank / asset</span><span>Market capitalization</span></div>'+
   rows.map((row,i)=>'<a data-nav class="ux-dashboard-token-row" href="/token/'+encodeURIComponent(row.slug)+'"><span class="ux-dashboard-token-name">'+
    '<span class="ux-dashboard-token-rank">'+String(i+1).padStart(2,"0")+'</span><span class="ux-token-sphere" aria-hidden="true"></span><span><strong>'+esc(row.name)+'</strong><small>'+esc(row.id)+'</small></span></span>'+
    '<strong class="ux-dashboard-token-cap">'+esc(formatUsd(row.marketCapUsd))+'</strong></a>').join("")+'</div>':
    '<div class="ux-dashboard-empty"><span class="ux-kicker">MARKET RANKING PENDING</span><strong>No sourced market capitalizations yet.</strong>'+
    '<p>Tokens will be ranked here when public listings and independent market data are available. No estimated values are displayed.</p></div>')+
  '<p class="ux-small ux-dashboard-source">Ranking: published assets only · Market prices from eligible external sources · Transfer and TVL metrics require finalized on-chain evidence.</p></section>';
}
export function renderDashboard(model,selection={},apiState="not-deployed",metrics=null,catalog=null){
 return '<div class="ux-app ux-dashboard ux-northstar-page">'+
  northstarStage(model)+northstarCards(model,metrics)+allianceIntro()+
  dashboardTopTokens(catalog||{assets:{}},metrics)+
  '<section class="ux-dashboard-outro"><div><span class="ux-kicker">DISCOVER · CONNECT · EXPAND</span>'+
  '<h2>Explore the XITA ecosystem</h2><p>Learn how the protocol works or inspect a token route before transferring any value.</p></div>'+
  '<div class="ux-dashboard-outro-links"><a data-nav href="/faq">Read the FAQ →</a><a data-nav href="/transfer">Transfer Tokens →</a></div></section></div>';
}
// A real standalone planner; no longer extracted from dashboard markup.
export function renderPlanRoute(model,selection={},apiState="not-deployed",wallet={},progress={}){
 const routes=model.deployments||[];
 const available=new Set(routes.flatMap(r=>[r.source,r.destination]));
 const deployedChains=model.chains.filter(c=>available.has(c.key));
 const deployedAssets=new Set(routes.map(r=>r.asset));
 const usableAssets=model.assets.filter(a=>deployedAssets.has(a.id));
 const openChoice=openWalletTransfers(progress.items,wallet.account);
 const currentWork=selectedRecovery(progress.items,wallet.account,progress.selectedTxHash);
 const requestedOrigin=currentWork?.sourceChain||selection.origin;
 const requestedDestination=currentWork?.destinationChain||selection.destination;
 const requestedAsset=currentWork?.asset||selection.asset;
 const origin=available.has(requestedOrigin)?requestedOrigin:
   deployedChains.some(c=>c.key===HUB)?HUB:deployedChains[0]?.key||"";
 const destination=available.has(requestedDestination)&&requestedDestination!==origin?
   requestedDestination:deployedChains.find(c=>c.key!==origin)?.key||"";
 const assetId=usableAssets.some(a=>a.id===requestedAsset)?
   requestedAsset:usableAssets[0]?.id||"";
 const path=previewRoute(model,origin,destination,assetId);
 const deployed=path.path.length>1&&path.hops.every((h,i)=>
   routes.some(r=>r.asset===assetId&&r.source===path.path[i]&&
     r.destination===path.path[i+1]));
 const pending=openChoice;
 const active=currentWork;
 const connected=typeof wallet.account==="string"&&/^0x[0-9a-f]{40}$/i.test(wallet.account);
 const selected=active&&active.account?.toLowerCase()===wallet.account?.toLowerCase()?active:null;
 const busy=progress.busy===true;
 const amount=/^(?:\d+)?(?:\.\d*)?$/.test(selection.amount||"")?selection.amount||"":"";
 const isDirect=path.path.length===2;
 const actionLabel=!connected?"Connect wallet to transfer":
  busy?"Preparing transaction…":
  selected?.status==="awaiting-proof"?"Continue delivery":
  selected?"Check delivery status":
  !deployed?"Route unavailable":
  !isDirect?"Select the first hop via XGRChain":
  "Transfer "+assetId+" → "+(model.chains.find(c=>c.key===destination)?.label||destination);
 const buttonDisabled=busy||connected&&(!deployed&&!selected||!isDirect&&!selected);
 const progressValue=selected?.confirmed?1:0;
 const statusLabel=selected?.status==="awaiting-proof"?"Source confirmed · destination not delivered":
  selected?.status==="delivery-unknown"?"Source confirmed · destination RPC unavailable":
  selected?.status==="confirming"?"Source transaction is awaiting finality":
  selected?.status==="pending-source"?"Source transaction pending":
  selected?.status==="destination-not-deployed"?"Destination Mailbox unavailable":
  connected?"Ready to prepare a new transfer":
  "Connect your wallet to check balances";
 const formatTokenBalance=(balance)=>{
  if(balance?.status!=="ready"||!/^\d+$/.test(balance.balanceRaw||""))return "Unavailable";
  const scale=10n**BigInt(balance.decimals||0),raw=BigInt(balance.balanceRaw);
  const full=(raw/scale).toString(),remainder=(raw%scale).toString()
   .padStart(balance.decimals||0,"0").slice(0,8).replace(/0+$/,"");
  return full+(remainder?"."+remainder:"")+" "+(balance.symbol||assetId);
 };
 const sourceBalance=wallet.tokenBalances?.[assetId+":"+origin];
 const sourceTokenAmount=wallet.loading?"Checking balance…":
  connected?formatTokenBalance(sourceBalance):"Connect wallet to see balance";
 const originLabel=model.chains.find(c=>c.key===origin)?.label||origin;
 const activeLabel=selected?'<span class="ux-kicker">UNFINISHED ON-CHAIN TRANSFER</span>':'';
 const options=pending.map(r=>'<option value="'+esc(r.txHash)+'"'+
  (selected?.txHash===r.txHash?' selected':'')+'>'+
   esc((r.asset||"Token")+' · '+r.sourceChain+' → '+r.destinationChain+' · '+r.txHash.slice(0,10)+'…')+
  '</option>').join("");
 return '<div class="ux-app ux-plan-page ux-northstar-page">'+
  '<section class="ux-ns-operations" id="ux-journey-planner"><div class="ux-ns-ops-intro">'+
  '<span class="ux-kicker">XITA · INTERCHAIN TRANSFERS</span><h1>Transfer Tokens</h1>'+
  '<p class="ux-muted">Move your tokens between supported networks using your own wallet.</p></div>'+
  '<div class="ux-ns-operations-grid"><section class="ux-panel ux-route-panel">'+
  '<div class="ux-panel-head"><span class="ux-kicker">TRANSFER</span><span class="ux-label">XGR HUB</span></div>'+
  '<div class="ux-transfer-fields">'+
  '<div class="ux-transfer-field"><label class="ux-field" for="ux-asset">Token</label><select id="ux-asset"'+(selected?' disabled':'')+'>'+
  assetOptions({assets:usableAssets},assetId)+'</select></div>'+
  '<div class="ux-transfer-network-fields"><div class="ux-transfer-field"><label class="ux-field" for="ux-origin">From</label><select id="ux-origin"'+(selected?' disabled':'')+'>'+
  chainOptions({chains:deployedChains},origin)+'</select></div>'+
  '<div class="ux-transfer-direction" aria-hidden="true">→</div>'+
  '<div class="ux-transfer-field"><label class="ux-field" for="ux-destination">To</label><select id="ux-destination"'+(selected?' disabled':'')+'>'+
  chainOptions({chains:deployedChains},destination)+'</select></div></div>'+
  '<div class="ux-transfer-field"><label class="ux-field" for="ux-transfer-amount">Amount ('+esc(assetId)+')</label>'+
  '<input type="text" id="ux-transfer-amount" inputmode="decimal" autocomplete="off" placeholder="'+
  (selected?'Original amount already locked/burned':'0.0')+'" value="'+(selected?'':esc(amount))+
  '"'+(selected?' readonly':'')+'>'+
  '<div class="ux-transfer-available" aria-live="polite"><span>Available on '+esc(originLabel)+'</span><strong>'+
  esc(sourceTokenAmount)+'</strong></div></div></div>'+
  (pending.length?'<div class="ux-transfer-outstanding">'+activeLabel+
   '<label class="ux-field" for="xita-open-transfer">Previous transfers awaiting delivery ('+pending.length+')</label>'+
   '<select id="xita-open-transfer"><option value=""'+(!selected?' selected':'')+'>New transfer</option>'+options+'</select>'+
   '<p class="ux-small">Older deliveries are optional to continue here. They do not disable a new transfer. The original source lock is never repeated.</p></div>':'')+
  '<div class="ux-transfer-action"><button type="button" class="ux-button" id="xita-transfer-primary"'+
   (buttonDisabled?' disabled':'')+'>'+esc(actionLabel)+'</button>'+
  '<p class="ux-transfer-action-hint">'+
  esc(!connected?"Connect your wallet to check the route and make a transfer.":
   selected?"Existing source transfer selected; the original lock will not be repeated.":
   busy?"Checking the selected transaction against the blockchain.":
   deployed&&isDirect?"Gas and contract checks run before MetaMask asks you to sign.":
   "Only verified deployed routes can be transferred.")+'</p></div>'+
  '<section class="ux-transfer-progress" role="status" aria-live="polite">'+
  '<strong>'+esc(selected?"1 / 2 · "+statusLabel:
   deployed?"Ready · "+statusLabel:"Route not available from this site's deployment catalog")+'</strong>'+
  '<progress max="2" value="'+progressValue+'"></progress>'+
  (selected?'<p class="ux-small">Source TX: <code>'+esc(selected.txHash)+'</code>'+
   (selected.messageId?' · Message ID: <code>'+esc(selected.messageId)+'</code>':'')+'</p>':'')+
  (progress.notice&&(!progress.scanning||progress.busy)?'<p class="ux-transfer-notice">'+esc(progress.notice)+'</p>':'')+
  (progress.error?'<p class="ux-transfer-error">'+esc(progress.error)+'</p>':'')+
  '</section>'+
  '<details class="ux-transfer-advanced"><summary>Route, network gas &amp; safety checks <span aria-hidden="true">⌄</span></summary>'+
  '<div class="ux-transfer-advanced-body">'+routePath(model,path)+
  '<div class="ux-route-status">'+
  (deployed?'<span class="ux-badge is-verified">Contracts deployed</span>':
   '<span class="ux-badge is-pending">Route unavailable</span>')+
  '<p>'+(deployed?"The source and destination contract addresses are documented. Their live bindings, fees and gas requirements are checked again before signing.":
    "A documented, direct route is required before signing.")+'</p></div>'+
  renderWalletGasChecklist(model,path,{...wallet,hideStepList:true,hideInactiveNote:deployed})+
  '</div></details>'+
  '<p class="ux-transfer-footer-note">A direct transfer uses source Gateway.bridge and destination Mailbox.process. A separate ERC-20 approval may be required. A confirmed source lock is never repeated.</p>'+
  (!deployed&&model.routes.some(r=>r.assetId==="XGR"&&r.source==="xgrchain"&&r.destination==="base")?
   '<p class="ux-transfer-error">The downloaded site catalog has an XGR/Base route configured but lacks a complete deployment record. No transaction is allowed. Verify the published catalog.json against the current GitHub main.</p>':'')+
  (!isDirect&&deployed?'<p class="ux-small">A two-hop route is processed in two separate direct hops through XGRChain. No automatic onward transfer is assumed.</p>':'')+
  (connected?'<p class="ux-small">Past transfers and outstanding delivery proofs: <a data-nav href="/my-transfers">My Transfers</a>. History indexing does not block a new transaction.</p>':"")+
  '</section><aside class="ux-panel ux-ns-operations-data">'+
  '<span class="ux-kicker">NETWORK STATUS</span><h2>Available networks</h2>'+
  '<div class="ux-ns-facts"><div><span>Deployed systems</span><strong>'+
   deployedChains.length+'</strong></div><div><span>Deployed directed routes</span><strong>'+routes.length+'</strong></div></div>'+
  '<div class="ux-transfer-explainer"><strong>How your transfer works</strong><ol><li>Check balances, route contracts and fees before signing.</li><li>Lock or burn on the source chain, once.</li><li>After validator proof, confirm delivery on the destination chain.</li></ol><p>Each step is confirmed in your own wallet. No XITA custody or private keys.</p></div>'+
  '</aside></div>'+ 
  '<section class="ux-risk-disclosure" aria-label="Transfer custody and risk information"><strong>Self-custody · Public smart contracts · Your responsibility</strong><p>XGR.Network GmbH provides this web interface only. It does not take custody through the interface, manage your wallet, or receive private keys. All transactions are authorized directly in your wallet and executed by public smart contracts, which can hold locked collateral during a transfer. Smart-contract vulnerabilities, network disruption, delayed delivery, fees and loss of funds are risks. Use at your own risk. Successful delivery is not guaranteed; statutory rights remain unaffected.</p></section>'+
  '</section></div>';
}

const faqGroups=[
 {label:"01 · THE OPPORTUNITY",title:"Why XITA?",items:[
  ["What is XITA?","The XGR Interchain Token Alliance helps token projects expand to additional blockchain ecosystems and reach new communities. Projects apply for admission; after a positive XGR review, XGR sponsors and arranges the approved route deployment. A token is publicly discoverable only while independently verified net locked value meets the configured USD-equivalent threshold."],
  ["Why bring a token to more blockchains?","Different chains have different communities and applications. Connecting your token to additional networks can make it accessible to more people, without replacing its original contract. New users, liquidity and demand are opportunities, not guarantees."],
  ["What can token holders do?","Explore publicly listed tokens, discover their supported networks and inspect verified transfer routes. Actual bridging is available only when the required contracts and route checks are complete."],
  ["What makes XITA different?","XITA offers more than an application directory or a bridge interface. Accepted projects receive XGR-sponsored deployment of their approved interchain routes. The public token listing follows a successful first real transfer, so projects become visible after demonstrating a working connection."]
 ]},
 {label:"02 · TOKEN PROJECTS",title:"Join the Token Alliance",items:[
  ["Why should my project join XITA?","Reach additional blockchain communities while XGR covers the complete smart-contract deployment costs for your approved interchain route. The Alliance offers a clear onboarding and review process. Public discovery is derived automatically from current verified net locked collateral and the configured global threshold."],
  ["How does the application process work?","Start with Bring Your Token and provide your project information, original token contract and desired networks. The application must then be submitted for XGR's review. A prepared draft or successful form validation is not yet an approved or submitted application."],
  ["What happens after my project is approved?","XGR arranges and fully sponsors the deployment of the accepted route, including its required smart contracts. The team then completes the necessary contract and route verification before enabling live transfers. There is no public token listing merely for passing review."],
  ["When does my token appear on XITA?","Once net locked collateral is independently verified at or above the configured threshold, the token enters public discovery. Unlocking below the threshold hides it again. An application, positive review or contract deployment on its own is not enough."],
  ["Is the route deployment free for accepted projects?","Yes. XGR sponsors the complete deployment of approved routes under the XITA Alliance program. This does not mean that later end-user transfers are gas-free: normal blockchain gas and applicable validator fees are separate."],
  ["Does XITA provide DEX liquidity or exchange listings?","No. XGR sponsors the approved route deployment and publishes the token on XITA while its verified locked value meets the public threshold. That is not a centralized-exchange listing, automatic DEX liquidity, market making or guaranteed trading volume."],
  ["Can my project expand to more networks later?","You can request additional supported networks through the Alliance review process. Accepted additional routes follow the same XGR-sponsored deployment, verification and real-transfer milestones."]
 ]},
 {label:"03 · TOKEN HOLDERS",title:"Explore and Move Tokens",items:[
  ["Can I move tokens between different worlds?","Yes, when the relevant routes have been deployed, verified and activated. Use the token page to inspect what is actually available. A chain drawn in the Universe does not mean that transfers are already live."],
  ["How do transfers between two external chains work?","XGRChain acts as the hub. A journey from one external chain to another requires two separate transfers: first to XGRChain, then to the destination network. The second step is not automatically executed."],
  ["What is a wrapped token?","A wrapped or synthetic representation makes an asset usable on a second chain. It is not the original token on its home network; always check its canonical origin and verified contracts."],
  ["What happens if a relayer is unavailable?","A relayer can be replaced. An interrupted transfer may remain pending until delivery is resumed or recovered. Use the verified transaction and message status rather than assuming an automatic refund."],
  ["What does a transfer cost?","XGR sponsors approved route deployment, not user transaction gas. Each directed hop requires source-chain gas, the applicable source-native validator fee, and destination-chain gas for a separate wallet-confirmed Mailbox.process delivery. A two-hop trip requires four payments (plus possible ERC-20 approvals). Check both native gas balances before bridging; Starter Gas is not available yet."]
 ]},
 {label:"04 · TRUST & TRANSPARENCY",title:"Security and Network Facts",items:[
  ["Who secures interchain transfers?","XGRChain's Proof-of-Stake validators secure cross-chain message verification. The XGRChain v3.x network and its interchain smart contracts provide the underlying infrastructure."],
  ["Does a configured route mean I can bridge?","No. A configured route is not automatically available. The contract deployments and counterpart registrations must be independently verified before the portal enables real transfers."],
  ["Why is a project not immediately listed after approval?","XITA distinguishes an accepted application from a functioning live integration. XGR first deploys the approved route; only while independently verified net locked value meets the global threshold does the project appear publicly."],
  ["What are Locked TVL and Moved via XGR?","Locked TVL is verified collateral in bridge escrows. Moved via XGR measures completed interchain journey volume without counting two-hop transfers twice. Missing evidence is not displayed as zero."],
  ["Is market capitalization the same as bridge liquidity?","No. Market capitalization comes from sourced market data and reflects the asset's broader value. It is not the amount locked in XITA and is not evidence that a bridge route is active."]
 ]}
];
export function renderFAQ(){
 return '<div class="ux-app ux-faq-page"><div class="ux-kicker">XGR INTERCHAIN TOKEN ALLIANCE · KNOWLEDGE BASE</div>'+
  '<h1>Understand XITA.</h1><p class="ux-lead">See how projects apply, what XGR sponsors, when a token is listed and how holders can use verified interchain routes.</p>'+
  '<div class="ux-faq-groups">'+faqGroups.map(group=>
    '<section class="ux-faq-group"><div class="ux-faq-group-head"><span class="ux-kicker">'+esc(group.label)+'</span><h2>'+esc(group.title)+'</h2></div>'+
    '<div class="ux-faq-list">'+group.items.map(([q,answer])=>
      '<details class="ux-faq-item"><summary>'+esc(q)+'</summary><p>'+esc(answer)+'</p></details>').join("")+'</div></section>').join("")+'</div>'+
  '<div class="ux-faq-footer"><a class="ux-ns-primary" data-nav href="/transfer">Transfer Tokens →</a>'+
  '<a class="ux-ns-secondary" data-nav href="/join">Join the Alliance ↗</a></div></div>';
}
export function renderUniverse(model,selected=HUB,metrics=null){
 const active=model.routes.filter(r=>r.active).length;
 return '<div class="ux-app ux-universe-page ux-northstar-page">'+northstarStage(model,{universe:true})+
  '<div class="ux-ns-universe-intro"><span class="ux-kicker">EXPLORE THE XITA NETWORK</span>'+
  '<strong>'+model.chains.length+' configured systems · '+active+' verified active directed routes</strong>'+
  '<span>Choose a planet to focus a chain, then select a listed token to open its bridge page.</span></div>'+
  '<div class="ux-ns-universe-grid"><section class="ux-panel ux-ns-worlds"><div class="ux-panel-head"><div>'+
  '<span class="ux-kicker">SYSTEM DISCOVERY</span><h2>Explore configured worlds</h2></div></div>'+
  '<p class="ux-muted">XGRChain is the hub. Spoke-to-spoke journeys require two independent routes; dashed lines do not indicate live transfers.</p>'+
  '<div class="ux-universe-directory">'+model.chains.map(c=>
   '<button type="button" data-xita-system="'+esc(c.key)+'" class="ux-directory-item'+(selected===c.key?" is-selected":"")+'">'+
   '<span class="ux-chain-symbol'+(c.key===HUB?" is-hub":"")+'"></span>'+
   '<strong>'+esc(c.label)+'</strong><small>'+c.tokens.length+' listed assets</small><span>Explore ↗</span></button>').join("")+'</div></section>'+
  '<aside class="ux-panel ux-details" id="ux-selected-details" aria-live="polite">'+
   systemDetails(model,selected,metrics)+'</aside></div></div>';
}
export function renderRoutes(model){
  return '<div class="ux-app ux-routes-page"><div class="ux-kicker">XITA · VERIFIED NETWORK INVENTORY</div><h1>Directed <span>Routes</span></h1>'+
    '<p class="ux-lead">Every route has XGRChain as exactly one endpoint. A cross-spoke journey requires two independently verified directed routes.</p>'+
    '<div class="ux-metrics">'+metric("Configured routes",String(model.routes.length),"Inventory, not proof of delivery")+
    metric("Verified active",String(model.routes.filter(r=>r.active).length),"Fail-closed verified route state")+
    metric("Network hub","XGRChain","EVM chain and domain 1643")+'</div>'+
    '<div class="ux-panel"><div class="ux-panel-head"><h2>Route inventory</h2><span class="ux-label">Deployment required for transfer</span></div>'+
    '<div class="ux-routes-table"><div class="ux-table-head"><span>Asset</span><span>Source</span><span>Destination</span><span>Verification</span><span>Token</span></div>'+
    model.routes.map(r=>'<div class="ux-table-row"><strong>'+esc(r.assetId)+'</strong><span>'+esc(model.chains.find(c=>c.key===r.source)?.label||r.source)+'</span>'+
    '<span>'+esc(model.chains.find(c=>c.key===r.destination)?.label||r.destination)+'</span>'+pill(r.active)+
    '<a data-nav href="'+esc(tokenLink(model.assets.find(a=>a.id===r.assetId)||{slug:r.assetId.toLowerCase()}))+'">Details ↗</a></div>').join("")+
    (model.routes.length?"":'<p class="ux-muted">No configured routes.</p>')+'</div></div>'+
    '<p class="ux-small">Alliance projects start with an application and XGR review. For accepted projects, XGR sponsors and arranges the deployment of approved routes; transfer availability still depends on verified contracts. Tokens become publicly listed after the first confirmed real transfer.</p></div>';
}
