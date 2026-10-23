import {deployedRoutes,executableTransferRoutes,supportedRouteChains,documentedExecutionGateway} from "./route-availability.js";
import {representationFor} from "./token-representation.js";
import {verifiedSyntheticContract,walletRepresentationBalance,tokenExplorerUrl} from "./token-inventory.js";
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
// Public project links come only from approved asset profiles. Never render
// javascript:, credentials-bearing, or arbitrary protocol URLs from a catalog.
function projectUrl(value){
 if(typeof value!=="string"||value.length>1024)return null;
 try{
  const url=new URL(value);
  return url.protocol==="https:"&&url.hostname&&!url.username&&!url.password?
   url.href:null;
 }catch{return null}
}
const tokenAddress=value=>/^0x[0-9a-f]{40}$/i.test(value||"")&&
 !/^0x0{40}$/i.test(value);
const chainTokenExplorer=(chain,address)=>{
 if(!tokenAddress(address))return null;
 if(chain==="xgrchain")return "https://explorer.xgr.network/address/"+address;
 return tokenExplorerUrl(chain,address);
};
const chainAddressExplorer=(chain,address)=>{
 if(!tokenAddress(address))return null;
 const roots={xgrchain:"https://explorer.xgr.network/address/",
  base:"https://basescan.org/address/",polygon:"https://polygonscan.com/address/",
  arbitrum:"https://arbiscan.io/address/"};
 return roots[chain]?roots[chain]+address:null;
};

