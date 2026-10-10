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

function systemDetails(model,selected){
  const system=model.chains.find(c=>c.key===selected)||model.hub||model.chains[0];
  if(!system)return '<p class="ux-muted">No configured chains found.</p>';
  const associated=model.routes.filter(r=>r.source===system.key||r.destination===system.key);
  const active=associated.filter(r=>r.active).length;
  const list=system.tokens.slice(0,5).map(t=>'<a class="ux-asset" data-nav href="'+esc(tokenLink(t))+'"><span class="ux-dot"></span><span>'+esc(t.name)+'</span><span class="ux-small">'+esc(t.id)+'</span><span class="ux-arrow">↗</span></a>').join("");
  return '<div class="ux-panel-head"><span class="ux-kicker">Selected stellar system</span><span class="ux-label">'+(system.key===HUB?"Interchain hub":"Spoke network")+'</span></div>'+
    '<h3 class="ux-detail-name">'+esc(system.label)+'</h3><p class="ux-muted">'+(system.key===HUB?
    "XGRChain is the mandatory interchain transit point. Transfers between external systems require two independent route operations.":
    "This chain connects to the XGRChain hub through individually registered directed routes.")+'</p>'+
    '<div class="ux-keyvals"><div><span>Chain ID</span><strong>'+esc(valueOrDash(system.chainId))+'</strong></div>'+
    '<div><span>Native gas asset</span><strong>'+esc(system.nativeCurrency)+'</strong></div>'+
    '<div><span>Configured directed routes</span><strong>'+associated.length+'</strong></div>'+
    '<div><span>Verified active routes</span><strong>'+active+'</strong></div></div>'+
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

export function renderDashboard(model,selection={},apiState="not-deployed"){
  const source=model.chains.some(c=>c.key===selection.origin)?selection.origin:HUB;
  const target=model.chains.some(c=>c.key===selection.destination)?selection.destination:model.chains.find(c=>c.key!==source)?.key||source;
  const assetId=model.assets.some(a=>a.id===selection.asset)?selection.asset:model.assets[0]?.id||"";
  const plan=previewRoute(model,source,target,assetId);
  const verified=model.routes.filter(r=>r.active).length;
  const shown=model.routes.slice(0,5);
  const firstAsset=model.assets.find(a=>a.id===assetId);
  return '<div class="ux-app ux-dashboard"><div class="ux-header-row"><div><div class="ux-kicker">INTERCHAIN OPERATIONS · XITA</div>'+
    '<h1>Interchain <span>Dashboard</span></h1><p class="ux-lead">Discover connected blockchain systems, inspect routes and prepare transfers through XGRChain.</p></div>'+
    '<a data-nav class="ux-universe-link" href="/universe"><span class="ux-mini-galaxy">◎</span><span><strong>Explore the XITA Universe</strong><small>Systems, assets and interchain journeys</small></span><span>↗</span></a></div>'+
    '<div class="ux-metrics">'+metric("Configured systems",String(model.chains.length),"From public chain inventory")+
    metric("Verified active routes",String(verified),model.routes.length+" configured directed routes")+
    metric("Listed assets",String(model.assets.length),"Not a token verification claim")+
    metric("Event indexer",apiState==="ready"?"Available":"Unavailable",apiState==="ready"?"Indexed records may be viewed on token pages":"No estimated transfer statistics")+'</div>'+
    '<div class="ux-dashboard-grid"><section class="ux-panel ux-route-panel"><div class="ux-panel-head"><span class="ux-kicker">01 · Journey planner</span><span class="ux-label">XGR HUB</span></div>'+
    '<h2>Plan a transfer</h2><p class="ux-muted">Choose systems and a token. Only activated contracts can receive funds.</p>'+
    '<label class="ux-field" for="ux-origin">Origin system</label><select id="ux-origin" data-xita-origin>'+chainOptions(model,source)+'</select>'+
    '<label class="ux-field" for="ux-asset">Asset</label><select id="ux-asset" data-xita-asset>'+assetOptions(model,assetId)+'</select>'+
    '<label class="ux-field" for="ux-destination">Destination system</label><select id="ux-destination" data-xita-destination>'+chainOptions(model,target)+'</select>'+
    '<div class="ux-divider"></div><div class="ux-kicker">Route path</div>'+routePath(model,plan)+
    '<div class="ux-route-status">'+pill(plan.active)+'<p>'+esc(plan.reason)+'</p></div>'+
    '<p class="ux-small">Gateway quotes and source-native validator fees are fetched only on the token page. No synthetic pricing or transit times.</p>'+
    (firstAsset?'<a class="ux-button" data-nav href="'+esc(tokenLink(firstAsset))+'">Open '+esc(firstAsset.id)+' token & transfer <span>↗</span></a>':
    '<a class="ux-button is-disabled" data-nav href="/markets">Browse tokens <span>↗</span></a>')+'</section>'+
    '<section class="ux-panel ux-map-panel"><div class="ux-panel-head"><div><div class="ux-kicker">02 · Network topology</div><h2>XITA Universe <span class="ux-soft">(configured)</span></h2></div><a data-nav href="/universe" class="ux-mini-link">Expand ↗</a></div>'+
    '<div id="xita-3d" class="ux-3d-stage is-compact"><canvas class="ux-3d-canvas" tabindex="0" aria-label="Interactive three dimensional XITA universe. Drag to rotate, scroll to zoom, use arrow keys."></canvas><div class="ux-3d-labels" aria-hidden="true"></div><div class="ux-3d-controls" aria-label="Universe navigation"><button type="button" data-cosmos-action="left" aria-label="Rotate left">←</button><button type="button" data-cosmos-action="right" aria-label="Rotate right">→</button><button type="button" data-cosmos-action="up" aria-label="Rotate up">↑</button><button type="button" data-cosmos-action="down" aria-label="Rotate down">↓</button><button type="button" data-cosmos-action="in" aria-label="Zoom in">+</button><button type="button" data-cosmos-action="out" aria-label="Zoom out">−</button><button type="button" data-cosmos-action="home" aria-label="Reset to XGR hub">XGR ⌂</button></div><div class="ux-3d-status">Reading configured routes</div></div>'+
    '<div class="ux-map-caption">Each external-to-external journey traverses XGRChain. Network lines show topology, not live availability.</div></section>'+
    '<aside class="ux-panel ux-overview-panel"><div class="ux-panel-head"><div><div class="ux-kicker">03 · System inventory</div><h2>Connected worlds</h2></div></div>'+
    '<div class="ux-chain-list">'+model.chains.map(c=>'<button type="button" data-xita-system="'+esc(c.key)+'" class="ux-chain-row'+(c.key===selection.system?" is-selected":"")+'">'+
    '<span class="ux-chain-symbol'+(c.key===HUB?" is-hub":"")+'"></span><span><strong>'+esc(c.label)+'</strong><small>'+c.tokens.length+' listed assets</small></span>'+
    '<span class="ux-label">'+(c.key===HUB?"Hub":"Configured")+'</span></button>').join("")+'</div>'+
    '<div class="ux-divider"></div><div class="ux-kicker">Published directed routes</div><div class="ux-routes-list">'+
    (shown.map(r=>'<div class="ux-route-row"><span>'+esc(model.chains.find(c=>c.key===r.source)?.label||r.source)+' → '+esc(model.chains.find(c=>c.key===r.destination)?.label||r.destination)+'</span>'+pill(r.active)+'</div>').join("")||'<p class="ux-muted">No routes listed.</p>')+
    '</div><a class="ux-mini-link ux-bottom-link" data-nav href="/routes">View all routes →</a></aside></div>'+
    '<section class="ux-panel ux-discovery"><div><div class="ux-kicker">ASSET DISCOVERY</div><h2>Explore token worlds</h2><p class="ux-muted">Each token profile contains its own transfer interface, verified route inventory and delivery checks.</p></div>'+
    '<div class="ux-discovery-assets">'+model.assets.slice(0,4).map(a=>'<a data-nav class="ux-discovery-item" href="'+esc(tokenLink(a))+'"><span class="ux-token-sphere"></span><strong>'+esc(a.id)+'</strong><span>Explore ↗</span></a>').join("")+
    '<a data-nav class="ux-discovery-item" href="/markets"><strong>All assets</strong><span>Directory ↗</span></a></div></section></div>';
}
export function renderUniverse(model,selected=HUB){
  const active=model.routes.filter(r=>r.active).length;
  const total=model.chains.length;
  return '<div class="ux-app ux-universe-page"><div class="ux-universe-hero"><div class="ux-kicker">INTERCONNECTED WORLDS · THE XITA UNIVERSE</div>'+
    '<h1>The XITA <em>Universe.</em></h1><p class="ux-lead">Every blockchain is its own world. XGRChain is the interstellar gateway connecting them.</p>'+
    '<p class="ux-muted">Explore the configured systems and their token representations. Every spoke-to-spoke journey consists of two separate, independently authenticated transfers.</p>'+
    '<div class="ux-hero-actions"><a class="ux-button" data-nav href="/routes">Explore routes ↗</a><a class="ux-outline-button" data-nav href="/">Back to dashboard</a></div></div>'+
    '<div class="ux-universe-layout"><div class="ux-universe-main"><div class="ux-map-bar"><span class="ux-kicker">SYSTEM MAP · '+total+' CONFIGURED</span>'+
    '<span class="ux-small">'+active+' verified active directed routes</span></div>'+'<div id="xita-3d" class="ux-3d-stage"><canvas class="ux-3d-canvas" tabindex="0" aria-label="Interactive three dimensional XITA universe. Drag to rotate, scroll to zoom, use arrow keys."></canvas><div class="ux-3d-labels" aria-hidden="true"></div><div class="ux-3d-controls" aria-label="Universe navigation"><button type="button" data-cosmos-action="left" aria-label="Rotate left">←</button><button type="button" data-cosmos-action="right" aria-label="Rotate right">→</button><button type="button" data-cosmos-action="up" aria-label="Rotate up">↑</button><button type="button" data-cosmos-action="down" aria-label="Rotate down">↓</button><button type="button" data-cosmos-action="in" aria-label="Zoom in">+</button><button type="button" data-cosmos-action="out" aria-label="Zoom out">−</button><button type="button" data-cosmos-action="home" aria-label="Reset to XGR hub">XGR ⌂</button></div><div class="ux-3d-status">Reading configured routes</div></div>'+
    '<div class="ux-map-caption">XGRChain is the only intermediate system. Paths indicate eligible topology; unactivated routes cannot bridge.</div></div>'+
    '<aside class="ux-panel ux-details" id="ux-selected-details" aria-live="polite">'+systemDetails(model,selected)+'</aside></div>'+
    '<section class="ux-panel ux-below"><div><div class="ux-kicker">BEYOND THE STAR MAP</div><h2>All configured systems</h2><p class="ux-muted">The map shows a limited number of systems to remain readable as XITA grows. The directory includes every configured chain.</p></div>'+
    '<div class="ux-universe-directory">'+model.chains.map(c=>'<button type="button" data-xita-system="'+esc(c.key)+'" class="ux-directory-item'+(selected===c.key?" is-selected":"")+'">'+
    '<span class="ux-chain-symbol'+(c.key===HUB?" is-hub":"")+'"></span><strong>'+esc(c.label)+'</strong><small>'+c.tokens.length+' assets</small><span>Explore ↗</span></button>').join("")+'</div></section></div>';
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
