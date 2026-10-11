import {representationFor} from "./token-representation.js";
import {verifiedMetrics,formatUsd} from "./leaderboard-data.js";
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
const pill = (isActive) => '<span class="ux-badge '+(isActive?"is-verified":"is-pending")+'">'+(isActive?"Verified active":"Not activated")+"</span>";
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
  const reason=!configured?"No complete directed route is configured for this asset.":!active?"Configured routes are not yet verified and activated.":hops.length===2?"Two independent transfers are required; the second hop is not automated.":"A verified single-hop route is available.";
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
    '<div class="ux-map-legend">XGRChain is the mandatory transit hub · Dashed paths are not proof of activation</div></div>';
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
      '<span>'+(r?"Configured · not activated":"Route not configured")+'</span></div>').join(""):'<p class="ux-small">No valid path.</p>')+'</div>'+
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
    '<p class="ux-small">When the v3.1.5 flow is implemented, a quote must use the new source-chain Registry fee, checked Router/Gateway bindings and a verified reciprocal safety activation. The old bridge is retired.</p></div>';
}


function northstarStage(model,{universe=false}={}){
 const active=model.routes.filter(route=>route.active).length;
 const systems=model.chains.length;
 const introActions=universe?
  '<a data-nav class="ux-ns-primary" href="/markets">Explore tokens <span aria-hidden="true">↗</span></a>'+
  '<a data-nav class="ux-ns-secondary" href="/">Back to dashboard</a>':
  '<a data-nav class="ux-ns-primary" href="/universe">Explore Universe <span aria-hidden="true">→</span></a>'+
  '<a class="ux-ns-secondary" href="#ux-journey-planner">Plan a route</a>';
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
 const active=model.routes.filter(route=>route.active).length;
 const visibleChains=model.chains.slice(0,5);
 const spokes=model.chains.filter(c=>c.key!==HUB).slice(0,3);
 const xgr=verifiedMetrics(metrics,"XGR");
 const value=xgr?.marketCapUsd??null;
 const marketSource=metrics?.assets?.XGR?.market;
 const sourced=marketSource?.status==="market-data"&&marketSource.source==="coingecko";
 const marketText=sourced&&value!==null?formatUsd(value):"—";
 const routeRows=spokes.map(chain=>{
  const pair=model.routes.filter(r=>(r.source===HUB&&r.destination===chain.key)||
   (r.destination===HUB&&r.source===chain.key));
  const live=pair.filter(r=>r.active).length;
  return '<div class="ux-ns-route-row"><span class="ux-ns-route-glyph"></span>'+
    '<strong>'+esc(chain.label)+' ↔ XGR</strong><small>'+live+' / '+pair.length+' verified</small></div>';
 }).join("");
 return '<section class="ux-ns-deck" aria-label="XITA network overview">'+
  '<article class="ux-ns-card ux-ns-card-systems"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">◎</span>'+
  '<h2>Supported systems</h2><span class="ux-ns-card-count">'+visibleChains.length+'</span></div>'+
  '<div class="ux-ns-system-list">'+visibleChains.map(c=>
    '<button type="button" class="ux-ns-system-row" data-xita-system="'+esc(c.key)+'">'+
    '<span class="ux-ns-orb '+(c.key===HUB?"is-hub":"is-"+esc(c.key))+'"></span>'+
    '<strong>'+esc(c.label)+'</strong><small>'+(c.key===HUB?"Interchain hub":"Configured")+'</small>'+
    '<span class="ux-ns-system-tag">'+(c.key===HUB?"Hub":"Planned")+'</span></button>').join("")+'</div></article>'+
  '<article class="ux-ns-card"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">↗</span>'+
  '<h2>Directed routes</h2><span class="ux-ns-card-count">'+model.routes.length+'</span></div>'+
  '<div class="ux-ns-card-message">'+active+' verified active · '+model.routes.length+' configured</div>'+
  '<div class="ux-ns-route-list">'+(routeRows||'<p class="ux-small">No configured spokes</p>')+'</div>'+
  '<a class="ux-ns-card-link" href="#ux-journey-planner">Inspect route plan →</a></article>'+
  '<article class="ux-ns-card ux-ns-hub-card"><div class="ux-ns-card-head"><span class="ux-ns-card-icon is-gold">✦</span>'+
  '<h2>Hub: XGRChain</h2><span class="ux-ns-pill">CORE</span></div>'+
  '<div class="ux-ns-hub-graphic"><span class="ux-ns-orb is-hub"></span>'+
  '<p>The interchain gateway connecting configured EVM worlds.</p></div>'+
  '<div class="ux-ns-market"><span>Asset-wide XGR market cap</span><strong>'+esc(marketText)+'</strong></div>'+
  '<div class="ux-ns-market-note">'+(sourced&&value!==null?
   'CoinGecko sourced · not bridge TVL':'External market data unavailable · no estimated TVL')+'</div></article>'+
  '<article class="ux-ns-card"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">⌁</span>'+
  '<h2>Journey preview</h2><span class="ux-ns-outline-tag">2 hops max.</span></div>'+
  '<div class="ux-ns-journey"><span class="ux-ns-orb is-base"></span><span class="ux-ns-journey-line"></span>'+
  '<span class="ux-ns-orb is-hub"></span><span class="ux-ns-journey-line"></span>'+
  '<span class="ux-ns-orb is-polygon"></span></div>'+
  '<div class="ux-ns-journey-labels"><span>Base</span><span>XGR Hub</span><span>Polygon</span></div>'+
  '<div class="ux-ns-journey-summary"><span>Route status</span><strong>Not activated</strong></div>'+
  '<a class="ux-ns-card-link" href="#ux-journey-planner">Plan a transfer →</a></article></section>';
}

