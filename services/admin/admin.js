import {connectDeploymentWallet,currentWalletState,switchDeploymentChain,balanceOnWalletChain,formatNative,walletsAvailable} from "./wallet.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const el=id=>document.getElementById(id);
async function get(p){const r=await fetch(p,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"HTTP "+r.status);return d;}
const labels={"not-deployed":"Nicht deployed",partial:"Teilweise deployed",deployed:"Deployed"};
const pill=(s)=>'<span class="status '+esc(s)+'">'+esc(labels[s]||s)+'</span>';
let workqueue=null;
let assetPage=0;
const ASSETS_PER_PAGE=12;
function renderAssets(){
 if(!workqueue)return;
 const filter=el("asset-filter").value,q=el("asset-search").value.trim().toLowerCase();
 const assets=Object.values(workqueue.inventory.assets).filter(a=>(filter==="all"||a.status===filter)&&[a.name,a.symbol,a.key,a.canonicalChain,...a.routes.map(r=>r.destination)].join(" ").toLowerCase().includes(q));
 el("metrics").innerHTML=[
  ["Assets",Object.keys(workqueue.inventory.assets).length],
  ["Routen",workqueue.inventory.routes.length],
  ["Offen",Object.values(workqueue.inventory.assets).filter(a=>a.status!=="deployed").length]
 ].map(([n,v])=>'<div class="metric"><strong>'+v+'</strong><small>'+n+'</small></div>').join("");
 const pages=Math.max(1,Math.ceil(assets.length/ASSETS_PER_PAGE));
 assetPage=Math.max(0,Math.min(assetPage,pages-1));
 const pageAssets=assets.slice(assetPage*ASSETS_PER_PAGE,(assetPage+1)*ASSETS_PER_PAGE);
 el("main-workqueue").innerHTML=assets.length?pageAssets.map(a=>'<section class="asset-card"><div class="asset-head">'+
 '<div class="token-icon">'+esc(a.symbol.substring(0,1))+'</div><div class="asset-intro"><strong>'+esc(a.name)+'</strong><p>'+esc(a.symbol)+' · Original: '+esc(a.canonicalChain)+' · '+a.deployedRoutes+'/'+a.routeCount+' Routen dokumentiert</p></div>'+pill(a.status)+'</div>'+
 '<div class="asset-meta"><span>Asset-ID <b class="mono">'+esc(a.assetId)+'</b></span><span>Belege <b>'+a.receiptCount+'</b></span><span>Manifest <b>'+esc(a.deploymentManifest)+'</b></span></div>'+
 '<div class="routes">'+a.routes.map(r=>'<div class="route"><div><strong>'+esc(r.source)+' → '+esc(r.destination)+'</strong><small>'+esc(r.name)+' · '+esc(r.note)+'</small></div>'+pill(r.status)+'</div>').join("")+'</div></section>').join(""):'<p>Keine Assets für diesen Filter.</p>';
 const pageNode=el("asset-pagination");
 pageNode.innerHTML='<span>'+esc(assets.length)+' Assets · Seite '+(assetPage+1)+'/'+pages+'</span><button type="button" class="outline" data-page="prev" '+(assetPage===0?"disabled":"")+'>Zurück</button><button type="button" class="outline" data-page="next" '+(assetPage>=pages-1?"disabled":"")+'>Weiter</button>';
 pageNode.querySelectorAll("button[data-page]").forEach(b=>b.addEventListener("click",()=>{
   assetPage+=b.dataset.page==="next"?1:-1;
   renderAssets();
 }));

}
let currentWallet=null;
let chainObservations=new Map();
let liveBootstrap=new Map();
function renderInfrastructure(){
 if(!workqueue)return;
 el("infrastructure-list").innerHTML=(workqueue.infrastructure||[]).map(c=>{
  const live=chainObservations.get(c.name),state=live?.status||c.status;
  const bootstrap=liveBootstrap.get(c.name)||(workqueue.bootstrap||[]).find(x=>x.chain===c.name);
  const core=c.hyperlane.mailbox&&c.hyperlane.merkleTreeHook?"Core-Adressen dokumentiert":"Hyperlane Core fehlt";
  const status=state==="observed-complete"?"Alle XITA-Contracts beobachtet":state==="observed-partial"?"Teilweise on-chain beobachtet":state==="unreachable"?"RPC nicht erreichbar":c.documented+"/"+c.required+" XITA-Contracts dokumentiert";
  return '<div class="chain-card"><div class="chain-top"><strong>'+esc(c.name)+'</strong><span class="status '+(state==="observed-complete"?"deployed":c.documented?"partial":"")+'">'+esc(status)+'</span></div><small>Chain '+c.chainId+' · Domain '+c.domainId+' · '+esc(c.nativeCurrency.symbol)+'</small><p>'+esc(core)+'</p><div class="chain-components">'+c.components.map(part=>'<div>'+esc(part.key)+' <span>'+esc(part.address||"Ausstehend")+'</span></div>').join("")+'</div><div class="chain-bootstrap"><strong>Validatoren & Source-Fee</strong><p>'+esc(bootstrap?.verified?"Validatoren & Quorum-Gebühr bestätigt":bootstrap?.ready?"Konfiguration vollständig; On-Chain noch offen":"Nicht bootstrapfähig")+'</p><small>'+esc((bootstrap?.validatorSetId?"Set "+bootstrap.validatorSetId+" · Fee "+bootstrap.feeWei+" Wei · Nonce "+bootstrap.feeNonce+" · ":"")+(bootstrap?.missing||[]).join(" · ")||"PoP und Gebühren-Quorum noch on-chain zu prüfen")+'</small></div><div class="chain-actions"><button type="button" class="outline" data-switch="'+esc(c.name)+'">Wallet auf '+esc(c.name)+' wechseln</button><div class="chain-balance" data-balance="'+esc(c.name)+'">Guthaben: Wallet verbinden</div></div></div>';
 }).join("");
 el("infrastructure-list").querySelectorAll("button[data-switch]").forEach(b=>b.addEventListener("click",async()=>{
  try{const chain=workqueue.inventory.chains.find(x=>x.name===b.dataset.switch);await switchDeploymentChain(chain);await refreshWalletBalances();}
  catch(e){el("wallet-status").textContent=e.message;}
 }));
 if(currentWallet)refreshWalletBalances();
}
function formatBalance(b,c){return formatNative(b,c.nativeCurrency.decimals||18)+" "+c.nativeCurrency.symbol;}
async function refreshWalletBalances(){
 if(!workqueue)return;
 try{
  const state=await currentWalletState();
  currentWallet=state;
  if(!state){el("wallet-status").textContent="Nicht verbunden";return;}
  el("wallet-status").textContent=state.address.slice(0,8)+"…"+state.address.slice(-4)+" · Chain "+state.chainId;
  // Wallet balance for its current chain; read-only public RPC for all
  // other chains, to avoid switching chain merely to show gas balances.
  const balances=await Promise.all((workqueue.infrastructure||[]).map(async c=>{
   let data=null;
   try{
    if(state.chainId===c.chainId)data=await balanceOnWalletChain(state.address);
    else {
     const endpoint=c.rpcUrls?.[0];
     if(!/^https:\/\//.test(endpoint||""))throw Error("Unconfigured RPC");
     const response=await fetch("/admin/api/balance?chain="+encodeURIComponent(c.name)+"&address="+encodeURIComponent(state.address),{cache:"no-store"});
     if(!response.ok)throw Error("Balance RPC unavailable");
     data=(await response.json()).balance;
    }
    return [c.name,formatBalance(data,c)];
   }catch{return [c.name,"Nicht verfügbar"];}
  }));
  for(const [chain,value] of balances){
   const node=el("infrastructure-list")?.querySelector('[data-balance="'+chain+'"]');
   if(node)node.textContent="Wallet: "+value;
  }
  el("wallet-balances").textContent=balances.map(([name,b])=>name+": "+b).join(" · ");
 }catch(e){el("wallet-status").textContent=e.message;}
}
async function loadFirstDeploy(){
 const target=el("first-deploy-plan");if(!target)return;
 try{
  const data=await get("/admin/api/first-deploy");
  target.innerHTML='<h3>Erster Einsatz: XGRChain → Base</h3><p>Vorbereitung / nur Leseansicht. Die Blockchain-Ausführung bleibt bis zur vollständigen Prüfung gesperrt.</p><p id="xgr-live-preflight">XGRChain-RPC-/BLS-Prüfung läuft …</p>'+
   data.chains.map(c=>'<div class="first-chain"><strong>'+esc(c.name)+' · '+esc(c.verifiedComponents)+'/'+esc(c.totalSteps)+' Schritte dokumentiert</strong><small>Initialgebühr: '+esc(c.initialFeeWei===null?"offen":c.initialFeeWei+" Wei")+'</small><div>'+c.steps.map(s=>'<div class="first-step"><span>'+esc(s.title)+'</span><small>'+esc(s.status==="documented"?"Dokumentiert":s.blockers.join(" · ")||"Verifikation offen")+'</small></div>').join("")+'</div></div>').join("");
  try {const status=(await get("/admin/api/xgr-preflight")).preflight;
   const live=el("xgr-live-preflight");if(live)live.textContent="XGRChain Live-Preflight: "+(status.basicRpcPreflightOK?"RPC/Core und negativer BLS-Test OK":"nicht bestanden")+" · Positive BLS-Verifikation offen · "+(status.error||"Keine Deploy-Freigabe");
  } catch(e){const live=el("xgr-live-preflight");if(live)live.textContent="XGRChain-Preflight nicht erreichbar: "+e.message;}
 }catch(e){target.textContent="Erster Deployment-Plan nicht verfügbar: "+e.message;}
}
function renderQueue(){
 if(!workqueue)return;
 const items=workqueue.workItems||[];
 el("deployment-queue").innerHTML=items.map(item=>'<div class="route"><div><strong>'+esc(item.title)+'</strong><small>'+esc(item.reason)+'</small></div><span class="status blocked">Blockiert</span></div>').join("")||"<p>Keine offenen Deployments im aktuellen main.</p>";
}
function setView(name){
 for(const section of document.querySelectorAll(".view"))section.hidden=section.id!==name;
 for(const link of document.querySelectorAll(".sidebar [data-view]"))link.classList.toggle("active",link.dataset.view===name);
}
async function loadMainWorkqueue(){
 el("main-status").textContent="Aktuellen GitHub main prüfen …";
 try{
  const data=await get("/admin/api/workqueue");
  workqueue=data;
  el("main-status").textContent=data.readOnly ? ("Nur Leseansicht · lokaler main "+data.commit.slice(0,12)+" · "+(data.warning||"Deployment gesperrt")) : ("GitHub main verifiziert · "+data.commit.slice(0,12)+" · Nur bestätigte On-Chain-Belege zählen als Deployment");
  renderAssets();renderInfrastructure();renderQueue();loadFirstDeploy();
 }catch(e){workqueue=null;el("main-status").textContent="Deployment gesperrt: "+e.message;el("main-workqueue").textContent="Der freigegebene GitHub main oder die Deployment-Zuordnung konnte nicht überprüft werden.";}
}
async function check(){
 el("preflight").textContent="RPC-Prüfung läuft …";
 try{
  const d=await get("/admin/api/preflight");
  el("preflight").innerHTML=d.results.map(r=>'<article><strong>'+esc(r.name)+'</strong><p>Chain-ID '+(r.chainIdOk?"OK":"nicht bestätigt")+' · Mailbox '+(r.mailboxCode?"OK":"nicht bestätigt")+' · Hook '+(r.hookCode?"OK":"nicht bestätigt")+'</p>'+(r.error?'<small>'+esc(r.error)+'</small>':"")+'</article>').join("");
 }catch(e){el("preflight").textContent=e.message;}
}
async function loadPlan(){
 try{const d=await get("/admin/api/plan");el("steps").innerHTML=d.steps.map(s=>'<article><strong>'+s.order+'. '+esc(s.description)+'</strong><p>'+esc(s.chain)+' · '+esc(s.kind)+'</p></article>').join("");}
 catch(e){el("steps").textContent="Veralteter Diagnoseplan nicht verfügbar: "+e.message;}
}
async function loadJobs(){
 try{
  const d=await get("/admin/api/jobs");
  el("jobs").innerHTML=d.jobs.length?d.jobs.map(j=>'<article><a href="'+esc(j.url)+'" target="_blank" rel="noopener noreferrer">'+esc(j.title)+'</a><p>#'+j.number+' · '+esc(j.status)+'</p></article>').join(""):"<p>Keine offenen GitHub-Issues.</p>";
 }catch(e){el("jobs").textContent="Diagnose nicht verfügbar: "+e.message;}
}
el("reload-inventory").addEventListener("click",loadMainWorkqueue);
el("asset-search").addEventListener("input",()=>{assetPage=0;renderAssets();});
el("asset-filter").addEventListener("change",()=>{assetPage=0;renderAssets();});

el("load-jobs").addEventListener("click",loadJobs);
for(const a of document.querySelectorAll("[data-view]"))a.addEventListener("click",e=>{e.preventDefault();setView(a.dataset.view);history.replaceState(null,"","#"+a.dataset.view);if(a.dataset.view==="infrastructure")checkLiveInfrastructure();});
setView(["assets","infrastructure","workflow"].includes(location.hash.slice(1))?location.hash.slice(1):"assets");
el("connect-wallet").addEventListener("click",async()=>{
 try{
  const providerList=walletsAvailable();
  const chosen=providerList.length>1?window.prompt("Wallet wählen: "+providerList.map((p,i)=>(i+1)+". "+p.name).join(" | "),"1"):null;
  const index=chosen?Number(chosen)-1:0;
  if(chosen&&(!Number.isInteger(index)||index<0||index>=providerList.length))throw Error("Ungültige Wallet-Auswahl");
  const state=await connectDeploymentWallet({providerId:providerList[index]?.id,onChange:refreshWalletBalances});
  currentWallet=state;await refreshWalletBalances();
 }catch(e){el("wallet-status").textContent=e.message;}
});
async function checkLiveInfrastructure(){
 try{
  const data=await get("/admin/api/infrastructure");
  chainObservations=new Map(data.chains.map(c=>[c.name,c]));
  try{const b=await get("/admin/api/bootstrap");liveBootstrap=new Map(b.bootstrap.map(x=>[x.chain,x]));}
  catch{liveBootstrap=new Map();}
  renderInfrastructure();
  el("preflight").textContent="On-Chain-Infrastruktur abgeglichen: "+data.chains.filter(x=>x.status==="observed-complete").length+"/"+data.chains.length+" vollständig beobachtet";
 }catch(e){el("preflight").textContent="Infrastrukturprüfung fehlgeschlagen: "+e.message;}
}
el("refresh").addEventListener("click",checkLiveInfrastructure);
loadMainWorkqueue();loadPlan();
// Chain RPC state is queried only in the dedicated Chains view or on refresh.