export function buildExperienceModel(catalog, isVerified = () => false) {
  const assets = Object.entries(catalog?.assets||{}).map(([id,entry])=>({
    id, name:entry?.profile?.name||entry?.metadata?.name||id,
    slug:entry?.profile?.slug||id.toLowerCase(),
    canonical:entry?.metadata?.canonical?.chain||null,
    website:projectUrl(entry?.profile?.links?.website),
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
  return {assets,chains,routes,hub:chains.find(c=>c.key===HUB)||null,deployments:deployedRoutes(catalog),transferRoutes:executableTransferRoutes(catalog),
  feeAdapters:Object.fromEntries(Object.keys(catalog?.chains||{}).map(chain=>
   [chain,documentedExecutionGateway(catalog,chain)])),tokenDecimals:Object.fromEntries(Object.entries(catalog?.assets||{}).map(([id,a])=>[id,a?.metadata?.decimals??18]))};
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
  const reason=!configured?"No complete directed route is configured for this asset.":!active?"Configured routes are not yet independently verified for delivery.":hops.length===2?"XITA monitors both hops and prepares their next steps. Each wallet transaction still requires MetaMask approval.":"A verified single-hop route is available.";
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


export function renderRepresentationInventory(model,assetId,chainKey,wallet={}){
 const token=model.assets.find(a=>a.id===assetId);
 const rep=token?.representations?.find(r=>r.chain===chainKey);
 if(!rep)return "";
 const system=model.chains.find(c=>c.key===chainKey);
 const native=rep.representation==="native";
 const address=verifiedSyntheticContract(model.deployments,assetId,rep);
 const contract=native?'<span class="ux-small">Native currency · no ERC-20 contract</span>':
  address?'<div class="ux-contract-line"><code>'+esc(address)+'</code><button type="button" data-xita-copy-address="'+esc(address)+'" aria-label="Copy '+esc(rep.symbol||assetId)+' contract address">Copy</button>'+
   (rep.representation==="synthetic"&&Number.isSafeInteger(system?.chainId)&&Number.isInteger(model.tokenDecimals?.[assetId])?
    '<button type="button" class="ux-mm-import" data-xita-add-metamask data-asset="'+esc(assetId)+'" data-chain="'+esc(chainKey)+'" aria-label="Add '+esc(rep.symbol||assetId)+' on '+esc(system?.label||chainKey)+' to MetaMask">+ MetaMask</button>':'')+
   (tokenExplorerUrl(chainKey,address)?'<a target="_blank" rel="noopener noreferrer" href="'+esc(tokenExplorerUrl(chainKey,address))+'">Explorer ↗</a>':'')+'</div>':
  '<span class="ux-small">Contract not independently verified</span>';
 const result=walletRepresentationBalance(wallet,assetId,rep,{
  tokenDecimals:model.tokenDecimals?.[assetId]??18,nativeDecimals:system?.nativeCurrencyDecimals??18
 });
 return '<div class="ux-representation-entry" data-representation-chain="'+esc(chainKey)+'"><strong>'+esc(system?.label||chainKey)+' · '+esc(rep.symbol||assetId)+'</strong>'+
  '<div>'+contract+'</div>'+(result?'<div class="ux-representation-balance">Wallet: '+esc(result.label)+'</div>':'')+'</div>';
}

function systemDetails(model,selected,metrics=null,wallet={}){
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
    (system.tokens.length>5?'<p class="ux-small">+'+(system.tokens.length-5)+' more tokens · <a data-nav href="/markets">Browse directory →</a></p>':"")+
    (system.tokens.some(t=>t.id==="XGR")?'<h4>XGR representation</h4>'+renderRepresentationInventory(model,"XGR",system.key,wallet):"");
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
 const available=(model.transferRoutes||[]).filter(r=>r.asset===assetId);
 return '<div class="ux-token-bridge"><div class="ux-kicker">XITA · TOKEN TRANSFER</div>'+
  '<h2>Transfer '+esc(token.name)+'</h2>'+
  '<p class="ux-muted">One transfer flow for every supported route. Your token is preselected on the transfer page.</p>'+
  '<p class="ux-small">'+available.length+' fee-enabled transfer direction'+(available.length===1?"":"s")+(available.length?"":" · Execution Gateway pending")+'</p>'+
  '<a class="ux-button" data-nav href="/transfer?token='+encodeURIComponent(assetId)+'">Transfer '+esc(assetId)+' →</a>'+
  '</div>';
}


function northstarStage(model,{universe=false}={}){
 const active=model.transferRoutes?.length||0;
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
  '<small>'+active+' active directed routes</small>'+
  '<small class="ux-ns-network-note">Topology preview · no simulated activity</small></div>'+
  '<div class="ux-3d-controls" aria-label="Universe navigation"><button type="button" data-cosmos-action="home" aria-label="Reset to XGRChain hub">◎ XGR Hub</button></div>'+
  '<div class="ux-3d-focus" aria-live="polite"><div class="ux-kicker">EXPLORING SYSTEM</div><h3 class="ux-3d-focus-title"></h3>'+
  '<p class="ux-3d-focus-count"></p><div class="ux-3d-asset-links"></div></div>'+
  '<div class="ux-3d-hint">Drag to orbit · Scroll to zoom · Select a star to explore tokens · Home to reset</div>'+
  '<div class="ux-3d-status">XGR gateway · configured routes only</div></div>';
}


function validTvlPoints(metrics){
 return (Array.isArray(metrics?.history?.points)?metrics.history.points:[])
  .filter(p=>typeof p?.lockedUsd==="number"&&Number.isFinite(p.lockedUsd)&&p.lockedUsd>=0&&
    Number.isFinite(Date.parse(p?.asOf)))
  .sort((a,b)=>Date.parse(a.asOf)-Date.parse(b.asOf));
}
export function tvlChange24h(metrics){
 const points=validTvlPoints(metrics);
 const current=metrics?.totals?.lockedUsd;
 const last=points.at(-1);
 const value=Number.isFinite(current)&&current>=0?current:last?.lockedUsd;
 const at=Number.isFinite(current)&&current>=0&&Number.isFinite(Date.parse(metrics?.asOf))?
  Date.parse(metrics.asOf):Date.parse(last?.asOf);
 if(!Number.isFinite(value)||!Number.isFinite(at))return null;
 const target=at-86400000;
 const baseline=points.filter(p=>Date.parse(p.asOf)<=target).at(-1);
 if(!baseline||target-Date.parse(baseline.asOf)>3600000||baseline.lockedUsd<=0)return null;
 const change=100*(value-baseline.lockedUsd)/baseline.lockedUsd;
 return Number.isFinite(change)?change:null;
}
function tvlHistoryChart(metrics,period="24h"){
 const valid=["24h","7d","30d"].includes(period)?period:"24h";
 const durations={"24h":86400000,"7d":604800000,"30d":2592000000};
 const all=validTvlPoints(metrics),last=all.at(-1);
 const end=Date.parse(last?.asOf);
 const start=end-durations[valid];
 const points=all.filter(p=>Date.parse(p.asOf)>=start&&Date.parse(p.asOf)<=end);
 const tabs='<div class="ux-ns-tvl-periods" aria-label="TVL history period">'+
  ["24h","7d","30d"].map(p=>'<button type="button" data-tvl-period="'+p+'" class="'+(p===valid?"is-selected":"")+'" aria-pressed="'+(p===valid)+'">'+p+'</button>').join("")+'</div>';
 const stamp=t=>valid==="24h"?new Date(t).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"UTC"})+" UTC":
  new Date(t).toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"UTC"});
 if(points.length<2)return '<div class="ux-ns-tvl-history is-empty">'+tabs+'<p>TVL history is being collected.</p></div>';
 const firstAt=Date.parse(points[0].asOf),lastAt=Date.parse(points.at(-1).asOf),span=lastAt-firstAt;
 if(span<=0)return '<div class="ux-ns-tvl-history is-empty">'+tabs+'<p>TVL history is being collected.</p></div>';
 // Scale to observed timestamps, not the 24h container that compressed samples into a tiny strip.
 const values=points.map(p=>p.lockedUsd),low=Math.min(...values),high=Math.max(...values);
 const padding=Math.max((high-low)*.15,Math.max(high,1)*.00001),range=high-low+padding*2;
 const xy=points.map(p=>({x:8+284*(Date.parse(p.asOf)-firstAt)/span,y:62-50*(p.lockedUsd-low+padding)/range}));
 const path=xy.map((p,i)=>(i?"L":"M")+p.x.toFixed(2)+" "+p.y.toFixed(2)).join(" ");
 const lastXY=xy.at(-1),coverage=span<durations[valid]*.9?'<span class="ux-ns-tvl-coverage">Observed '+Math.max(1,Math.round(span/60000))+' min · partial '+valid+' history</span>':"";
 return '<div class="ux-ns-tvl-history">'+tabs+
  '<svg class="ux-ns-tvl-sparkline" viewBox="0 0 300 72" role="img" aria-label="Verified TVL observations from '+stamp(firstAt)+' to '+stamp(lastAt)+'">'+
  '<path d="'+path+'" fill="none" stroke="#eacb83" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+
  '<circle cx="'+lastXY.x.toFixed(2)+'" cy="'+lastXY.y.toFixed(2)+'" r="3" fill="#f8dfa4"/></svg>'+
  '<div class="ux-ns-tvl-axis"><span>'+esc(stamp(firstAt))+'</span><span>'+esc(stamp(lastAt))+'</span></div>'+coverage+'</div>';
}

