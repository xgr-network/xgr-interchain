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
let selectedDeployChain=null;
async function loadFirstDeploy(){
 const target=el("first-deploy-plan");if(!target)return;
 try{
  const data=await get("/admin/api/first-deploy");
  if(!selectedDeployChain||!data.chains.some(c=>c.name===selectedDeployChain))
   selectedDeployChain=data.chains[0]?.name;
  target.innerHTML='<h3>Deployment nach GitHub-Konfiguration</h3>'+
   '<p>Jede freigegebene EVM-Chain aus GitHub main verwendet dieselbe Deployment-Pipeline. On-Chain-Aktionen werden erst nach verifizierter Artefakt-, BLS-, Wallet- und Journal-Freigabe aktiviert.</p>'+
   '<label for="deployment-chain-select">Deployment-Chain</label> '+
   '<select id="deployment-chain-select">'+data.chains.map(c=>
    '<option value="'+esc(c.name)+'"'+(c.name===selectedDeployChain?' selected':'')+'>'+
      esc(c.name)+' · '+esc(c.nativeCurrency.symbol)+'</option>').join("")+'</select>'+
   '<div class="chain-actions"><label for="deployment-component-select">Chain-Contract</label><select id="deployment-component-select"><option value="blsVerifier">BLS Verifier (EIP-2537)</option><option value="validatorRegistry">ValidatorRegistry</option><option value="ism">Interchain Security Module</option><option value="factory">Permissionless Factory</option><option value="sourceRegistry">Source Registry</option></select><button type="button" class="outline" id="deployment-check-draft">Transaktion vorbereiten / Gas prüfen</button><small id="deployment-draft-result">Nur Simulation; kein Senden</small></div>'+ 
   '<div id="selected-deploy-details"></div><p id="chain-live-preflight">RPC-Prüfung noch nicht gestartet</p><div id="route-lifecycle">Prüfe Router- und Routenplan …</div>'+ 
   '<div class="chain-actions"><button type="button" class="outline" id="deployment-switch-wallet">Wallet auf ausgewählte Chain wechseln</button><button type="button" id="deployment-execute" disabled title="Wartet auf commitgebundene Transaktionssimulation und geprüfte Sicherheitsnachweise">Deploy auf dieser Chain</button><small id="deployment-execute-reason">Sicherheitsgates werden geprüft</small></div>';
  el("deployment-chain-select").addEventListener("change",e=>{
   selectedDeployChain=e.target.value;
   showSelectedDeployChain(data);loadRouteLifecycle();
  });
  el("deployment-check-draft").addEventListener("click",async()=>{
   const node=el("deployment-draft-result"),chainName=selectedDeployChain;
   node.textContent="Prüfe aktuellen Main-Stand und Transaktionsparameter …";
   try{
    const component=el("deployment-component-select").value;
    const state=await currentWalletState();
    const query="/admin/api/transaction-draft?chain="+encodeURIComponent(chainName)+
      "&component="+encodeURIComponent(component)+
      (state?.chainId===workqueue.inventory.chains.find(x=>x.name===chainName)?.chainId?
       "&wallet="+encodeURIComponent(state.address):"");
    const result=await get(query);
    if(selectedDeployChain!==chainName)return;
    node.textContent=result.draft.id+
      (result.simulation?" · Gaslimit "+result.simulation.gasLimit+
       " · Maximalwert "+result.simulation.totalWorstCaseWei+" Wei":" · Keine Wallet-Simulation")+
      " · Kein Deployment autorisiert";
   }catch(e){if(selectedDeployChain===chainName)node.textContent="Blockiert: "+e.message;}
  });
  el("deployment-switch-wallet").addEventListener("click",async()=>{
   try{
    const chain=workqueue?.inventory?.chains?.find(c=>c.name===selectedDeployChain);
    if(!chain)throw Error("Chain not approved in main");
    await switchDeploymentChain(chain);await refreshWalletBalances();
   }catch(e){el("deployment-execute-reason").textContent=e.message;}
  });
  showSelectedDeployChain(data);loadRouteLifecycle();
 }catch(e){target.textContent="Deployment-Plan nicht verfügbar: "+e.message;}
}
async function loadRouteLifecycle(){
 const node=el("route-lifecycle");if(!node)return;
 try{
  const res=await get("/admin/api/route-lifecycle");
  if(!node.isConnected)return;
  const plans=res.lifecycle.assets.filter(a=>a.pairs.some(p=>p.chains.includes(selectedDeployChain)));
  node.innerHTML='<h3>Token-Repräsentationen und gerichtete Routen</h3>'+
   '<p>Eine Token-Repräsentation wird je Asset und Chain einmal erstellt und für Rückrouten wiederverwendet. Gateways sind gerichtet; Aktivierung benötigt das geprüfte BLS-Quorum.</p>'+
   plans.map(p=>'<div class="first-chain"><strong>'+esc(p.asset)+'</strong>'+
    p.representations.filter(r=>r.chain===selectedDeployChain).map(r=>
     '<div class="first-step"><span>'+esc(r.component)+' · '+esc(r.chain)+'</span><small>'+
     esc(r.action==="reuse-verified"?"Bestehenden Router wiederverwenden":r.deployMethod+" (nur einmal)")+
     (r.router?" · "+esc(r.router):" · noch nicht deployed")+'</small></div>').join("")+
    p.routes.filter(r=>r.source===selectedDeployChain||r.destination===selectedDeployChain)
     .map(r=>'<div class="first-step"><span>'+esc(r.name)+' · '+esc(r.kind)+'</span><small>'+
      esc(r.action)+" · "+esc(r.routeId||"Router-Paar noch nicht vollständig")+
      '</small></div>').join("")+'</div>').join("");
 }catch(e){if(node.isConnected)node.textContent="Routenplan nicht verfügbar: "+e.message;}
}
async function showSelectedDeployChain(data){
 const chain=data.chains.find(c=>c.name===selectedDeployChain);
 if(!chain)return;
 el("selected-deploy-details").innerHTML=
  '<div class="first-chain"><strong>'+esc(chain.name)+' · '+esc(chain.verifiedComponents)+'/'+
  esc(chain.totalSteps)+' Schritte dokumentiert</strong><small>Initialgebühr: '+
  esc(chain.initialFeeWei===null?"offen":chain.initialFeeWei+" Wei")+'</small>'+
  chain.steps.map(s=>'<div class="first-step"><span>'+esc(s.title)+'</span><small>'+
   esc(s.status==="documented"?"Dokumentiert":s.blockers.join(" · ")||"Verifikation offen")+
   '</small></div>').join("")+'</div>';
 const readinessNode=document.createElement("div");
 readinessNode.className="chain-bootstrap";
 el("selected-deploy-details").append(readinessNode);
 readinessNode.textContent="Prüfe BLS-Evidenz und Deployment-Parameter …";
 try{
  const {readiness:r}=await get("/admin/api/deployment-readiness?chain="+encodeURIComponent(chain.name));
  if(selectedDeployChain===chain.name){
   const lines=[
    ["BLS-Validatoren",r.evidenceVerified?r.verifiedValidatorCount+" / 3 verifiziert":"Nicht vollständig geprüft"],
    ["PoS-Snapshot",r.originSnapshotBlock===null?"Ausstehend":"Block "+r.originSnapshotBlock+" · "+r.snapshotConfirmedDepth+" Bestätigungen"],
    ["GitHub main",r.mainCurrent?"Aktuell":"Nicht bestätigt"],
    ["Bootstrap-Manifest",r.manifestMatchesEvidence?"Übereinstimmend":"Noch nicht übernommen"],
    ["Source-Fee (Wei)",r.values.sourceFeeWei??"Offen"],
    ["Mindestreserve (Wei)",r.values.minimumReserveWei??"Offen"],
    ["Max. Executor-Erstattung (Wei)",r.values.maxExecutorReimbursementWei??"Offen"],
    ["Reserve je Validator (Wei)",r.values.perValidatorReserveWei??"Offen"],
    ["Wallet-Deployment",r.deploymentExecutable?"Bereit":"Noch gesperrt – Transaktions-Engine nicht fertig"]
   ];
   const action=el("deployment-execute"),reason=el("deployment-execute-reason");
   // Never enable a transaction based on read-only readiness alone.
   if(action)action.disabled=true;
   if(reason)reason.textContent=r.deploymentExecutable?
    "Commitgebundene Wallet-Transaktionsengine und Simulation noch erforderlich":
    "Nicht ausführbar: "+(r.missing.join(" · ")||"Unvollständige Sicherheitsnachweise");
   readinessNode.innerHTML="<strong>Registry-Deployment · Vorprüfung</strong>"+
    lines.map(([label,value])=>'<div class="first-step"><span>'+esc(label)+'</span><small>'+esc(value)+'</small></div>').join("")+
    '<p>'+esc(r.missing.join(" · ")||"Bootstrap vollständig geprüft")+'</p>';
  }
 }catch(e){if(selectedDeployChain===chain.name)readinessNode.textContent="Vorprüfung nicht verfügbar: "+e.message;}
 const pre=el("chain-live-preflight");
 pre.textContent="RPC-/Verifier-Prüfung läuft …";
 try{
  const status=(await get("/admin/api/chain-preflight?chain="+encodeURIComponent(chain.name))).preflight;
  if(selectedDeployChain!==chain.name)return;
  pre.textContent=chain.name+": "+(status.basicRpcPreflightOK?
   "RPC und Hyperlane Core OK":"Preflight offen oder fehlgeschlagen")+
   " · BLS-Positivnachweis ausstehend · Keine Deploy-Freigabe"+
   (status.error?" · "+status.error:"");
 }catch(e){if(selectedDeployChain===chain.name)pre.textContent="Preflight nicht verfügbar: "+e.message;}
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
