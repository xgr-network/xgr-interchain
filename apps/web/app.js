import {publicDirectoryCatalog,isDeployedAsset,listingStatus} from "./listing-visibility.js";
import {draft,validateStep,joinMarkup} from "./join.js";
import {buildLeaderboardRows,rankAssets,formatUsd,verifiedMetrics} from "./leaderboard-data.js";
import {mountUniverse3D} from "./universe-3d.js";
import {buildExperienceModel,renderDashboard,renderUniverse,renderPlanRoute,renderFAQ,renderTokenBridge} from "./experience.js";
import {loadXetaOverview,loadXetaAsset,loadXetaTransfers,loadMarketPrice,aggregate,displayPrice,displayUnix} from "./ui-data.js";
import {connectWallet,shorten,formatUnits} from "./wallet-core.js";
import {readNativeGasBalances} from "./wallet-gas.js";
import {findWalletSourceTx,scanRecentWalletTransfers} from "./wallet-transfers.js";
import {renderMyTransfers,validWalletAddress} from "./transfer-page.js";
import {startTransfer,resumeDelivery,waitForWalletReceipt} from "./transfer-actions.js";
import {readWalletTokenBalances} from "./wallet-token-balances.js";
const el=document.querySelector("#app"),connect=document.querySelector("#connect");
const state={catalog:null,assetId:"XGR",account:null,quote:null,quoteKey:null,transfer:null,walletChainId:null,walletGas:null,walletBalances:null,walletTokenBalances:null,walletGasCheckedAt:null,walletGasLoading:false,busy:false,indexed:null,assetStats:{},transfers:{},prices:{},apiState:"not-deployed",experience:{system:"xgrchain",origin:"xgrchain",destination:"base",asset:"XGR"},leaderboard:null,visibility:null,leaderboardSort:"lockedUsd",leaderboardDir:"desc",leaderboardSearch:"",universeSort:"lockedUsd",universeQuery:""};
const names={xgrchain:"XGRChain",base:"Base",polygon:"Polygon",arbitrum:"Arbitrum"};
let transferRequest=0;
const transferActivity={items:[],scanned:false,scanning:false,working:false,selectedTxHash:null,report:null,notice:"",error:""};
function refreshTransferLink(){
 const link=document.querySelector("#my-transfers-link");
 if(link)link.hidden=!validWalletAddress(state.account);
}
function setConnectedAccount(next){
 const account=validWalletAddress(next)?next:null;
 const changed=state.account?.toLowerCase()!==account?.toLowerCase();
 state.account=account;
 connect.textContent=account?shorten(account):"Connect Wallet";
 if(changed){
  transferRequest++;
  Object.assign(transferActivity,{items:[],scanned:false,scanning:false,working:false,selectedTxHash:null,report:null,notice:"",error:""});
 }
 refreshTransferLink();
 if(!account&&path()==="/my-transfers")history.replaceState(null,"","/");
 if(state.catalog&&(changed||path()==="/my-transfers"))render();
 if(changed&&account&&state.catalog)void scanWalletHistory();
}
function upsertTransfer(record){
 transferActivity.items=[record,...transferActivity.items.filter(t=>
  !(t.sourceChain===record.sourceChain&&t.txHash===record.txHash))];
}
async function scanWalletHistory(){
 const account=state.account;
 if(!account||!state.catalog||transferActivity.scanning)return;
 const marker=++transferRequest;
 transferActivity.scanning=true;transferActivity.scanned=true;transferActivity.error="";
 if(path()==="/my-transfers"||path()==="/transfer")render();
 try{
  const results=await scanRecentWalletTransfers({catalog:state.catalog,account});
  if(marker!==transferRequest||state.account?.toLowerCase()!==account.toLowerCase())return;
  for(const record of results.items)upsertTransfer(record);
  transferActivity.report=results;
  transferActivity.notice=results.scannedRoutes===0?
   "No deployed XITA Gateway routes are available. No transfers were inferred.":
   "Recent wallet events checked on-chain; older transactions can be found by TX hash.";
  if(results.warnings.length)transferActivity.error=
   "Some RPC scans failed. Use original source TX hash for older activity.";
 }catch(error){
  if(marker!==transferRequest)return;
  transferActivity.error="Could not scan recent source events: "+String(error.message||error);
 }finally{
  if(marker===transferRequest){
   transferActivity.scanning=false;
   if(path()==="/my-transfers"||path()==="/transfer")render();
  }
 }
}
async function lookupWalletTransfer(sourceChain,txHash){
 const account=state.account;
 if(!account||!state.catalog||transferActivity.scanning)return;
 const marker=++transferRequest;
 transferActivity.scanning=true;transferActivity.error="";
 transferActivity.notice="Checking the original source transaction and its destination Mailbox…";
 if(path()==="/my-transfers"||path()==="/transfer")render();
 try{
  const record=await findWalletSourceTx({catalog:state.catalog,account,sourceChain,txHash});
  if(marker!==transferRequest||state.account?.toLowerCase()!==account.toLowerCase())return;
  upsertTransfer(record);
  transferActivity.notice=record.status==="delivered"?
   "Destination delivery independently confirmed.":
   "Original source transaction checked. Do not repeat the source bridge call.";
 }catch(error){
  if(marker!==transferRequest)return;
  transferActivity.error=String(error.message||error);
  transferActivity.notice="";
 }finally{
  if(marker===transferRequest){
   transferActivity.scanning=false;
   if(path()==="/my-transfers"||path()==="/transfer")render();
  }
 }
}
async function performTransferAction(){
 if(transferActivity.working||transferActivity.scanning||!state.catalog)return;
 if(!state.account){document.querySelector("#connect")?.click();return;}
 const account=state.account;
 const candidates=transferActivity.items.filter(t=>
  ["awaiting-proof","delivery-unknown","confirming","pending-source","destination-not-deployed"].includes(t.status));
 const selected=candidates.find(t=>t.txHash===transferActivity.selectedTxHash)||candidates[0]||null;
 transferActivity.working=true;transferActivity.error="";
 transferActivity.notice=selected?"Rechecking original source and destination chains…":
  "Checking the deployed source Gateway quote…";
 render();
 try{
  if(selected){
   if(selected.status!=="awaiting-proof"){
    await lookupWalletTransfer(selected.sourceChain,selected.txHash);
    return;
   }
   const result=await resumeDelivery({catalog:state.catalog,account,record:selected,
    provider:globalThis.ethereum,onBroadcast:({txHash})=>{
     transferActivity.notice="Destination TX "+txHash+
      " submitted. Original source transfer is NEVER repeated.";
    }});
   transferActivity.notice=result.status==="delivered"?
    "Delivery confirmed by the destination Mailbox.":
    result.status==="waiting"?result.notice||"Validator proof pending; retry later.":
    result.status==="failed"?"Destination TX failed; retry only the destination.":
    "Destination TX pending; do not repeat it until chain status is checked.";
   await lookupWalletTransfer(selected.sourceChain,selected.txHash);
   return;
  }
  const model=buildExperienceModel(state.catalog,()=>false);
  const asset=state.experience.asset,origin=state.experience.origin,
   destination=state.experience.destination,amount=state.experience.amount||"";
  if(!model.deployments.some(r=>r.asset===asset&&r.source===origin&&r.destination===destination))
   throw Error("Select a directly deployed route. Multi-hop transfers proceed one hop at a time.");
  const sent=await startTransfer({catalog:state.catalog,account,asset,source:origin,
   destination,amount,provider:globalThis.ethereum,
   onBroadcast:({txHash})=>{
    transferActivity.notice="Source TX "+txHash+" submitted; do NOT lock/burn again while pending.";
    render();
   }});
  transferActivity.notice="Source TX submitted. Waiting for lock/burn confirmation…";
  const receipt=await waitForWalletReceipt(globalThis.ethereum,sent.txHash,{attempts:20,delayMs:2500});
  if(!receipt)transferActivity.notice="Source TX still pending. Reconnect later to rescan the chain.";
  else if(receipt.status!=="0x1")transferActivity.notice="Source TX reverted; no lock/burn was committed.";
  else await lookupWalletTransfer(sent.sourceChain,sent.txHash);
 }catch(error){
  transferActivity.error=String(error.message||error);
 }finally{
  if(state.account?.toLowerCase()===account.toLowerCase()){
   transferActivity.working=false;
   if(path()==="/transfer")render();
  }
 }
}
const routeName=r=>(names[r.sourceChain]||r.sourceChain)+" → "+(names[r.destinationChain]||r.destinationChain);
const x=raw=>String(raw??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const asset=()=>state.catalog.assets[state.assetId]||state.catalog.assets.XGR;
const profile=id=>state.catalog.assets[id]?.profile||{name:id,slug:id.toLowerCase(),shortDescription:"",description:"",categories:[],tags:[],links:{},branding:{}};
const tokenUrl=id=>"/token/"+encodeURIComponent(profile(id).slug);
const allAssets=()=>Object.keys(state.catalog.assets);
const publicCatalog=()=>publicDirectoryCatalog(state.catalog,state.visibility);
const routes=()=>asset().routes.routes;
const activeFor=id=>0;
const path=()=>decodeURIComponent(location.pathname).replace(/\/+$/,"")||"/";
const btn=(url,label,alt=false)=>'<a data-nav href="'+url+'" class="btn'+(alt?" alt":"")+'">'+label+'</a>';
const fmt=(n,dec=18)=>formatUnits(n,dec,10);
const note=t=>'<div class="notice">'+t+'</div>';
function projectLogo(id){
 const p=profile(id),url=p.branding?.logoUrl;
 const initial=x(id.slice(0,1));
 return '<span class="logo">'+(typeof url==="string"&&url.startsWith("https://")?
  '<img class="token-logo" alt="'+x(p.name)+' logo" src="'+x(url)+'" loading="lazy">':initial)+'</span>';
}
function tokenCard(id){
 const p=profile(id);
 return '<div class="card token-link">'+projectLogo(id)+'<div><h3>'+x(p.name)+' ('+x(id)+')</h3>'+
  '<p class="muted">'+x(p.shortDescription)+'</p>'+
  '<small class="muted">'+activeFor(id)+' of '+state.catalog.assets[id].routes.routes.length+' routes active</small><br>'+
  btn(tokenUrl(id),"Open token & bridge")+'</div></div>';
}
function metric(label,value,noteText){
 return '<div class="card"><small>'+x(label)+'</small><strong>'+x(value)+'</strong><small>'+x(noteText)+'</small></div>';
}
function summaryFor(id,period){
 const stat=state.assetStats[id];
 return aggregate(stat?.[period]||null,state.catalog.assets[id].metadata.decimals);
}
function indexedCount(id,period){
 const s=summaryFor(id,period);
 return s?s.count.toLocaleString("en-US"):"—";
}
function amountFor(id,period){
 const s=summaryFor(id,period);
 if(!s)return "—";
 if(!s.count)return "0 observed";
 return s.amount+" "+id+(s.complete?"":" (partial)");
}
function projectLinks(id){
 const links=profile(id).links||{};
 const titles={website:"Website",explorer:"Explorer",github:"GitHub",docs:"Documentation",whitepaper:"Whitepaper",x:"X",linkedin:"LinkedIn",telegram:"Telegram",discord:"Discord"};
 return Object.entries(titles).filter(([key])=>typeof links[key]==="string"&&links[key].startsWith("https://"))
  .map(([key,title])=>'<a class="pill-link" target="_blank" rel="noopener noreferrer" href="'+x(links[key])+'">'+title+' ↗</a>').join(" ");
}
function indexerNotice(){
 if(state.apiState==="ready")return '<p class="status">Source: independent XITA ILN indexer. Only verified deployed Gateway events are counted; this is not DEX trading volume.</p>';
 if(state.apiState==="error")return '<p class="status">XITA event index is currently unavailable. No figures are inferred.</p>';
 return '<p class="status">XITA event index not yet online. Unavailable transfer statistics are not zero.</p>';
}
function markets(){
 const rows=rankAssets(buildLeaderboardRows(publicCatalog(),state.leaderboard),state.leaderboardSort,state.leaderboardDir)
  .filter(row=>(row.name+" "+row.id).toLowerCase().includes(state.leaderboardSearch.toLowerCase()));
 const columns=[["lockedUsd","Locked TVL"],["movedUsd","Moved via XGR"],["marketCapUsd","Market cap"]];
 const th=columns.map(([key,label])=>'<th><button class="ux-sort-btn" type="button" data-leader-sort="'+key+'" aria-pressed="'+(state.leaderboardSort===key)+'">'+label+' <span>'+(state.leaderboardSort===key?(state.leaderboardDir==="desc"?"↓":"↑"):"↕")+'</span></button></th>').join("");
 const cells=rows.map((row,i)=>'<tr data-token="'+x(row.id)+'"><td class="ux-rank">'+(i+1)+'</td><td><a class="ux-leader-token" data-nav href="/token/'+encodeURIComponent(row.slug)+'">'+
 (typeof row.logo==="string"&&row.logo.startsWith("https://")?'<img src="'+x(row.logo)+'" loading="lazy" alt="">':'<span class="ux-leader-placeholder">✦</span>')+
 '<span><strong>'+x(row.name)+'</strong><small>'+x(row.id)+'</small></span></a></td>'+
 '<td class="ux-leader-value">'+formatUsd(row.lockedUsd)+'</td>'+
 '<td class="ux-leader-value">'+formatUsd(row.movedUsd)+'</td>'+
 '<td class="ux-leader-value">'+formatUsd(row.marketCapUsd)+'</td>'+
 '<td class="ux-leader-value">'+row.configuredRoutes+'</td></tr>').join("");
 return '<div class="ux-app ux-leaderboard"><div class="ux-kicker">XITA · ASSET DISCOVERY</div><div class="ux-leader-head"><div><h1>Explore <span>Tokens</span></h1>'+
 '<p class="ux-lead">Discover assets by verified locked collateral, unique interchain value moved through XGRChain and token market capitalization.</p></div>'+
 '<div class="ux-leader-info">Locked and moved: on-chain verified<br><small>Market caps: external provider data when configured</small></div></div>'+
 '<div class="ux-leader-highlights"><div><span>Assets listed</span><strong>'+Object.keys(publicCatalog().assets).length+'</strong></div>'+
 '<div><span>Verified custody TVL</span><strong>'+formatUsd(state.leaderboard?.totals?.lockedUsd)+'</strong></div>'+
 '<div><span>Moved through XGR</span><strong>'+formatUsd(state.leaderboard?.totals?.movedUsd)+'</strong></div></div>'+
 '<section class="ux-panel ux-leader-table-panel"><div class="ux-leader-toolbar"><div><h2>Explore assets</h2><p class="ux-small">Click a column heading to sort · Missing metrics always rank last</p></div>'+
 '<label class="ux-leader-search-label"><span>Search tokens</span><input id="ux-leader-search" type="search" placeholder="Name or symbol…" value="'+x(state.leaderboardSearch)+'"></label></div>'+
 '<div class="ux-leader-scroll"><table class="ux-leader-table"><thead><tr><th>#</th><th>Asset</th>'+th+'<th>Routes configured</th></tr></thead>'+
 '<tbody>'+cells+'</tbody></table></div>'+
 (!rows.length?'<p class="ux-muted">No matching assets.</p>':'')+'</section>'+
 '<p class="ux-leader-footnote">Locked TVL counts only independently verified net collateral in distinct route escrows, not wrapped token supply or incidental deposits. Moved value deduplicates journeys through XGRChain. No verified indexer snapshot means unknown, not zero. Market capitalization requires verified market price and circulating supply; unverified values remain unavailable.</p></div>';
}
function feeBreakdown(id){
 const rows=state.assetStats[id]?.lifetime||[];
 if(!rows.length)return "No indexed validator fees";
 return rows.map(row=>{
  const chain=Object.values(state.catalog.chains).find(c=>c.chainId===row.sourceChainId);
  return fmt(BigInt(row.feeWei||"0"))+" "+(chain?.nativeCurrency?.symbol||"native")+" ("+
    x(chain?.name||row.sourceChainId)+")";
 }).join(" · ");
}
function historyMarkup(id){
 const data=state.transfers[id];
 if(!data)return '<p class="muted">Event history is not available yet.</p>';
 if(!data.items?.length)return '<p class="muted">No confirmed XETA Gateway operations observed in the indexed coverage.</p>';
 return '<div style="overflow:auto"><table class="table"><thead><tr>'+
  '<th>Time</th><th>Direction</th><th>Transferred</th><th>Status</th><th>Message</th></tr></thead><tbody>'+
  data.items.map(item=>{
   const src=Object.values(state.catalog.chains).find(c=>c.chainId===item.sourceChainId);
   const dst=Object.values(state.catalog.chains).find(c=>c.chainId===item.destinationChainId);
   const amount=item.amountRaw===null||item.amountRaw===undefined?"Unknown":fmt(BigInt(item.amountRaw),asset().metadata.decimals)+" "+id;
   const mid=String(item.messageId||"");
   return '<tr><td>'+x(displayUnix(item.timestamp))+'</td><td>'+
    x((src?.name||item.sourceChainId)+" → "+(dst?.name||item.destinationChainId))+'</td><td>'+x(amount)+'</td><td>'+
    (item.delivered?'<span class="live-chip">Delivered</span>':'<span class="tag">Delivery unverified</span>')+'</td><td><span title="'+x(mid)+'">'+
    x(mid.slice(0,10)+"…"+mid.slice(-6))+'</span></td></tr>';
  }).join("")+'</tbody></table></div>';
}
function tokenActivity(id){
 const last=summaryFor(id,"last24h"),week=summaryFor(id,"sevenDays"),all=summaryFor(id,"lifetime");
 return '<div class="cards">'+metric("24h transfers",last?String(last.count):"—","Confirmed source operations")+
 metric("7-day transfers",week?String(week.count):"—","Indexed Gateway events")+
 metric("Delivered",all?all.delivered+" observed":"—","Destination Mailbox verified")+
 metric("24h bridge volume",amountFor(id,"last24h"),"No value invented for indirect transfers")+'</div>'+
 '<div class="card"><h3>Validator fees (indexed lifetime)</h3><p class="muted">'+x(feeBreakdown(id))+'</p>'+
 '<small class="muted">Source-native amounts are listed by chain and never aggregated across denominations.</small></div>'+
 '<h3>Recent source transfers</h3>'+historyMarkup(id)+indexerNotice();
}
function tokenMarketMarkup(id){
 const row=state.leaderboard?.assets?.[id],facts=verifiedMetrics(state.leaderboard,id);
 if(row?.market?.status!=="market-data"||row.market.source!=="coingecko"||facts?.marketCapUsd==null)return '<div class="pair"><span>CoinGecko market cap</span><b>—</b></div>';
 const asOf=typeof row.market.asOf==="string"&&Number.isFinite(Date.parse(row.market.asOf))?new Date(row.market.asOf).toLocaleString("en-US",{timeZone:"UTC",dateStyle:"medium",timeStyle:"short"})+" UTC":"Timestamp unavailable";
 return '<div class="pair"><span>Market cap (asset-wide)</span><b>'+x(formatUsd(facts.marketCapUsd))+'</b></div>'+
  '<p class="ux-small">CoinGecko · '+x(asOf)+' · Not XITA collateral / TVL</p>';
}
function token(){
 const id=state.assetId,a=asset(),p=profile(id),canonical=a.metadata.canonical?.chain||"unknown";
 const model=buildExperienceModel(state.catalog,()=>false);
 const stage=listingStatus(a,state.visibility?.assets?.[id]);
 const chips=(p.categories||[]).map(cat=>'<span class="category-chip">'+x(cat)+'</span>').join(" ");
 return '<div class="columns"><article><a href="/markets" data-nav class="muted">← All tokens</a>'+
 '<div class="token-link section">'+projectLogo(id)+'<div><div class="eyebrow">'+x(names[canonical]||canonical)+' · Canonical asset</div>'+
 '<h1>'+x(p.name)+' <small>'+x(id)+'</small></h1><span class="tag">'+x(stage)+'</span></div></div>'+
 '<div class="card"><h2>Project overview</h2><p class="lead" style="font-size:16px">'+x(p.shortDescription)+'</p><p class="muted">'+x(p.description)+'</p>'+chips+
 '<div class="pair"><span>Canonical network</span><b>'+x(names[canonical]||canonical)+'</b></div>'+
 '<div class="pair"><span>Token decimals</span><b>'+a.metadata.decimals+'</b></div>'+
 '<div class="pair"><span>Deployed XITA routes</span><b>'+
  (a.deployment?.routeDeployments?.length||0)+' / '+routes().length+'</b></div>'+
 '<div class="pair"><span>Market price</span><b>'+x(state.leaderboard?.assets?.[id]?.market?.source==="coingecko"?formatUsd(state.leaderboard.assets[id].market.priceUsd):displayPrice(state.prices[id]))+'</b></div>'+tokenMarketMarkup(id)+
 '<h3>Project links</h3><div class="project-links">'+projectLinks(id)+'</div></div>'+
 '<section class="section"><h2>Network representations</h2><div class="routes">'+(a.metadata.representations||[]).map(rep=>
 '<div class="route"><strong>'+x(names[rep.chain]||rep.chain)+'</strong> · '+x(rep.symbol)+
 '<p class="muted">'+x(rep.representation)+' · '+(rep.assetAddress?x(rep.assetAddress):"Deployment pending verification")+'</p></div>').join("")+'</div></section>'+
 '<section class="section"><h2>Configured interchain routes</h2><div class="routes">'+routes().map(rt=>
 '<div class="route"><strong>'+x(routeName(rt))+'</strong><div class="ux-small">'+
   (a.deployment?.routeDeployments?.some(r=>r.routeName===rt.name)?
    'Deployed · Gateway '+x(a.deployment.routeDeployments.find(r=>r.routeName===rt.name).components.gateway.address):
    'Prospect · configured only')+'</div></div>').join("")+'</div></section>'+
 '</article><aside class="card ux-token-aside">'+renderTokenBridge(model,id,state.experience,walletGasView())+'</aside></div>';
}
const joinState={data:null,step:0,status:""};
function join(){
 if(!joinState.data)joinState.data=draft(state.catalog.chains);
 return joinMarkup(state.catalog.chains,joinState.data,joinState.step,joinState.status);
}
function drawJoin(){if(path()==="/join")render();}
function captureJoin(){
 const d=joinState.data;
 document.querySelectorAll("[data-join]").forEach(el=>{
  const key=el.dataset.join;
  if(el.type==="checkbox")d[key]=el.checked;
  else if(key==="decimals")d[key]=el.value===""?null:Number(el.value);
  else d[key]=el.value;
 });
 d.symbol=d.symbol.trim().toUpperCase();d.slug=d.slug.trim().toLowerCase();
 if(document.querySelector("[data-join-target]"))d.targets=[...document.querySelectorAll("[data-join-target]:checked")].map(el=>el.dataset.joinTarget);
}
async function runJoin(action){
 captureJoin();
 const d=joinState.data;
 if(action==="back"){joinState.step=Math.max(0,joinState.step-1);joinState.status="";drawJoin();return;}
 if(action==="export"){
  const blob=new Blob([JSON.stringify({...d,kind:"xita-alliance-application-draft"},null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="xita-alliance-application.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  joinState.status="Downloaded locally; no data was submitted.";drawJoin();return;
 }
 const problems=validateStep(d,joinState.step,state.catalog.chains);
 if(problems.length){
   joinState.status="Please complete the required fields.";
   const fields={name:"name",symbol:"symbol",slug:"slug",website:"website",
     "Short description (15–280 characters)":"shortDescription",
     "Full description (40–5000 characters)":"description",
     "CoinGecko coin ID":"coingeckoId",
     "ERC-20 contract address":"canonicalAddress",
     "Canonical chain":"canonicalChain",Decimals:"decimals",
     "Logo URL or PNG":"logoUrl","Token URL slug":"slug","HTTPS website":"website",
     "Project confirmation":"confirmed","One or more other chains":"targets"};
   drawJoin();
   const errors=[];
   for(const problem of problems){
     const key=fields[problem]||fields[Object.keys(fields).find(k=>problem.startsWith(k))];
     const field=key?document.querySelector('[data-join="'+key+'"]'):null;
     if(field){
       field.setAttribute("aria-invalid","true");
       field.closest(".ja-field")?.classList.add("is-invalid");
       const msg=document.createElement("span");msg.className="ja-field-error";msg.textContent=problem+" is required or invalid";
       field.closest(".ja-field")?.appendChild(msg);errors.push(field);
     }
   }
   const status=el.querySelector("#ja-status");
   if(status)status.textContent="Please complete: "+problems.join(", ");
   errors[0]?.focus({preventScroll:true});
   return;
 }
 if(action==="next"){joinState.step=Math.min(3,joinState.step+1);joinState.status="";drawJoin();return;}
 if(action==="submit"){
  joinState.status="Validating public token manifests…";drawJoin();
  try{
   const response=await fetch("/api/xita/join/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});
   const body=await response.json();
   if(!response.ok||!body.ok)throw Error(body.error||"Backend preview unavailable");
   joinState.status="Manifest validation passed. "+body.files.length+" files prepared. Automatic PR submission requires verified project identity and a configured server-side GitHub writer; use Export draft until enabled.";
  }catch(e){joinState.status="Preview unavailable: "+e.message+". You can still export the local application draft.";}
  drawJoin();
 }
}
let walletGasRequest=0;
const walletGasView=()=>({account:state.account,chainId:state.walletChainId,
  balances:state.walletBalances,tokenBalances:state.walletTokenBalances,
  checkedAt:state.walletGasCheckedAt,loading:state.walletGasLoading});
async function updateWalletGas(){
 const request=++walletGasRequest;
 const account=state.account;
 if(!account||!state.catalog||!globalThis.ethereum?.request){
  state.walletBalances=null;state.walletTokenBalances=null;state.walletGasCheckedAt=null;state.walletGasLoading=false;
  if(state.catalog&&(path()==="/transfer"||path()==="/plan-route"||path().startsWith("/token/")))render();
  return;
 }
 state.walletGasLoading=true;state.walletBalances=null;state.walletTokenBalances=null;state.walletGasCheckedAt=null;
 if(path()==="/transfer"||path()==="/plan-route"||path().startsWith("/token/"))render();
 try{
  // Read balances only. Never switch chains, sign, approve or submit.
  const [result,tokenBalances]=await Promise.all([
   readNativeGasBalances({account,chains:state.catalog.chains,provider:globalThis.ethereum,
     fetcher:globalThis.fetch.bind(globalThis)}),
   readWalletTokenBalances({account,catalog:state.catalog})
  ]);
  if(request!==walletGasRequest||state.account?.toLowerCase()!==account.toLowerCase())return;
  state.walletChainId=result.walletChainId;
  state.walletBalances=result.balances;
   state.walletTokenBalances=tokenBalances;
  state.walletGasCheckedAt=result.checkedAt;
 }catch{
  if(request!==walletGasRequest)return;
  state.walletBalances=null;state.walletTokenBalances=null;state.walletGasCheckedAt=null;
 }finally{
  if(request===walletGasRequest){
   state.walletGasLoading=false;
   if(path()==="/transfer"||path()==="/plan-route"||path().startsWith("/token/"))render();
  }
 }
}
let cosmos=null;
function render(){
 if(cosmos){cosmos.dispose();cosmos=null;}
 const rawPath=path();
 if(rawPath==="/universe"){history.replaceState(null,"","/");}
 if(rawPath==="/plan-route")history.replaceState(null,"","/transfer"+location.search);
 const p=rawPath==="/universe"?"/":rawPath==="/plan-route"?"/transfer":rawPath;
 if(p==="/transfer"){
  const preselect=new URLSearchParams(location.search).get("token");
  if(preselect&&state.catalog?.assets?.[preselect])state.experience.asset=preselect;
 }
 if(p==="/my-transfers"&&!state.account){
  history.replaceState(null,"","/");
  return render();
 }
 const match=/^\/token\/([a-z0-9-]{1,80})$/.exec(p);
 const id=match?allAssets().find(a=>profile(a).slug===match[1]):null;
 state.assetId=id||"XGR";
 const universe=buildExperienceModel(p==="/"||p==="/universe"?publicCatalog():state.catalog,()=>false);
 el.innerHTML=p==="/"?renderDashboard(universe,state.experience,state.apiState,state.leaderboard,publicCatalog()):p==="/transfer"?renderPlanRoute(universe,state.experience,state.apiState,walletGasView(),{
   items:transferActivity.items,scanning:transferActivity.scanning,
   busy:transferActivity.working,selectedTxHash:transferActivity.selectedTxHash,
   notice:transferActivity.notice,error:transferActivity.error
  }):p==="/faq"?renderFAQ():p==="/markets"?markets():p==="/my-transfers"?
  renderMyTransfers({account:state.account,catalog:state.catalog,
   items:transferActivity.items,scanning:transferActivity.scanning,
   scanReport:transferActivity.report,notice:transferActivity.notice,error:transferActivity.error}):((id||p==="/xgr")&&isDeployedAsset(asset()))?token():(id||p==="/xgr")?'<div class="ux-app ux-start-error"><h1>Token deployment pending</h1><p>The asset is configured but its complete verified XITA route deployments are not yet documented.</p></div>':p==="/join"?join():'<h1>Page not found</h1>'+btn("/markets","Browse tokens");
 for(const [name,id] of [["origin","ux-origin"],["destination","ux-destination"],["asset","ux-asset"]]){
   document.getElementById(id)?.addEventListener("change",e=>{
   state.experience[name]=e.target.value;
   if(name==="asset"&&p==="/transfer")
    history.replaceState(null,"","/transfer?token="+encodeURIComponent(e.target.value));
   render();
  });
 }
 if(p==="/"){
  const host=document.querySelector("#xita-3d");
  if(host)cosmos=mountUniverse3D({root:host,model:universe,compact:false,selected:state.experience.system,onFocus:key=>{
   state.experience.system=key;
   const details=document.querySelector("#ux-selected-details");
   if(details)details.innerHTML=renderUniverse(universe,key,state.leaderboard).match(/<aside class="ux-panel ux-details"[^>]*>([\s\S]*?)<\/aside>/)?.[1]||"";
   void loadSystemRanking(key);
  },onToken:token=>{history.pushState(null,"","/token/"+encodeURIComponent(token.slug));render();scrollTo(0,0);}});
  if(state.experience.system!=="xgrchain")void loadSystemRanking(state.experience.system);
 }
 document.querySelectorAll("[data-xita-system]").forEach(button=>button.addEventListener("click",()=>{
   state.experience.system=button.dataset.xitaSystem;
   if(cosmos)cosmos.focus(state.experience.system);
 }));
 document.querySelector("#ux-token-origin")?.addEventListener("change",e=>{state.experience.origin=e.target.value;render();});
 document.querySelector("#ux-token-destination")?.addEventListener("change",e=>{state.experience.destination=e.target.value;render();});
 document.querySelector("#ux-token-amount")?.addEventListener("input",e=>{state.experience.amount=e.target.value;});
 document.querySelector("#ux-transfer-amount")?.addEventListener("input",e=>{state.experience.amount=e.target.value;});
 document.querySelector("#xita-open-transfer")?.addEventListener("change",e=>{
  transferActivity.selectedTxHash=e.target.value;render();
 });
 document.querySelector("#xita-transfer-primary")?.addEventListener("click",()=>void performTransferAction());
 document.querySelectorAll("[data-xita-gas-refresh]").forEach(button=>button.addEventListener("click",()=>{if(state.account)void updateWalletGas();}));
 document.querySelector("#xita-scan-transfers")?.addEventListener("click",()=>void scanWalletHistory());
 document.querySelector("#xita-lookup-form")?.addEventListener("submit",event=>{
  event.preventDefault();
  if(!state.account)return;
  const form=event.currentTarget;
  const sourceChain=form.elements.namedItem("sourceChain")?.value;
  const txHash=form.elements.namedItem("txHash")?.value?.trim();
  if(!sourceChain||!/^0x[0-9a-f]{64}$/i.test(txHash||"")){
   transferActivity.error="Enter a source chain and a complete 0x-prefixed transaction hash.";
   render();return;
  }
  void lookupWalletTransfer(sourceChain,txHash);
 });
 if((p==="/my-transfers"||p==="/transfer")&&state.account&&
   !transferActivity.scanned&&!transferActivity.scanning)
  void scanWalletHistory();
 document.querySelectorAll("[data-leader-sort]").forEach(button=>button.addEventListener("click",()=>{
   const key=button.dataset.leaderSort;
   if(!["lockedUsd","movedUsd","marketCapUsd"].includes(key))return;
   state.leaderboardDir=state.leaderboardSort===key&&state.leaderboardDir==="desc"?"asc":"desc";
   state.leaderboardSort=key;render();
 }));
 document.querySelector("#ux-leader-search")?.addEventListener("input",event=>{
   state.leaderboardSearch=event.target.value;
   const position=event.target.selectionStart;
   render();
   const field=document.querySelector("#ux-leader-search");
   if(field){field.focus();if(typeof position==="number")field.setSelectionRange(position,position);}
 });
 // The Join wizard has persistent delegated event handlers below.
 document.querySelector("#search")?.addEventListener("input",e=>{
  const value=e.target.value.trim().toLowerCase();
  document.querySelectorAll("#market-row tr").forEach(row=>row.hidden=!row.dataset.filter?.includes(value));
 });
}
connect.addEventListener("click",async()=>{
 if(!globalThis.ethereum){alert("An injected EIP-1193 EVM wallet is required.");return;}
 try{setConnectedAccount(await connectWallet(globalThis.ethereum));await updateWalletGas();}catch(e){alert(e.message);}
});
if(globalThis.ethereum?.on){
 globalThis.ethereum.on("accountsChanged",accounts=>{
  setConnectedAccount(Array.isArray(accounts)?accounts[0]:null);
  state.walletBalances=null;state.walletTokenBalances=null;state.walletGasCheckedAt=null;state.walletGas=null;
  void updateWalletGas();
 });
 globalThis.ethereum.on("chainChanged",()=>{state.walletBalances=null;state.walletTokenBalances=null;state.walletGasCheckedAt=null;void updateWalletGas();});
}
// Persistent listeners: repainting the wizard never discards its controls.
el.addEventListener("click",event=>{
 const button=event.target.closest("[data-join-action]");
 if(!button||!el.contains(button)||path()!=="/join")return;
 event.preventDefault();
 void runJoin(button.dataset.joinAction);
});
el.addEventListener("input",event=>{
 const field=event.target.closest("[data-join]");
 if(!field||path()!=="/join"||!joinState.data)return;
 captureJoin();
 field.removeAttribute("aria-invalid");
 field.closest(".ja-field")?.classList.remove("is-invalid");
 field.closest(".ja-field")?.querySelectorAll(".ja-field-error").forEach(n=>n.remove());
 const d=joinState.data;
 for(const [k,value] of Object.entries({name:d.name||"Your Token",symbol:d.symbol||"—"})){
  const target=el.querySelector('[data-join-preview="'+k+'"]');
  if(target)target.textContent=value;
 }
});
el.addEventListener("change",event=>{
 if(path()!=="/join"||!joinState.data)return;
 const field=event.target;
 if(field.matches("#ja-logo")){
  const file=field.files?.[0];if(!file)return;
  if(file.type!=="image/png"||file.size>300000){
   joinState.status="Please upload a PNG of at most 300 KB.";drawJoin();return;
  }
  const reader=new FileReader();
  reader.onload=()=>{
   joinState.data.logoPngBase64=String(reader.result).split(",")[1];
   joinState.status="PNG loaded and included in the local application draft.";drawJoin();
  };
  reader.onerror=()=>{joinState.status="Could not read the PNG.";drawJoin();};
  reader.readAsDataURL(file);return;
 }
 if(field.matches("[data-join-target]")){captureJoin();drawJoin();return;}
 if(field.matches('[data-join="canonicalChain"],[data-join="priceSource"]')){
  captureJoin();drawJoin();
 }
});
document.addEventListener("click",e=>{
 const a=e.target.closest("a[data-nav]");
 if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
 e.preventDefault();history.pushState(null,"",a.pathname+a.search+a.hash);render();scrollTo(0,0);
});
window.addEventListener("popstate",render);
refreshTransferLink();
// Dashboard loads the 10 KB same-origin catalog, never RPC/indexer data.
async function start(){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),2500);
 try{
  const response=await fetch("/catalog.json",{cache:"no-store",signal:controller.signal});
  if(!response.ok)throw Error("Local catalog.json returned HTTP "+response.status);
  const catalog=await response.json();
  if(!catalog?.assets?.XGR?.routes||!catalog?.infrastructure?.xgrchain||!catalog?.chains?.xgrchain)throw Error("Invalid local catalog");
  state.catalog=catalog;
  render();
  if(state.account)void updateWalletGas();
  el.dataset.ready="1";
  void loadPublicData();
  void loadLeaderboard();
 }catch(error){
  el.dataset.failed="1";
  const message=error?.name==="AbortError"?"Local catalog request timed out after 2.5 seconds":error?.message||"Unknown catalog error";
  el.innerHTML='<section class="ux-app ux-start-error"><div class="ux-kicker">XITA · Configuration error</div><h1>Dashboard unavailable</h1><p>Could not read the local token configuration.</p><p class="ux-small">'+x(message)+'</p><button type="button" class="ux-outline-button" id="retry-xita">Retry</button></section>';
  document.getElementById("retry-xita")?.addEventListener("click",()=>{delete el.dataset.failed;void start();});
 }finally{clearTimeout(timeout);}
}
void start();
async function loadPublicData(){
 const assetIds=allAssets();
 const requests=[
  loadXetaOverview(),
  ...assetIds.flatMap(id=>[loadXetaAsset(id),loadXetaTransfers(id)]),
  ...assetIds.map(id=>loadMarketPrice(id))
 ];
 const settled=await Promise.allSettled(requests);
 state.apiState=settled[0].status==="fulfilled"?"ready":"error";
 for(let i=0;i<assetIds.length;i++){
  const id=assetIds[i];
  const assetReply=settled[1+2*i],transfersReply=settled[2+2*i];
  if(assetReply.status==="fulfilled")state.assetStats[id]=assetReply.value;
  if(transfersReply.status==="fulfilled")state.transfers[id]=transfersReply.value;
  const priceReply=settled[1+2*assetIds.length+i];
  if(priceReply?.status==="fulfilled")state.prices[id]=priceReply.value;
 }
 if(state.catalog)render();
}

let systemRequest=0;
async function loadSystemRanking(chain){
 const id=++systemRequest;
 const panel=document.querySelector("#ux-ranked-tokens");
 if(!panel)return;
 if(chain==="xgrchain"&&document.querySelector("#xita-3d")?.dataset.mode==="overview"){
  panel.textContent="Select a stellar system to explore its ranked tokens.";return;
 }
 panel.textContent="Reading sourced token rankings…";
 try{
  const url="/api/xeta/v1/systems/"+encodeURIComponent(chain)+"?sort="+encodeURIComponent(state.universeSort)+"&q="+encodeURIComponent(state.universeQuery);
  const res=await fetch(url,{cache:"no-store"});
  if(!res.ok)throw Error("Indexer unavailable");
  const data=await res.json();
  if(id!==systemRequest||state.experience.system!==chain)return;
  if(data.kind!=="xita-system-ranking-v1"||data.chain!==chain||!Array.isArray(data.items))throw Error("Invalid metrics");
  cosmos?.showRankedTokens(data.items);
  if(!data.items.length){panel.textContent="No sourced ranking available. Configured token planets remain visible; deployment and activation are not verified.";return;}
  const list=document.createElement("div");
  for(const item of data.items.slice(0,6)){
   const a=document.createElement("a");a.href="/token/"+encodeURIComponent(item.slug);
   a.dataset.nav="";a.className="ux-ranked-token";
   a.textContent=item.symbol+" · "+item.representation+" · "+item.value.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
   list.appendChild(a);
  }
  panel.replaceChildren(list);
 }catch{
  if(id!==systemRequest)return;
  cosmos?.showRankedTokens([]);
  panel.textContent="Ranking unavailable. Configured token planets remain visible without estimated market values.";
 }
}
el.addEventListener("change",e=>{
 if(e.target.id==="ux-orbit-sort"){state.universeSort=e.target.value;void loadSystemRanking(state.experience.system);}
});
el.addEventListener("input",e=>{
 if(e.target.id==="ux-orbit-search"){state.universeQuery=e.target.value;cosmos?.searchTokens(state.universeQuery);void loadSystemRanking(state.experience.system);}
});
async function loadLeaderboard(){try{const res=await fetch("/api/xeta/v1/metrics/toplist",{cache:"no-store"});if(!res.ok)return;const body=await res.json();if(body?.kind!=="xita-asset-metrics-v1"||body.schemaVersion!==1)return;state.leaderboard=body;state.visibility=body.visibility?.kind==="xita-visibility-v1"?body.visibility:null;if(path()==="/markets"||path()==="/"||path()==="/transfer"||path()==="/plan-route"||path().startsWith("/token/"))render();
 if(path()==="/universe"){
  const details=document.querySelector("#ux-selected-details");
  if(details){const model=buildExperienceModel(publicCatalog(),()=>false);
   details.innerHTML=renderUniverse(model,state.experience.system,body).match(/<aside class="ux-panel ux-details"[^>]*>([\s\S]*?)<\/aside>/)?.[1]||"";
  }
 }}catch{ /* Unavailable is not zero */ }}
