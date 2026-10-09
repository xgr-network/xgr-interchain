import {loadXetaOverview,loadXetaAsset,loadXetaTransfers,loadMarketPrice,aggregate,displayPrice,displayUnix} from "./ui-data.mjs";
import {manifestRoute,connectWallet,switchChain,quoteBridge,readAllowance,approveAmount,sendBridge,waitReceipt,messageIdFromReceipt,isDelivered,formatUnits,shorten} from "./protocol.mjs";
const el=document.querySelector("#app"),connect=document.querySelector("#connect");
const state={catalog:null,assetId:"XGR",account:null,quote:null,quoteKey:null,transfer:null,busy:false,indexed:null,assetStats:{},transfers:{},prices:{},apiState:"loading"};
const names={xgrchain:"XGRChain",base:"Base",polygon:"Polygon",arbitrum:"Arbitrum"};
const routeName=r=>(names[r.sourceChain]||r.sourceChain)+" → "+(names[r.destinationChain]||r.destinationChain);
const x=raw=>String(raw??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const asset=()=>state.catalog.assets[state.assetId]||state.catalog.assets.XGR;
const profile=id=>state.catalog.assets[id]?.profile||{name:id,slug:id.toLowerCase(),shortDescription:"",description:"",categories:[],tags:[],links:{},branding:{}};
const tokenUrl=id=>"/token/"+encodeURIComponent(profile(id).slug);
const allAssets=()=>Object.keys(state.catalog.assets);
const route=r=>manifestRoute(state.catalog,asset(),r);
const routes=()=>asset().routes.routes;
const active=()=>routes().filter(r=>route(r.name).allowed).length;
const activeFor=id=>(state.catalog.assets[id]?.routes?.routes||[]).filter(rt=>manifestRoute(state.catalog,state.catalog.assets[id],rt.name).allowed).length;
const path=()=>decodeURIComponent(location.pathname).replace(/\/+$/,"")||"/";
const btn=(url,label,alt=false)=>'<a data-nav href="'+url+'" class="btn'+(alt?" alt":"")+'">'+label+'</a>';
const tag=r=>'<span class="tag">'+(route(r.name).allowed?"Verified":"Pending governance")+'</span>';
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
 if(state.apiState==="ready")return '<p class="status">Source: existing XGR Explorer XETA event index. Source-chain coverage is limited to verified configured Gateways; USD TVL and global volume are not inferred.</p>';
 if(state.apiState==="error")return '<p class="status">Explorer XETA index currently unavailable. No activity values are inferred.</p>';
 return '<p class="status">Loading verified bridge events from the Explorer…</p>';
}
function overview(){
 const ids=allAssets();
 return '<div class="eyebrow">XGR EVM Token Alliance</div><h1>One ecosystem.<br>Every connected token.</h1>'+
 '<p class="lead">Explore token projects, validator-governed interchain routes, and verified bridge activity. Every asset has its own profile and transfer interface.</p>'+
 '<div class="actions">'+btn(tokenUrl("XGR"),"Explore XGR token")+btn("/markets","Browse markets",true)+'</div>'+
 '<div class="cards">'+metric("Published assets",String(ids.length),"Token profiles")+
  metric("Verified routes",String(ids.reduce((sum,id)=>sum+activeFor(id),0)),"Quorum-governed")+
  metric("24h source transfers",indexedCount("XGR","last24h"),"Observed XGR Gateway messages")+
  metric("24h XGR transferred",amountFor("XGR","last24h"),"Unknown principal amounts excluded")+'</div>'+
 indexerNotice()+
 '<section class="section"><div class="eyebrow">Interchain network</div><h2>XGRChain hub</h2><p class="muted">External-to-external movement consists of two independent transfers through XGRChain. The future automated second-hop sponsor is not deployed.</p>'+
 '<div class="card"><h3>XGR configured routes</h3>'+state.catalog.assets.XGR.routes.routes.map(rt=>
  '<div class="pair"><span>'+x(routeName(rt))+'</span><span class="tag">'+(manifestRoute(state.catalog,state.catalog.assets.XGR,rt.name).allowed?"Verified":"Pending governance")+'</span></div>').join("")+'</div></section>'+
 '<section class="section"><div class="eyebrow">Explore projects</div><h2>Token directory</h2><div class="project-grid">'+ids.map(tokenCard).join("")+'</div></section>'+
 '<section class="section"><h2>Join the Alliance</h2><p class="lead">Free onboarding and integration proposals, with independent validator approval before any route can become active.</p>'+btn("/join","Join the Alliance")+'</section>';
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
 const chips=(p.categories||[]).map(cat=>'<span class="category-chip">'+x(cat)+'</span>').join(" ");
 return '<div class="columns"><article><a href="/markets" data-nav class="muted">← All tokens</a>'+
 '<div class="token-link section">'+projectLogo(id)+'<div><div class="eyebrow">'+x(names[canonical]||canonical)+' · Canonical asset</div>'+
 '<h1>'+x(p.name)+' <small>'+x(id)+'</small></h1><span class="tag">'+x(p.verification?.status||"project-maintained")+'</span></div></div>'+
 '<div class="card"><h2>Project overview</h2><p class="lead" style="font-size:16px">'+x(p.shortDescription)+'</p>'+
 '<p class="muted">'+x(p.description)+'</p>'+chips+
 '<div class="pair"><span>Canonical network</span><b>'+x(names[canonical]||canonical)+'</b></div>'+
 '<div class="pair"><span>Token decimals</span><b>'+a.metadata.decimals+'</b></div>'+
 '<div class="pair"><span>Verified routes</span><b>'+active()+' / '+routes().length+'</b></div>'+
 '<div class="pair"><span>Market price</span><b>'+x(displayPrice(state.prices[id]))+'</b></div>'+
 '<div class="pair"><span>Market capitalization</span><b>Not available from verified feed</b></div>'+
 '<h3>Project links</h3><div class="project-links">'+projectLinks(id)+'</div></div>'+
 '<section class="section"><h2>Network representations</h2><div class="routes">'+a.metadata.representations.map(rep=>
  '<div class="route"><strong>'+x(names[rep.chain]||rep.chain)+'</strong> · '+x(rep.symbol)+
  '<p class="muted">'+x(rep.representation)+' · '+(rep.assetAddress?x(rep.assetAddress):"Deployment pending verification")+'</p></div>').join("")+'</div></section>'+
 '<section class="section"><h2>Interchain routes</h2><div class="routes">'+routes().map(rt=>
  '<div class="route"><strong>'+x(routeName(rt))+'</strong><div style="margin-top:10px">'+tag(rt)+'</div></div>').join("")+'</div></section>'+
 '<section class="section"><h2>Verified transfer activity</h2><div id="token-activity">'+tokenActivity(id)+'</div></section>'+
 '<section class="section"><h2>Validator governance and recovery</h2><p class="muted">Transfers require a quorum-approved source route and successful destination Mailbox delivery. A source transaction is not proof of destination settlement. Recovery uses the original message ID and never a second bridge transfer.</p></section>'+
 '</article><aside class="card"><div class="eyebrow">Transfer '+x(id)+'</div><h2>Bridge this token</h2>'+
 '<p class="muted">Select the source and destination. Live fee quotes and ERC-20 approvals use the authorized Gateway, never direct Warp-router transfers.</p>'+
 '<label class="field" for="route">Route</label><select id="route">'+routes().map(rt=>
  '<option value="'+x(rt.name)+'">'+x(routeName(rt))+' · '+(route(rt.name).allowed?"verified":"planned")+'</option>').join("")+'</select>'+
 '<label class="field" for="amount">Amount ('+x(id)+')</label><input id="amount" inputmode="decimal" placeholder="0.0" autocomplete="off">'+
 '<div id="route-note">'+note("Route not activated. No unverified contracts can receive funds.")+'</div>'+
 '<div class="note section" id="quote">No live quote available.</div>'+
 '<button class="wide alt" id="quote-btn" disabled>Request Gateway quote</button><button class="wide" id="bridge-btn" disabled>Bridge token</button>'+
 '<p class="status" id="status">Connect an EVM wallet to begin.</p>'+
 '<div id="transfer" class="hidden"><h3>Transfer status</h3><p class="status" id="message-id"></p>'+
 '<button class="wide alt" id="check-delivery">Check destination delivery</button><p class="status" id="delivery"></p></div>'+
 '</aside></div>';
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
function routesPage(){return '<div class="eyebrow">Research & development</div><h1>Route Finder</h1><p class="lead">Future graph search across DEX swaps and XETA bridge hops. Route quotes, non-atomic recovery, gas sponsorship and liquidity indexing are not live.</p>'+btn("/token/xgr","Explore initial token");}
function reset(){state.quote=null;state.quoteKey=null;const q=document.querySelector("#quote");if(q)q.textContent="Request a live Gateway quote before you bridge.";controls();}
function current(){return document.querySelector("#route")?.value;}
function key(){return current()+"|"+document.querySelector("#amount")?.value+"|"+state.account;}
function controls(){
 const q=document.querySelector("#quote-btn"),b=document.querySelector("#bridge-btn");
 if(!q)return;
 const a=route(current()).allowed;
 q.disabled=state.busy||!state.account||!a;
 b.disabled=state.busy||!a||!state.account||!state.quote||state.quoteKey!==key();
 const n=document.querySelector("#route-note");
 if(n)n.innerHTML=a?'<div class="note">Active inventory: on-chain route validation still required before quoting.</div>':note("Route not validator-activated and independently verified. Transfers are disabled.");
}
function status(s){const e=document.querySelector("#status");if(e)e.textContent=s;}
async function action(fn){
 if(state.busy)return;
 state.busy=true;controls();
 try{await fn();}catch(e){status(e.message||"Wallet action failed");alert(e.message||"Wallet action failed");}
 finally{state.busy=false;controls();}
}
async function requestQuote(){
 await action(async()=>{
  if(!state.account)throw Error("Connect a wallet first");
  const r={...route(current()),assetCanonicalChain:asset().metadata.canonical.chain};
  if(!r.allowed)throw Error("Route is not activated");
  await switchChain(globalThis.ethereum,r.src);
  status("Reading canonical registry and live Gateway fees…");
  const q=await quoteBridge(globalThis.ethereum,r,state.account,document.querySelector("#amount").value,asset().metadata.decimals);
  state.quote=q;state.quoteKey=key();
  document.querySelector("#quote").innerHTML=
    '<div class="pair"><span>Validator fee</span><b>'+fmt(q.validatorFeeWei)+' '+r.src.nativeCurrency.symbol+'</b></div>'+
    '<div class="pair"><span>Router/native amount</span><b>'+fmt(q.routerNativeValueWei)+' '+r.src.nativeCurrency.symbol+'</b></div>'+
    '<div class="pair"><span>Total native value</span><b>'+fmt(q.totalNativeValueWei)+' '+r.src.nativeCurrency.symbol+'</b></div>'+
    '<div class="pair"><span>ERC-20 principal</span><b>'+fmt(q.tokenAmount,asset().metadata.decimals)+'</b></div>';
  status("Live quote received. Fees can change before the transaction is signed.");
 });
}
async function bridge(){
 await action(async()=>{
  if(!state.quote||state.quoteKey!==key())throw Error("Request a fresh quote");
  const r={...route(current()),assetCanonicalChain:asset().metadata.canonical.chain},old=state.quote;
  await switchChain(globalThis.ethereum,r.src);
  const fresh=await quoteBridge(globalThis.ethereum,r,state.account,document.querySelector("#amount").value,asset().metadata.decimals);
  if(fresh.totalNativeValueWei!==old.totalNativeValueWei)throw Error("Gateway quote has changed. Please request a fresh quote.");
  if(fresh.tokenAmount>0n){
   const allowance=await readAllowance(globalThis.ethereum,fresh.token,state.account,r.deployed.gateway);
   if(allowance<fresh.tokenAmount){
    if(!confirm("Approve the exact token amount to the canonical XETA Gateway?"))return;
    const approval=await approveAmount(globalThis.ethereum,fresh.token,r.deployed.gateway,fresh.tokenAmount,state.account);
    status("Waiting for ERC-20 allowance approval receipt…");
    await waitReceipt(globalThis.ethereum,approval);
    const newAllowance=await readAllowance(globalThis.ethereum,fresh.token,state.account,r.deployed.gateway);
    if(newAllowance<fresh.tokenAmount)throw Error("Token allowance remains insufficient");
   }
  }
  const recheck=await quoteBridge(globalThis.ethereum,r,state.account,document.querySelector("#amount").value,asset().metadata.decimals);
  if(recheck.totalNativeValueWei!==fresh.totalNativeValueWei)throw Error("Fees changed before bridging. Request a new quote.");
  if(!confirm("Submit XETA Gateway transfer? Tokens will be locked or burned; destination settlement is separate."))return;
  const tx=await sendBridge(globalThis.ethereum,r,state.account,recheck);
  state.quote=null;state.quoteKey=null;status("Source transaction submitted: "+tx);
  const receipt=await waitReceipt(globalThis.ethereum,tx);
  const messageId=messageIdFromReceipt(receipt,r);
  state.transfer={r,messageId,tx};
  document.querySelector("#transfer").classList.remove("hidden");
  document.querySelector("#message-id").textContent="Source confirmed · Transaction "+tx+" · Message "+messageId;
  document.querySelector("#delivery").textContent="Destination delivery not yet verified. Never bridge a second time to retry delivery.";
  status("Source transaction confirmed. Destination settlement pending.");
 });
}
async function delivery(){
 await action(async()=>{
  if(!state.transfer)throw Error("No original message to check");
  const {r,messageId}=state.transfer;
  await switchChain(globalThis.ethereum,r.dst);
  const delivered=await isDelivered(globalThis.ethereum,r,messageId);
  document.querySelector("#delivery").textContent=delivered?"Verified as delivered in destination Mailbox. Transfer complete.":"Not yet delivered. Use original message ID for relayer-independent recovery; do not rebridge.";
 });
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
 el.innerHTML=p==="/"?overview():p==="/markets"?markets():(p==="/token/xgr"||p==="/xgr")?token():p==="/join"?join():p==="/routes"?routesPage():'<h1>Not found</h1>'+btn("/markets","Browse tokens");
 document.querySelector("#route")?.addEventListener("change",reset);
 document.querySelector("#amount")?.addEventListener("input",reset);
 document.querySelector("#quote-btn")?.addEventListener("click",requestQuote);
 document.querySelector("#bridge-btn")?.addEventListener("click",bridge);
 document.querySelector("#check-delivery")?.addEventListener("click",delivery);
 document.querySelector("#application")?.addEventListener("submit",application);
 document.querySelector("#search")?.addEventListener("input",e=>document.querySelector("#market-row").style.display=/xgr|wrapped|^$/i.test(e.target.value)?"":"none");
 controls();
}
connect.addEventListener("click",async()=>{
 if(!globalThis.ethereum){alert("An injected EIP-1193 EVM wallet is required.");return;}
 try{state.account=await connectWallet(globalThis.ethereum);connect.textContent=shorten(state.account);reset();}catch(e){alert(e.message);}
});
if(globalThis.ethereum?.on){
 globalThis.ethereum.on("accountsChanged",()=>{state.account=null;connect.textContent="Connect Wallet";reset();});
 globalThis.ethereum.on("chainChanged",reset);
}
document.addEventListener("click",e=>{
 const a=e.target.closest("a[data-nav]");
 if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
 e.preventDefault();history.pushState(null,"",a.pathname);render();scrollTo(0,0);
});
window.addEventListener("popstate",render);
try{
 const res=await fetch("/catalog.json",{cache:"no-store"});
 if(!res.ok)throw Error("Manifest unavailable");
 state.catalog=await res.json();
 if(!state.catalog.assets?.XGR?.routes||!state.catalog.infrastructure?.xgrchain)throw Error("Invalid manifest");
 render();
}catch(e){el.innerHTML="<h1>XETA inventory unavailable</h1><p>"+x(e.message)+"</p><p>Bridging is disabled until a verified manifest is available.</p>";}