function northstarCards(model,metrics=null,period="24h"){
 const recent=validTvlPoints(metrics).at(-1)||null;
 const liveTVL=metrics?.totals?.lockedUsd;
 const displayTVL=Number.isFinite(liveTVL)?liveTVL:recent?.lockedUsd??null;
 const displayAsOf=Number.isFinite(liveTVL)?null:recent?.asOf??null;
 const tvlChange=tvlChange24h(metrics);
 const active=model.transferRoutes?.length||0;
 const rows=model.chains;
 const activeChains=new Set((model.transferRoutes||[]).flatMap(r=>[r.source,r.destination]));
 return '<section class="ux-ns-deck ux-ns-overview-deck" aria-label="XITA network overview">'+
  '<article class="ux-ns-card ux-ns-card-systems"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">◎</span><h2>Supported systems</h2><span class="ux-ns-card-count">'+rows.length+'</span></div>'+
  '<div class="ux-ns-system-list">'+rows.map(c=>{
    const ready=c.key===HUB||activeChains.has(c.key);
    const status=c.key===HUB?"Hub":ready?"Active":"In preparation";
    return '<button type="button" class="ux-ns-system-row" data-xita-system="'+esc(c.key)+'">'+
     '<span class="ux-ns-orb '+(c.key===HUB?"is-hub":"is-"+esc(c.key))+'"></span>'+
     '<strong>'+esc(c.label)+'</strong><small>'+(c.key===HUB?"Interchain hub":ready?"Transfer routes deployed":"Deployment pending")+'</small>'+
     '<span class="ux-ns-system-tag'+(ready?' is-active':'')+'">'+status+'</span></button>';
   }).join("")+'</div></article>'+
  '<article class="ux-ns-card ux-ns-network-card"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">↗</span><h2>Interchain network</h2><span class="ux-ns-pill">XGR HUB</span></div>'+
   '<div class="ux-ns-network-numbers"><div><strong>'+model.routes.length+'</strong><span>Configured directions</span></div><div><strong>'+active+'</strong><span>Active directions</span></div></div>'+
   '<p class="ux-small">Active = deployed route contracts and execution adapters, verified by catalog receipts. Every direction goes via XGRChain.</p>'+
   '<a class="ux-ns-card-link" data-nav href="/transfer">Check route availability →</a></article>'+
  '<article class="ux-ns-card ux-ns-card-tvl"><div class="ux-ns-card-head"><span class="ux-ns-card-icon is-gold">✦</span><h2>Locked TVL</h2></div>'+
   '<div class="ux-ns-tvl-value-row"><strong class="ux-ns-value">'+esc(formatUsd(displayTVL))+'</strong>'+
   '<span class="ux-ns-tvl-change '+(tvlChange==null?'is-unknown':tvlChange>0?'is-positive':tvlChange<0?'is-negative':'is-neutral')+'">'+
   (tvlChange==null?'24h —':(tvlChange>0?'+':'')+esc(tvlChange.toFixed(2))+'% · 24h')+'</span></div>'+
   (displayAsOf?'<span class="ux-ns-tvl-last">Last verified: '+esc(new Date(displayAsOf).toLocaleString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}))+' UTC · current TVL unavailable</span>':'')+
   tvlHistoryChart(metrics,period)+
   '<p class="ux-small">Verified net collateral in route-specific escrows.</p>'+
   '<span class="ux-ns-evidence">'+(metrics?.totals?.lockedUsd==null?"Awaiting complete verified evidence":"Verified on-chain evidence")+'</span></article>'+
  '<article class="ux-ns-card ux-ns-card-moved"><div class="ux-ns-card-head"><span class="ux-ns-card-icon">⇄</span><h2>Moved via XGR · 24h</h2></div>'+
   '<strong class="ux-ns-value">'+esc(formatUsd(metrics?.totals?.movedUsd))+'</strong>'+
   '<p class="ux-small">Gross confirmed lock/unlock activity observed by the finalized indexer over 24h, priced in USD. Backfills are observations, not historical block times.</p>'+
   '<span class="ux-ns-evidence">'+(metrics?.totals?.movedUsd==null?"Awaiting complete verified evidence":"Verified indexed evidence")+'</span></article></section>';
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
// Three compact, independent leaderboards. An unknown figure never enters a ranking.
export function dashboardMarketRows(catalog,metrics){
 const rows=buildLeaderboardRows(catalog,metrics).filter(row=>row.marketCapUsd!==null);
 return rankAssets(rows,"marketCapUsd","desc").slice(0,10);
}
export function dashboardRankingRows(catalog,metrics,key){
 if(!["marketCapUsd","lockedUsd","movedUsd"].includes(key))return [];
 const rows=buildLeaderboardRows(catalog,metrics);
 if(key==="lockedUsd")for(const row of rows){
  if(row.lockedUsd===null){
   const historic=metrics?.lastVerifiedAssets?.[row.id];
   if(typeof historic?.lockedUsd==="number"&&Number.isFinite(historic.lockedUsd)&&historic.lockedUsd>=0){
    row.lockedUsd=historic.lockedUsd;row.historicalAsOf=historic.asOf;
   }
  }
 }
 return rankAssets(rows.filter(row=>Number.isFinite(row[key])&&row[key]>=0),key,"desc").slice(0,5);
}
// Approved token logos replace decorative planets in the dashboard rankings.
// A short ticker is still visible if an external image cannot load.
function dashboardTokenLogo(row){
 const logo=projectUrl(row.logo);
 const ticker=String(row.id||"?").slice(0,4).toUpperCase();
 return '<span class="ux-dashboard-token-logo" aria-hidden="true">'+
  '<span class="ux-dashboard-token-fallback">'+esc(ticker)+'</span>'+
  (logo?'<img class="ux-dashboard-token-logo-img" src="'+esc(logo)+
    '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+
  '</span>';
}
function dashboardTopTokens(catalog,metrics){
 const panels=[
  {key:"marketCapUsd",title:"by Market Cap",caption:"CoinGecko · asset-wide market cap",empty:"No verified market-cap data yet."},
  {key:"lockedUsd",title:"by Locked TVL",caption:"Verified escrow collateral",empty:"No verified locked TVL yet."},
  {key:"movedUsd",title:"by 24h Volume",caption:"Verified indexer-observed escrow flow",empty:"No verified 24h volume yet."}
 ];
 return '<section class="ux-dashboard-rankings" id="top-tokens" aria-label="Top Tokens leaderboards">'+
  panels.map(panel=>{
   const rows=dashboardRankingRows(catalog,metrics,panel.key);
   return '<article class="ux-dashboard-ranking"><div class="ux-dashboard-ranking-head"><div>'+
    '<span class="ux-kicker">Top Tokens</span><h2>'+panel.title+'</h2>'+
    '<p>'+panel.caption+'</p></div></div>'+
    (rows.length?'<div class="ux-dashboard-token-table">'+rows.map((row,i)=>
     '<a data-nav class="ux-dashboard-token-row" href="/token/'+encodeURIComponent(row.slug)+'">'+
      '<span class="ux-dashboard-token-name"><span class="ux-dashboard-token-rank">'+(i+1)+'</span>'+
      dashboardTokenLogo(row)+
      '<span><strong>'+esc(row.name)+'</strong><small>'+esc(row.id)+'</small></span></span>'+
      '<span class="ux-dashboard-token-amount"><strong class="ux-dashboard-token-cap">'+esc(formatUsd(row[panel.key]))+'</strong>'+(row.historicalAsOf?'<small>Last verified</small>':'')+'</span></a>').join("")+'</div>':
      '<p class="ux-dashboard-ranking-empty">'+panel.empty+'</p>')+
     '<a class="ux-dashboard-ranking-link" data-nav href="/markets">Browse tokens →</a></article>';
  }).join("")+'</section>';
}

export function renderDashboard(model,selection={},apiState="not-deployed",metrics=null,catalog=null,wallet={}){
 return '<div class="ux-app ux-dashboard ux-northstar-page">'+
  northstarStage(model)+northstarCards(model,metrics,selection.tvlPeriod)+allianceIntro()+
  dashboardTopTokens(catalog||{assets:{}},metrics)+
  '<section class="ux-dashboard-outro"><div><span class="ux-kicker">DISCOVER · CONNECT · EXPAND</span>'+
  '<h2>Explore the XITA ecosystem</h2><p>Learn how the protocol works or inspect a token route before transferring any value.</p></div>'+
  '<div class="ux-dashboard-outro-links"><a data-nav href="/faq">Read the FAQ →</a><a data-nav href="/transfer">Transfer Tokens →</a></div></section></div>';
}

// Source/destination token addresses MUST NOT be confused with ILN Gateways,
// route escrow contracts or Execution Gateways. Synthetic ERC-20 routers are
// the ERC-20 contract. A native asset has no ERC-20 address. Original ERC-20
// addresses are manifest-listed and explicitly not called on-chain verified.
export function transferTokenIdentity(model,assetId,chain){
 const asset=model?.assets?.find(a=>a.id===assetId);
 const rep=asset?.representations?.find(r=>r.chain===chain);
 const kind=rep?.representation, symbol=rep?.symbol||assetId;
 if(kind==="native"&&asset?.canonical===chain)
  return {symbol,kind:"native",description:"Native coin · no ERC-20 contract",address:null,
   evidence:"native"};
 if(kind==="synthetic"){
  const address=verifiedSyntheticContract(model?.deployments,assetId,rep);
  return {symbol,kind:"synthetic",description:"Wrapped ERC-20",address,
   evidence:address?"deployment":"unavailable"};
 }
 if(kind==="collateral"&&asset?.canonical===chain){
  const address=tokenAddress(rep?.assetAddress)?rep.assetAddress:null;
  return {symbol,kind:"collateral",description:"Original ERC-20",address,
   evidence:address?"asset-manifest":"unavailable"};
 }
 return {symbol,kind:"unknown",description:"Representation not verified",
  address:null,evidence:"unavailable"};
}
function renderTransferIdentity(model,assetId,path){
 const asset=model.assets.find(a=>a.id===assetId);
 const steps=path.path.map((chain,i)=>{
  const record=transferTokenIdentity(model,assetId,chain);
  const label=i===0?"YOU SEND":i===path.path.length-1?"YOU RECEIVE":"VIA XGRCHAIN HUB";
  const explorer=chainTokenExplorer(chain,record.address);
  const tokenText=record.kind==="native"?
   '<span>Native coin · no token contract</span>':record.address?
   '<code>'+esc(record.address)+'</code>'+
   '<button type="button" data-xita-copy-address="'+esc(record.address)+
   '" aria-label="Copy '+esc(record.symbol)+' token contract address on '+
    esc(chain)+'">Copy</button>'+
   (explorer?'<a href="'+esc(explorer)+'" target="_blank" rel="noopener noreferrer">Explorer ↗</a>':'')+
   (record.evidence==="asset-manifest"?
    '<small>Address from asset manifest · verify with the project</small>':''):
   '<span>Token contract not independently verified</span>';
  return '<div class="ux-route-identity-row"><div class="ux-route-identity-name">'+
   '<span class="ux-kicker">'+label+'</span><strong>'+
   esc(model.chains.find(c=>c.key===chain)?.label||chain)+' · '+esc(record.symbol)+'</strong>'+
   '<small>'+esc(record.description)+'</small></div>'+
   '<div class="ux-route-identity-contract">'+tokenText+'</div></div>';
 }).join("");
 const source=path.path[0],sourceRepresentation=transferTokenIdentity(model,assetId,source);
 const adapter=model.feeAdapters?.[source],adapterExplorer=chainAddressExplorer(source,adapter);
 const approval=(sourceRepresentation.kind!=="native"&&tokenAddress(adapter))?
  '<div class="ux-route-identity-approval"><span>ERC-20 allowance spender: <strong>XITA Execution Gateway</strong></span>'+
  '<code>'+esc(adapter)+'</code>'+
  (adapterExplorer?'<a href="'+esc(adapterExplorer)+'" target="_blank" rel="noopener noreferrer">Explorer ↗</a>':'')+
  '<p>An approval transaction is required only if your existing token allowance for this spender is insufficient. Approval alone does not bridge or burn tokens.</p></div>':"";
 return '<details class="ux-route-identity" aria-label="Token project and verified transfer contracts">'+
  '<summary><span class="ux-route-identity-summary"><span class="ux-kicker">TOKEN IDENTITY</span>'+
  '<strong>'+esc(path.path.map((chain,i)=>{
   const token=transferTokenIdentity(model,assetId,chain);
   return (model.chains.find(c=>c.key===chain)?.label||chain)+' · '+token.symbol;
  }).join(" → "))+'</strong></span><span class="ux-route-identity-expand">Contract details ⌄</span></summary>'+
  '<div class="ux-route-identity-body"><div class="ux-route-identity-links">'+
  (asset?.website?'<a href="'+esc(asset.website)+'" target="_blank" rel="noopener noreferrer">Official project ↗</a>':'')+
  (asset?'<a data-nav href="'+esc(tokenLink(asset))+'">Token details ↗</a>':'')+
  '</div><div class="ux-route-identity-rows">'+steps+'</div>'+approval+'</div></details>';
}
// A real standalone planner; no longer extracted from dashboard markup.
export function renderPlanRoute(model,selection={},apiState="not-deployed",wallet={},progress={}){
 // New commercial transfers are available only with fee adapters on BOTH
 // involved chains; the permissionless Gateway history remains independent.
 const routes=model.transferRoutes||[];
 const available=new Set(routes.flatMap(r=>[r.source,r.destination]));
 const openChoice=openWalletTransfers(progress.items,wallet.account);
 const currentWork=selectedRecovery(progress.items,wallet.account,progress.selectedTxHash);
 // Completed source TXs are excluded from actionable recovery, but a resume
 // deep link must report canonical successful delivery, never "not verified".
 const completedWork=(progress.items||[]).find(item=>
  item?.account?.toLowerCase()===wallet.account?.toLowerCase()&&
  item.txHash?.toLowerCase()===progress.selectedTxHash?.toLowerCase()&&
  item.confirmed===true&&item.delivered===true&&
  ["delivered","journey-delivered"].includes(item.status))||null;
 // Recovery must remain usable even if the old Gateway route predates the
 // deployment of the commercial Execution Gateway contracts.
 const recoveryChains=new Set(currentWork?[
  currentWork.sourceChain,currentWork.destinationChain,currentWork.finalDestinationChain]:[]);
 const deployedChains=model.chains.filter(c=>available.has(c.key)||recoveryChains.has(c.key));
 const deployedAssets=new Set(routes.map(r=>r.asset));
 const usableAssets=model.assets.filter(a=>deployedAssets.has(a.id)||a.id===currentWork?.asset);
 const requestedOrigin=currentWork?.sourceChain||selection.origin;
 const requestedDestination=currentWork?.finalDestinationChain||currentWork?.destinationChain||selection.destination;
 const requestedAsset=currentWork?.asset||selection.asset;
 const origin=deployedChains.some(c=>c.key===requestedOrigin)?requestedOrigin:
   deployedChains.some(c=>c.key===HUB)?HUB:deployedChains[0]?.key||"";
 const destination=deployedChains.some(c=>c.key===requestedDestination)&&requestedDestination!==origin?
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
 // A resume deep link is not authorization to initiate a source TX.
 // Unknown records remain non-actionable until the wallet index verifies them.
 const resumeRequested=/^0x[0-9a-f]{64}$/i.test(progress.selectedTxHash||"");
 const recoveryUnresolved=connected&&resumeRequested&&!selected&&!completedWork;
 // Status reopening never submits or retries a wallet transaction.
 const showStatusButton=connected&&(progress.hasFlow===true||Boolean(selected)||Boolean(completedWork));
 const amount=/^(?:\d+)?(?:\.\d*)?$/.test(selection.amount||"")?selection.amount||"":"";
 const isDirect=path.path.length===2;
 const proofCheck=selected?.status==="awaiting-final-proof"?
   selected.finalProofObservation:selected?.proofObservation;
 const backgroundChecking=selected&&
   ["queued","checking","waiting"].includes(proofCheck?.state);
 const actionLabel=!connected?"Connect wallet to transfer":
  busy?"Preparing transaction…":
  backgroundChecking?"Validator proof is being checked…":
  selected?.status==="awaiting-proof"?"Continue delivery":
  selected?.status==="awaiting-onward"?"Continue XGR onward transfer":
  selected?.status==="awaiting-final-proof"?"Continue final delivery":
  selected?"Check delivery status":
  completedWork?"Transfer complete":
  recoveryUnresolved?"Locating previous transfer…":
  !routes.length?"Interchain Fee gateway not deployed":
  !deployed?"Route unavailable":
  !isDirect?"Transfer "+assetId+" via XGRChain":
  "Transfer "+assetId+" → "+(model.chains.find(c=>c.key===destination)?.label||destination);
 const buttonDisabled=busy||backgroundChecking||recoveryUnresolved||Boolean(completedWork)||connected&&(!deployed&&!selected);
 const progressValue=completedWork?2:selected?.confirmed?1:0;
 const statusLabel=selected?.status==="awaiting-proof"?"Source confirmed · destination not delivered":
  selected?.status==="awaiting-onward"?"XGRChain delivered · final hop still unverified":
  selected?.status==="awaiting-final-proof"?"Second hop confirmed · final delivery outstanding":
  selected?.status==="final-delivery-unknown"?"Second hop confirmed · target RPC status unknown":
  selected?.status==="delivery-unknown"?"Source confirmed · destination RPC unavailable":
  selected?.status==="confirming"?"Source transaction is awaiting finality":
  selected?.status==="pending-source"?"Source transaction pending":
  selected?.status==="destination-not-deployed"?"Destination Mailbox unavailable":
  completedWork?"Destination delivery confirmed":
  recoveryUnresolved?"Previous transfer not yet verified":
  connected?"Wallet connected":
  "Connect your wallet";
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
   esc((r.asset||"Token")+' · '+r.sourceChain+' → '+(r.finalDestinationChain||r.destinationChain)+' · '+r.txHash.slice(0,10)+'…')+
  '</option>').join("");
 const destinationLabel=model.chains.find(c=>c.key===destination)?.label||destination;
 const feeCard=
  '<section class="ux-panel ux-fee-preview" aria-labelledby="ux-fee-heading">'+
  '<div class="ux-fee-header"><div><span class="ux-kicker">ADDITIONAL ROUTE FEES</span>'+
  '<h3 id="ux-fee-heading">Transfer costs</h3></div>'+
  '<button type="button" class="ux-fee-help" id="ux-fee-info-trigger" aria-haspopup="dialog" aria-controls="ux-fee-info-dialog" aria-label="How are transfer fees calculated?" title="About route fees and network gas">?</button></div>'+
  '<div class="ux-fee-route">'+esc(originLabel)+' → '+esc(destinationLabel)+(isDirect?'':' · via XGRChain')+'</div>'+
  '<div id="ux-fee-preview-status" class="ux-fee-status" role="status" aria-live="polite">Enter an amount to estimate route fees.</div>'+
  '<div id="ux-fee-preview-details" class="ux-fee-breakdown" hidden></div>'+
  '<p class="ux-fee-footnote">Plus network gas for wallet transactions'+
   (progress.sponsorship?.available===true?' (sponsorship subject to eligibility).':' (unless sponsored).')+
  '</p></section>';
 const feeDialog=
  '<dialog id="ux-fee-info-dialog" class="ux-fee-dialog" aria-labelledby="ux-fee-info-title">'+
  '<div class="ux-fee-dialog-header"><div><span class="ux-kicker">XITA · TRANSFER FEES</span>'+
  '<h2 id="ux-fee-info-title">What will I pay?</h2></div>'+
  '<button id="ux-fee-info-close" type="button" aria-label="Close fee information">×</button></div>'+
  '<dl><dt>Protocol fee</dt><dd>The native network protocol fee required for the source route.</dd>'+
  '<dt>XITA Service Fee</dt><dd>A fee for the optional XITA execution service. Its estimate includes quoted downstream execution and processing costs for the selected route.</dd></dl>'+
  '<h3>Network gas is additional</h3>'+
  '<p>Every hop involves wallet-authorized blockchain transactions. Source lock/burn, destination message delivery and any onward hop require network gas in the respective chain’s native currency. An ERC-20 approval can require an additional transaction. These wallet gas costs are not included in the route fee shown here.</p>'+
  '<p>Gas sponsorship only applies to specific steps when explicitly offered and confirmed. Otherwise ensure that you have enough gas on each required chain.</p>'+
  '<p>Figures are non-binding estimates. XITA requests a fresh signed service quote before the source transaction. Exchange rates and network gas can change.</p>'+
  '<button type="button" class="ux-fee-dialog-done" data-fee-info-close>Close</button>'+
  '</dialog>';
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
  (deployed?renderTransferIdentity(model,assetId,path):'')+
  (pending.length?'<div class="ux-transfer-outstanding">'+activeLabel+
   '<label class="ux-field" for="xita-open-transfer">Previous transfers awaiting delivery ('+pending.length+')</label>'+
   '<select id="xita-open-transfer"><option value=""'+(!selected?' selected':'')+'>New transfer</option>'+options+'</select>'+
   '<p class="ux-small">Older deliveries are optional to continue here. They do not disable a new transfer. The original source lock is never repeated.</p></div>':'')+
  '<div class="ux-transfer-action"><button type="button" class="ux-button" id="xita-transfer-primary"'+
   (buttonDisabled?' disabled':'')+'>'+esc(actionLabel)+'</button>'+
  (showStatusButton?'<button type="button" class="ux-outline-button ux-transfer-status-trigger"'+
   ' id="xita-flow-reopen" aria-haspopup="dialog" aria-controls="xita-flow-dialog">'+
   '↗ View transfer status</button>':'')+
  (progress.error&&!showStatusButton?'<p class="ux-transfer-error" id="xita-transfer-form-error" role="alert">'+esc(progress.error)+'</p>':"")+
  '<p class="ux-transfer-action-hint">'+
  esc(!connected?"Connect your wallet to check the route and make a transfer.":
   selected?"Existing source transfer selected; the original lock will not be repeated.":
   busy?"Checking the selected transaction against the blockchain.":
   !routes.length?"New transfers need a verified Interchain Fee · Execution Gateway on each chain. Existing Gateway transfers can still be recovered.":
   deployed&&isDirect?"Gas and contract checks run before MetaMask asks you to sign.":
   "Only verified deployed routes can be transferred.")+'</p></div>'+
  (!routes.length&&model.deployments?.length?
   '<p class="ux-transfer-error">The Interchain Fee · Execution Gateway is not verified on both chains. New XITA transfers are disabled. Previously locked transfers remain accessible through My Transfers.</p>':'')+
  (!deployed&&model.routes.some(r=>r.assetId==="XGR"&&r.source==="xgrchain"&&r.destination==="base")&&!model.deployments?.length?
   '<p class="ux-transfer-error">The downloaded site catalog has an XGR/Base route configured but lacks a complete deployment record. No transaction is allowed. Verify the published catalog.json against the current GitHub main.</p>':'')+
  (!isDirect&&deployed?'<p class="ux-small">XITA continuously checks both hops through XGRChain. Every required wallet transaction must still be confirmed in MetaMask.</p>':'')+
  (connected?'<p class="ux-small">Past transfers and outstanding delivery proofs: <a data-nav href="/my-transfers">My Transfers</a>. History indexing does not block a new transaction.</p>':"")+
  '</section><div class="ux-transfer-side">'+feeCard+'</div></div>'+feeDialog+
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
  ["How do transfers between two external chains work?","XGRChain acts as the hub. A journey from one external chain to another requires two separate transfers: first to XGRChain, then to the destination network. XITA continuously monitors both hops, but each wallet transaction must be confirmed by the user in MetaMask."],
  ["What is a wrapped token?","A wrapped or synthetic representation makes an asset usable on a second chain. It is not the original token on its home network; always check its canonical origin and verified contracts."],
  ["What happens if a relayer is unavailable?","A relayer can be replaced. An interrupted transfer may remain pending until delivery is resumed or recovered. Use the verified transaction and message status rather than assuming an automatic refund."],
  ["What does a transfer cost?","XITA route fees comprise the source-chain protocol fee and XITA Service Fee. Both are additional to the blockchain network gas paid separately for wallet transactions, source lock/burn and destination delivery on each hop. ERC-20 approval can require additional gas. Two-hop journeys include additional processing and gas transactions. Optional gas sponsorship covers only eligible gas steps when expressly confirmed; otherwise fund gas on every required chain. A fresh signed service quote is obtained before the source transaction."]
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
export function renderUniverse(model,selected=HUB,metrics=null,wallet={}){
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
   systemDetails(model,selected,metrics,wallet)+'</aside></div></div>';
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
