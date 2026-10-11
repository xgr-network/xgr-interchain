import {representationFor} from "./token-representation.js";
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
  return {assets,chains,routes,hub:chains.find(c=>c.key===HUB)||null};
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

// Token-first v3.1.5 bridge presentation. There is intentionally no transaction
// action until on-chain Registry/Router/Gateway pairs and the new ABI adapter
// are independently verified. Never reuse a legacy v3.1.4 Gateway call.
export function renderTokenBridge(model,assetId,selection={},wallet={}){
  const token=model.assets.find(a=>a.id===assetId);
  if(!token)return '<div class="ux-panel"><h2>Token unavailable</h2></div>';
  const supported=model.chains.filter(c=>c.tokens.some(t=>t.id===assetId));
  const origin=supported.some(c=>c.key===selection.origin)?selection.origin:token.canonical;
  const destination=supported.some(c=>c.key===selection.destination&&c.key!==origin)?
    selection.destination:supported.find(c=>c.key!==origin)?.key||origin;
  const plan=previewRoute(model,origin,destination,assetId);
  const originChain=model.chains.find(c=>c.key===origin);
  const walletOnSource=Boolean(wallet.account&&Number(wallet.chainId)===Number(originChain?.chainId));
  const walletChain=model.chains.find(c=>Number(c.chainId)===Number(wallet.chainId));
  const sourceName=originChain?.label||origin;
  const amount=/^(?:\d+)?(?:\.\d*)?$/.test(selection.amount||"")?selection.amount||"":"";
  return '<div class="ux-token-bridge" id="token-bridge"><div class="ux-kicker">XITA v3.1.5 · Token-specific bridge</div>'+
    '<h2>Bridge '+esc(token.name)+'</h2>'+
    '<p class="ux-muted">The bridge for this asset belongs here. The Universe is a way to discover chains, select tokens and arrive at their transfer page.</p>'+
    '<label class="ux-field" for="ux-token-origin">Origin chain</label>'+
    '<select id="ux-token-origin">'+chainOptions({chains:supported},origin)+'</select>'+
    '<label class="ux-field" for="ux-token-destination">Destination chain</label>'+
    '<select id="ux-token-destination">'+chainOptions({chains:supported},destination)+'</select>'+
    '<div class="ux-divider"></div><span class="ux-kicker">Interchain route</span>'+
    routePath(model,plan)+
    '<div class="ux-route-status">'+pill(false)+'<p>'+esc(plan.reason)+'</p></div>'+
    (plan.path.length===3?'<p class="ux-small">Spoke-to-spoke is two independent source transactions with XGRChain as a real intermediate chain. A second hop is NOT automatically sponsored or executed.</p>':
    '<p class="ux-small">A direct route is allowed only when one endpoint is XGRChain (chain ID/domain 1643).</p>')+
    '<div class="ux-hop-detail"><span class="ux-kicker">Directed hops</span>'+
    (plan.hops.length?plan.hops.map((r,i)=>'<div class="ux-hop"><strong>'+esc(model.chains.find(c=>c.key===plan.path[i])?.label||plan.path[i])+
      ' → '+esc(model.chains.find(c=>c.key===plan.path[i+1])?.label||plan.path[i+1])+'</strong>'+
      '<span>'+(r?"Configured · delivery unverified":"Route not configured")+'</span></div>').join(""):'<p class="ux-small">No valid path.</p>')+'</div>'+
    '<label class="ux-field" for="ux-token-amount">Amount ('+esc(assetId)+')</label>'+
    '<input id="ux-token-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.0" value="'+esc(amount)+'">'+
    '<div class="ux-wallet-gas"><strong>Wallet & gas</strong>'+
    (wallet.account?
      '<span>'+esc(wallet.account.slice(0,6)+"…"+wallet.account.slice(-4))+'</span>'+
      '<p class="ux-small">'+(walletOnSource?
        'Origin gas balance: '+esc(wallet.nativeBalance??"—")+' '+esc(originChain?.nativeCurrency??"")+' ('+esc(sourceName)+')':
        'Wallet network: '+esc(walletChain?.label||"unknown")+'. Switch to '+esc(sourceName)+' in your wallet before a future source transfer.')+'</p>':
      '<p class="ux-small">Connect an EVM wallet to view its native gas balance on the selected origin chain.</p>')+
    '</div>'+
    '<div class="ux-route-status"><p><strong>Transfer execution unavailable.</strong> This release has no verified v3.1.5 Gateway adapter or active reciprocal route pair. No fees, quotes or destination deliveries are invented.</p></div>'+
    '<button type="button" disabled class="ux-button ux-disabled">Bridge unavailable · awaiting verified deployment</button>'+
    '<p class="ux-small">When the v3.1.5 flow is implemented, a quote must use the new source-chain Registry fee, checked Router/Gateway bindings and a verified reciprocal contract bindings and message-specific BLS. The old bridge is retired.</p></div>';
}