export function renderDashboard(model,selection={},apiState="not-deployed",metrics=null){
 const source=model.chains.some(c=>c.key===selection.origin)?selection.origin:HUB;
 const target=model.chains.some(c=>c.key===selection.destination)?selection.destination:
  model.chains.find(c=>c.key!==source)?.key||source;
 const assetId=model.assets.some(a=>a.id===selection.asset)?selection.asset:model.assets[0]?.id||"";
 const plan=previewRoute(model,source,target,assetId);
 const active=model.routes.filter(r=>r.active).length;
 const firstAsset=model.assets.find(a=>a.id===assetId);
 return '<div class="ux-app ux-dashboard ux-northstar-page">'+
  northstarStage(model)+northstarCards(model,metrics)+
  '<section class="ux-ns-operations" id="ux-journey-planner">'+
  '<div class="ux-ns-ops-intro"><span class="ux-kicker">INTERCHAIN OPERATIONS · XITA</span>'+
  '<h2>Interchain Dashboard</h2><p class="ux-muted">Inspect route possibilities and configure a future transfer. Every transaction remains disabled until its routes are verified.</p></div>'+
  '<div class="ux-ns-operations-grid"><section class="ux-panel ux-route-panel"><div class="ux-panel-head"><span class="ux-kicker">01 · JOURNEY PLANNER</span><span class="ux-label">XGR HUB</span></div>'+
  '<h2>Plan a transfer</h2><p class="ux-muted">Choose systems and an asset. Only verified, activated routes can receive funds.</p>'+
  '<label class="ux-field" for="ux-origin">Origin system</label><select id="ux-origin">'+chainOptions(model,source)+'</select>'+
  '<label class="ux-field" for="ux-asset">Asset</label><select id="ux-asset">'+assetOptions(model,assetId)+'</select>'+
  '<label class="ux-field" for="ux-destination">Destination system</label><select id="ux-destination">'+chainOptions(model,target)+'</select>'+
  '<div class="ux-divider"></div><div class="ux-kicker">ROUTE PATH</div>'+routePath(model,plan)+
  '<div class="ux-route-status">'+pill(plan.active)+'<p>'+esc(plan.reason)+'</p></div>'+
  '<p class="ux-small">No transfer timings, bridge TVL or transaction availability are inferred from the diagram.</p>'+
  (firstAsset?'<a class="ux-button" data-nav href="'+esc(tokenLink(firstAsset))+'">Open '+esc(firstAsset.id)+' token & transfer ↗</a>':
   '<a class="ux-button" data-nav href="/markets">Browse tokens ↗</a>')+'</section>'+
  '<aside class="ux-panel ux-ns-operations-data"><div class="ux-kicker">02 · VERIFIED NETWORK FACTS</div>'+
  '<h2>Current network state</h2><p class="ux-muted">The public catalog describes intended topology. Deployment and finality verification are independent.</p>'+
  '<div class="ux-ns-facts"><div><span>Configured systems</span><strong>'+model.chains.length+'</strong></div>'+
  '<div><span>Configured directed routes</span><strong>'+model.routes.length+'</strong></div>'+
  '<div><span>Verified active routes</span><strong>'+active+'</strong></div>'+
  '<div><span>Event indexer</span><strong>'+(apiState==="ready"?"Available":"Unavailable")+'</strong></div></div>'+
  '<div class="ux-route-status"><p><strong>Route visualization is not proof of availability.</strong> Each direction requires deployment, safety verification and independent activation.</p></div>'+
  '<div class="ux-ns-explore-links"><a data-nav href="/universe">Open interactive Universe ↗</a>'+
  '<a data-nav href="/markets">Explore listed tokens ↗</a></div></aside></div></section>'+
  '<section class="ux-panel ux-discovery"><div><div class="ux-kicker">ASSET DISCOVERY</div>'+
  '<h2>Explore token worlds</h2><p class="ux-muted">Open a token profile to inspect its representations, status and bridge interface.</p></div>'+
  '<div class="ux-discovery-assets">'+model.assets.slice(0,4).map(a=>
   '<a data-nav class="ux-discovery-item" href="'+esc(tokenLink(a))+'">'+
   '<span class="ux-token-sphere"></span><strong>'+esc(a.id)+'</strong><span>Explore ↗</span></a>').join("")+
  '<a data-nav class="ux-discovery-item" href="/markets"><strong>All assets</strong><span>Directory ↗</span></a></div></section></div>';
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
    '<div class="ux-metrics">'+metric("Configured routes",String(model.routes.length),"Inventory, not activation")+
    metric("Verified active",String(model.routes.filter(r=>r.active).length),"Fail-closed activation state")+
    metric("Network hub","XGRChain","EVM chain and domain 1643")+'</div>'+
    '<div class="ux-panel"><div class="ux-panel-head"><h2>Route inventory</h2><span class="ux-label">Deployment required for transfer</span></div>'+
    '<div class="ux-routes-table"><div class="ux-table-head"><span>Asset</span><span>Source</span><span>Destination</span><span>Verification</span><span>Token</span></div>'+
    model.routes.map(r=>'<div class="ux-table-row"><strong>'+esc(r.assetId)+'</strong><span>'+esc(model.chains.find(c=>c.key===r.source)?.label||r.source)+'</span>'+
    '<span>'+esc(model.chains.find(c=>c.key===r.destination)?.label||r.destination)+'</span>'+pill(r.active)+
    '<a data-nav href="'+esc(tokenLink(model.assets.find(a=>a.id===r.assetId)||{slug:r.assetId.toLowerCase()}))+'">Details ↗</a></div>').join("")+
    (model.routes.length?"":'<p class="ux-muted">No configured routes.</p>')+'</div></div>'+
    '<p class="ux-small">Route registration is permissionless in v3.1.5. Activation requires objective validator BLS safety attestation; there is no per-route fee governance. Source-native validator fees are chain-wide.</p></div>';
}
