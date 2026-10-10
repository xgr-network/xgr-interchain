import {buildExperienceModel,renderDashboard,renderUniverse,renderRoutes,renderTokenBridge} from "./experience.js";
import {loadXetaOverview,loadXetaAsset,loadXetaTransfers,loadMarketPrice,aggregate,displayPrice,displayUnix} from "./ui-data.js";
import {connectWallet,shorten,formatUnits} from "./wallet-core.js";
const el=document.querySelector("#app"),connect=document.querySelector("#connect");
const state={catalog:null,assetId:"XGR",account:null,quote:null,quoteKey:null,transfer:null,walletChainId:null,walletGas:null,busy:false,indexed:null,assetStats:{},transfers:{},prices:{},apiState:"not-deployed",experience:{system:"xgrchain",origin:"xgrchain",destination:"base",asset:"XGR"}};
const names={xgrchain:"XGRChain",base:"Base",polygon:"Polygon",arbitrum:"Arbitrum"};
const routeName=r=>(names[r.sourceChain]||r.sourceChain)+" → "+(names[r.destinationChain]||r.destinationChain);
const x=raw=>String(raw??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const asset=()=>state.catalog.assets[state.assetId]||state.catalog.assets.XGR;
const profile=id=>state.catalog.assets[id]?.profile||{name:id,slug:id.toLowerCase(),shortDescription:"",description:"",categories:[],tags:[],links:{},branding:{}};
const tokenUrl=id=>"/token/"+encodeURIComponent(profile(id).slug);
const allAssets=()=>Object.keys(state.catalog.assets);
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
 const ids=allAssets();
 return '<div class="eyebrow">Discovery</div><h1>Token markets</h1>'+
 '<p class="lead">Project listings and real indexed bridge activity. Trading volume and market capitalization remain separate from transfer events.</p>'+
 '<label class="field" for="search">Find a project</label><input id="search" placeholder="Symbol, name, category or tag">'+
 '<div class="card section" style="overflow:auto"><table class="table"><thead><tr>'+
 '<th>Token</th><th>Market price</th><th>Market cap</th><th>24h DEX volume</th><th>24h bridge transfers</th><th>Bridge volume</th><th>Verified routes</th>'+
 '</tr></thead><tbody id="market-row">'+ids.map(id=>marketRow(id)).join("")+'</tbody></table></div>'+
 indexerNotice();
}
function marketRow(id){
 const p=profile(id);
 const symbol=x(id),data=state.catalog.assets[id];
 return '<tr data-filter="'+x((p.name+" "+id+" "+(p.categories||[]).join(" ")+" "+(p.tags||[]).join(" ")).toLowerCase())+'">'+
 '<td><a href="'+tokenUrl(id)+'" data-nav>'+symbol+' · '+x(p.name)+'</a></td>'+
 '<td>'+x(displayPrice(state.prices[id]))+'</td><td>—</td><td>—</td>'+
 '<td>'+x(indexedCount(id,"last24h"))+'</td><td>'+x(amountFor(id,"last24h"))+'</td>'+
 '<td>'+activeFor(id)+" / "+data.routes.routes.length+'</td></tr>';
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
function token(){
 const id=state.assetId,a=asset(),p=profile(id),canonical=a.metadata.canonical?.chain||"unknown";
 const model=buildExperienceModel(state.catalog,()=>false);
 const chips=(p.categories||[]).map(cat=>'<span class="category-chip">'+x(cat)+'</span>').join(" ");
 return '<div class="columns"><article><a href="/markets" data-nav class="muted">← All tokens</a>'+
 '<div class="token-link section">'+projectLogo(id)+'<div><div class="eyebrow">'+x(names[canonical]||canonical)+' · Canonical asset</div>'+
 '<h1>'+x(p.name)+' <small>'+x(id)+'</small></h1><span class="tag">'+x(p.verification?.status||"project-maintained")+'</span></div></div>'+
 '<div class="card"><h2>Project overview</h2><p class="lead" style="font-size:16px">'+x(p.shortDescription)+'</p><p class="muted">'+x(p.description)+'</p>'+chips+
 '<div class="pair"><span>Canonical network</span><b>'+x(names[canonical]||canonical)+'</b></div>'+
 '<div class="pair"><span>Token decimals</span><b>'+a.metadata.decimals+'</b></div>'+
 '<div class="pair"><span>Activated XITA v3.1.5 routes</span><b>0 / '+routes().length+'</b></div>'+
 '<div class="pair"><span>Market price</span><b>'+x(displayPrice(state.prices[id]))+'</b></div>'+
 '<h3>Project links</h3><div class="project-links">'+projectLinks(id)+'</div></div>'+
 '<section class="section"><h2>Network representations</h2><div class="routes">'+(a.metadata.representations||[]).map(rep=>
 '<div class="route"><strong>'+x(names[rep.chain]||rep.chain)+'</strong> · '+x(rep.symbol)+
 '<p class="muted">'+x(rep.representation)+' · '+(rep.assetAddress?x(rep.assetAddress):"Deployment pending verification")+'</p></div>').join("")+'</div></section>'+
 '<section class="section"><h2>Configured interchain routes</h2><div class="routes">'+routes().map(rt=>
 '<div class="route"><strong>'+x(routeName(rt))+'</strong><div class="ux-small">Prepared inventory only; not activated</div></div>').join("")+'</div></section>'+
 '</article><aside class="card ux-token-aside">'+renderTokenBridge(model,id,state.experience,{account:state.account,chainId:state.walletChainId,nativeBalance:state.walletGas})+'</aside></div>';
}
function join(){
 return '<div class="eyebrow">Join the XGR EVM Token Alliance</div><h1>Bring your token to more networks.</h1>'+
 '<p class="lead">Applications, review, standard integration and project listing are free. Export an application draft for review; this UI does not claim to submit it or activate governance.</p>'+
 '<div class="columns"><form id="application" class="card"><h2>Project application</h2>'+
 '<label class="field">Project name</label><input id="project" required maxlength="80"><label class="field">Token symbol</label><input id="symbol" required maxlength="20">'+
 '<label class="field">Project website</label><input id="website" required type="url" placeholder="https://">'+
 '<label class="field">Canonical chain</label><select id="canonical">'+Object.keys(state.catalog.chains).map(c=>'<option value="'+c+'">'+names[c]+'</option>').join("")+'</select>'+
 '<label class="field">Canonical token address</label><input id="address" required pattern="0x[0-9A-Fa-f]{40}" placeholder="0x…">'+
 '<label class="field">Token decimals</label><input id="decimals" type="number" min="0" max="36" value="18" required>'+
 '<label class="field">Target networks (Ctrl/Cmd for multiple)</label><select id="targets" multiple size="4">'+Object.keys(state.catalog.chains).map(c=>'<option value="'+c+'">'+names[c]+'</option>').join("")+'</select>'+
 '<label class="field">Project contact email</label><input id="email" type="email" required>'+
 '<p class="muted">Proof of wallet or multisig authorization will be required during review. Never submit private keys.</p><label><input style="width:auto;display:inline" id="ack" type="checkbox" required> I confirm I represent this project</label>'+
 '<button class="wide" type="submit">Export application JSON</button><p class="status" id="form-status"></p></form>'+
 '<div class="card"><h2>From token to alliance</h2><p class="muted">01 · Submit your token specification</p><p class="muted">02 · Token contract and project authorization verification</p><p class="muted">03 · Validator quorum route governance</p><p class="muted">04 · Verified deployment and live token page</p>'+
 '<div class="notice">This form saves a local draft only. It does not send information to a backend, request a wallet signature, or grant token onboarding approval.</div></div></div>';
}
async function updateWalletGas(){
 if(!state.account||!globalThis.ethereum?.request)return;
 try{
  const chainHex=await globalThis.ethereum.request({method:"eth_chainId"});
  const balanceHex=await globalThis.ethereum.request({method:"eth_getBalance",params:[state.account,"latest"]});
  state.walletChainId=Number(BigInt(chainHex));
  const native=BigInt(balanceHex);
  state.walletGas=formatUnits(native,18,6);
 }catch{
  state.walletGas=null;
  state.walletChainId=null;
 }
 if(path().startsWith("/token/"))render();
}
function application(e){
 e.preventDefault();
 if(!e.target.reportValidity())return;
 const targets=[...document.querySelector("#targets").selectedOptions].map(o=>o.value);
 if(!targets.length){document.querySelector("#form-status").textContent="Select at least one target network.";return;}
 const data={schemaVersion:1,kind:"xeta-alliance-application-draft",status:"unsubmitted",
 project:document.querySelector("#project").value,symbol:document.querySelector("#symbol").value,
 website:document.querySelector("#website").value,canonicalChain:document.querySelector("#canonical").value,
 canonicalAddress:document.querySelector("#address").value,decimals:Number(document.querySelector("#decimals").value),
 targetNetworks:targets,contact:document.querySelector("#email").value,
 authorizationProof:"pending",governance:"not-approved"};
 const blob=new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"}),url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download="xeta-token-application.json";a.click();
 URL.revokeObjectURL(url);
 document.querySelector("#form-status").textContent="Downloaded locally; nothing submitted to XETA.";
}
function render(){
 const p=path();
 const match=/^\/token\/([a-z0-9-]{1,80})$/.exec(p);
 const id=match?allAssets().find(a=>profile(a).slug===match[1]):null;
 state.assetId=id||"XGR";
 const universe=buildExperienceModel(state.catalog,()=>false);
 el.innerHTML=p==="/"?renderDashboard(universe,state.experience,state.apiState):p==="/universe"?renderUniverse(universe,state.experience.system):p==="/markets"?markets():(id||p==="/xgr")?token():p==="/join"?join():p==="/routes"?renderRoutes(universe):'<h1>Page not found</h1>'+btn("/markets","Browse tokens");
 for(const [name,id] of [["origin","ux-origin"],["destination","ux-destination"],["asset","ux-asset"]]){
   document.getElementById(id)?.addEventListener("change",e=>{state.experience[name]=e.target.value;render();});
 }
 document.querySelectorAll("[data-xita-system]").forEach(button=>button.addEventListener("click",()=>{
   state.experience.system=button.dataset.xitaSystem;
   if(p==="/")history.pushState(null,"","/universe");
   render();
 }));
 document.querySelector("#ux-token-origin")?.addEventListener("change",e=>{state.experience.origin=e.target.value;render();});
 document.querySelector("#ux-token-destination")?.addEventListener("change",e=>{state.experience.destination=e.target.value;render();});
 document.querySelector("#ux-token-amount")?.addEventListener("input",e=>{state.experience.amount=e.target.value;});
 document.querySelector("#application")?.addEventListener("submit",application);
 document.querySelector("#search")?.addEventListener("input",e=>{
  const value=e.target.value.trim().toLowerCase();
  document.querySelectorAll("#market-row tr").forEach(row=>row.hidden=!row.dataset.filter?.includes(value));
 });
}
connect.addEventListener("click",async()=>{
 if(!globalThis.ethereum){alert("An injected EIP-1193 EVM wallet is required.");return;}
 try{state.account=await connectWallet(globalThis.ethereum);connect.textContent=shorten(state.account);await updateWalletGas();}catch(e){alert(e.message);}
});
if(globalThis.ethereum?.on){
 globalThis.ethereum.on("accountsChanged",accounts=>{state.account=Array.isArray(accounts)?accounts[0]||null:null;connect.textContent=state.account?shorten(state.account):"Connect Wallet";state.walletGas=null;void updateWalletGas();if(!state.account)render();});
 globalThis.ethereum.on("chainChanged",()=>{state.walletGas=null;void updateWalletGas();});
}
document.addEventListener("click",e=>{
 const a=e.target.closest("a[data-nav]");
 if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
 e.preventDefault();history.pushState(null,"",a.pathname);render();scrollTo(0,0);
});
window.addEventListener("popstate",render);
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
  el.dataset.ready="1";
  void loadPublicData();
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