function northstarStage(model,{universe=false}={}){
 const active=model.routes.filter(route=>route.active).length;
 const systems=model.chains.length;
 const introActions=universe?
  '<a data-nav class="ux-ns-primary" href="/markets">Explore tokens <span aria-hidden="true">↗</span></a>'+
  '<a data-nav class="ux-ns-secondary" href="/">Back to dashboard</a>':
  '<a data-nav class="ux-ns-primary" href="/#xita-3d">Explore Universe <span aria-hidden="true">→</span></a>'+
  '<a class="ux-ns-secondary" href="/plan-route">Plan a route</a>';
 return '<div id="xita-3d" class="ux-3d-stage ux-ns-stage" data-northstar="1">'+
  '<canvas class="ux-3d-canvas" tabindex="0" aria-label="Interactive 3D universe with configured blockchain systems. Select a star to explore its tokens."></canvas>'+
  '<div class="ux-3d-labels"></div>'+
  '<div class="ux-ns-hero-copy"><div class="ux-ns-overline">INTERCONNECTED WORLDS</div>'+
  '<h1>The XITA <em>Universe</em></h1>'+
  '<p class="ux-ns-promise">One hub. Many ecosystems.<br>A more connected onchain future.</p>'+
  '<p class="ux-ns-subline">Discover blockchain systems, explore their assets, and inspect routes through XGRChain.</p>'+
  '<div class="ux-ns-actions">'+introActions+'</div>'+
  '<div class="ux-ns-signature"><span class="ux-ns-signature-mark" aria-hidden="true">✧</span><span>A UNIFIED INTERCHAIN FUTURE<br>BUILT AROUND XGRCHAIN</span></div></div>'+
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
   '<a class="ux-ns-card-link" data-nav href="/plan-route">Check route availability →</a></article>'+
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
  '<h2>XGR Interchain <em>Token Alliance.</em></h2><p>XITA is more than a bridge interface. It combines XGRChain v3.x, its Proof-of-Stake validators, permissionless interchain smart contracts, routing infrastructure and the Token Alliance into one open ecosystem.</p>'+
  '<div class="ux-alliance-pillars"><span>XGRChain hub</span><span>PoS validator security</span><span>Permissionless routes</span><span>Cross-chain token ecosystems</span></div></div>'+
  '<div class="ux-alliance-audiences"><article class="ux-alliance-audience"><div class="ux-alliance-symbol">◈</div><span class="ux-kicker">FOR TOKEN HOLDERS</span><h3>Your tokens. More networks.</h3>'+
  '<p>Discover supported assets, inspect independently verified routes and reach token-specific transfer interfaces when available.</p>'+
  '<a data-nav href="/markets">Explore tokens <span aria-hidden="true">↗</span></a></article>'+
  '<article class="ux-alliance-audience"><div class="ux-alliance-symbol is-gold">✧</div><span class="ux-kicker">FOR TOKEN PROJECTS</span><h3>Bring your token into the Universe.</h3>'+
  '<p>Explore permissionless route infrastructure, publish your project profile and prepare participation in the XGR Interchain Token Alliance.</p>'+
  '<a data-nav href="/join">Join the Alliance <span aria-hidden="true">↗</span></a></article></div></section>';
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
  '<div class="ux-dashboard-outro-links"><a data-nav href="/faq">Read the FAQ →</a><a data-nav href="/plan-route">Plan a Route →</a></div></section></div>';
}
// A real standalone planner; no longer extracted from dashboard markup.
export function renderPlanRoute(model,selection={},apiState="not-deployed"){
 const source=model.chains.some(c=>c.key===selection.origin)?selection.origin:HUB;
 const target=model.chains.some(c=>c.key===selection.destination)?selection.destination:
  model.chains.find(c=>c.key!==source)?.key||source;
 const assetId=model.assets.some(a=>a.id===selection.asset)?selection.asset:model.assets[0]?.id||"";
 const plan=previewRoute(model,source,target,assetId);
 const active=model.routes.filter(r=>r.active).length;
 const firstAsset=model.assets.find(a=>a.id===assetId);
 return '<div class="ux-app ux-plan-page ux-northstar-page">'+
  '<section class="ux-ns-operations" id="ux-journey-planner"><div class="ux-ns-ops-intro"><span class="ux-kicker">INTERCHAIN OPERATIONS · XITA</span>'+
  '<h1>Plan a Route</h1><p class="ux-muted">Inspect configured directions and verify availability. A route preview is never an instruction to send funds.</p></div>'+
  '<div class="ux-ns-operations-grid"><section class="ux-panel ux-route-panel"><div class="ux-panel-head"><span class="ux-kicker">01 · JOURNEY PLANNER</span><span class="ux-label">XGR HUB</span></div>'+
  '<h2>Plan a transfer</h2><p class="ux-muted">Only independently verified route contracts should be offered to users.</p>'+
  '<label class="ux-field" for="ux-origin">Origin system</label><select id="ux-origin">'+chainOptions(model,source)+'</select>'+
  '<label class="ux-field" for="ux-asset">Asset</label><select id="ux-asset">'+assetOptions(model,assetId)+'</select>'+
  '<label class="ux-field" for="ux-destination">Destination system</label><select id="ux-destination">'+chainOptions(model,target)+'</select>'+
  '<div class="ux-divider"></div><div class="ux-kicker">ROUTE PATH</div>'+routePath(model,plan)+
  '<div class="ux-route-status">'+pill(plan.active)+'<p>'+esc(plan.reason)+'</p></div>'+
  '<p class="ux-small">No transfer timings, bridge TVL or transaction availability are inferred from the diagram.</p>'+
  (firstAsset?'<a class="ux-button" data-nav href="'+esc(tokenLink(firstAsset))+'">Open '+esc(firstAsset.id)+' token & transfer ↗</a>':
   '<a class="ux-button" data-nav href="/markets">Browse tokens ↗</a>')+'</section>'+
  '<aside class="ux-panel ux-ns-operations-data"><div class="ux-kicker">02 · VERIFIED NETWORK FACTS</div>'+
  '<h2>Current network state</h2><p class="ux-muted">A catalog listing is not proof of complete reciprocal deployment or finalized transfer security.</p>'+
  '<div class="ux-ns-facts"><div><span>Configured systems</span><strong>'+model.chains.length+'</strong></div>'+
  '<div><span>Configured directed routes</span><strong>'+model.routes.length+'</strong></div>'+
  '<div><span>Verified active routes</span><strong>'+active+'</strong></div>'+
  '<div><span>Event indexer</span><strong>'+(apiState==="ready"?"Available":"Unavailable")+'</strong></div></div>'+
  '<div class="ux-route-status"><p><strong>Route visualization is not proof of availability.</strong> Each direction requires deployment and independent reciprocal verification before users should bridge.</p></div>'+
  '<div class="ux-ns-explore-links"><a data-nav href="/#xita-3d">Open interactive Universe ↗</a>'+
  '<a data-nav href="/markets">Explore listed tokens ↗</a></div></aside></div></section></div>';
}
const faqGroups=[
 {label:"01 · THE ALLIANCE",title:"XITA Ecosystem",items:[
  ["What does XITA stand for?","XITA stands for XGR Interchain Token Alliance. It is the broader interchain ecosystem: XGRChain v3.x and its PoS validators, the public token-routing smart contracts, messaging and relaying infrastructure, indexing, and the Alliance for participating token projects. This website is its public interface, not the protocol itself."],
  ["Why is XGRChain the hub?","Every directed v3.1.5 route has XGRChain, EVM chain ID and Hyperlane domain 1643, as exactly one endpoint. Moving between two external chains means two separate hops through XGRChain, each with its own route and source-chain fee."],
  ["Is XITA decentralized and permissionless?","The v3.1.5 design uses a public Factory for independent route deployment and registration. No XGR organization approval or separate BLS vote is required to register a route. Individual messages are protected by validator BLS verification. A public listing or a route appearing in the UI is not an authorization or guarantee of availability."],
  ["Is XITA already fully deployed?","The public catalog includes configured networks and routes, but production availability depends on independently verified counterpart contracts, on-chain evidence and successful security tests. Individual routes must be checked before use."]
 ]},
 {label:"02 · TOKEN HOLDERS",title:"For Token Holders",items:[
  ["What can I do as a token holder?","Explore listed tokens and their chain representations, check a potential route in Plan a Route, and use the token-specific bridge interface only after that route is independently verified as available."],
  ["How do cross-chain transfers work?","A source-chain router dispatches an authenticated interchain message. Destination verification and delivery depend on the route's exact contracts and validator security checks. Moving from one external chain to another requires two independent operations through XGRChain; the second hop is not automatically executed for you."],
  ["What is a wrapped or synthetic token?","A token representation on a destination chain is not the original asset. Collateralized or native routes lock the appropriate source asset; authenticated synthetic routes mint or burn their representation according to the route design. Check the canonical origin and router addresses."],
  ["What if a relayer goes offline?","Relayers can be replaced. A transfer may remain pending if a message has not been delivered, so use verified message and transaction status rather than assuming an automatic refund. Recovery and retry behavior must be verified for the deployed route."],
  ["What fees apply?","The v3.1.5 design uses one validator fee denominated in the native currency of each source chain, plus transaction gas. A two-hop journey requires two source-chain transactions and their associated fees. Fees must be read from the actual source-chain registry."]
 ]},
 {label:"03 · TOKEN PROJECTS",title:"For Token Projects",items:[
  ["How can a token project join?","Use Join to prepare and publish a project listing. Listing in the XITA directory is separate from creating and verifying on-chain routes; a listing does not automatically activate bridging."],
  ["Can projects deploy routes without central approval?","The public v3.1.5 Factory is designed for independent deployment and registration of router pairs and route-specific gateways. There is no separate human route-admission vote. The destination still verifies exact messages using the validator security mechanism."],
  ["Does a project need its own validator network?","The XITA architecture uses the XGRChain validator security system for interchain message verification. Projects still need correctly deployed and verified routers, counterpart contracts and sufficient operational readiness."],
  ["Can multiple routes exist for the same asset?","Yes. The route identity includes its directional chain IDs and the specific source and destination router addresses. Independent router pairs may have different route IDs for the same original asset."]
 ]},
 {label:"04 · SECURITY & METRICS",title:"Protocol, Security & Metrics",items:[
  ["What does BLS verification protect?","Validator BLS signatures protect specific message and checkpoint verification at delivery. They do not serve as a separate permission vote for adding a route to the v3.1.5 registry."],
  ["What is the difference between configured and verified routes?","Configured means recorded in a public manifest or registry view. A route should be offered for public transfer only after its deployed contracts and reciprocal counterparty bindings are independently checked."],
  ["What are Locked TVL and Moved via XGR?","Locked TVL is the currently verified USD value of net collateral in independent escrow routers. Moved via XGR is cumulative verified journey volume, counted once per end-user journey even when it has two hops. Unknown or incomplete evidence is not shown as zero."],
  ["Where does token market capitalization come from?","Asset-wide market capitalization can use sourced market-provider data such as CoinGecko when configured. It does not represent the value locked in XITA, does not prove a route is active and must never be reported as bridge TVL."]
 ]}
];
export function renderFAQ(){
 return '<div class="ux-app ux-faq-page"><div class="ux-kicker">XGR INTERCHAIN TOKEN ALLIANCE · KNOWLEDGE BASE</div>'+
  '<h1>Understand XITA.</h1><p class="ux-lead">From permissionless token routing to interchain security: answers for holders, projects and builders.</p>'+
  '<div class="ux-faq-groups">'+faqGroups.map(group=>
    '<section class="ux-faq-group"><div class="ux-faq-group-head"><span class="ux-kicker">'+esc(group.label)+'</span><h2>'+esc(group.title)+'</h2></div>'+
    '<div class="ux-faq-list">'+group.items.map(([q,answer])=>
      '<details class="ux-faq-item"><summary>'+esc(q)+'</summary><p>'+esc(answer)+'</p></details>').join("")+'</div></section>').join("")+'</div>'+
  '<div class="ux-faq-footer"><a class="ux-ns-primary" data-nav href="/plan-route">Plan a Route →</a>'+
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
    '<p class="ux-small">Route registration and router bootstrap need no validator vote or CLI approval. Each transfer still requires message-specific BLS attestation. Source-native validator fees are chain-wide.</p></div>';
}
