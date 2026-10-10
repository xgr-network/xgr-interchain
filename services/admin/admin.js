import {connectDeploymentWallet,currentWalletState,switchDeploymentChain,balanceOnWalletChain,formatNative,walletsAvailable,broadcastDeploymentIntent} from "./wallet.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const el=id=>document.getElementById(id);
async function postJSON(p,data){const r=await fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"HTTP "+r.status);return d;}
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
const coreTitles={blsVerifier:"BLS-Verifier",validatorRegistry:"ValidatorRegistry",ism:"Security Module",factory:"Factory",sourceRegistry:"Source Registry"};
const displayAddress=a=>a.slice(0,6)+"…"+a.slice(-6);
let selectedDeployment=null;
let deploymentReadiness=new Map();
function cleanBootstrapStatus(chain){
 const r=deploymentReadiness.get(chain);
 if(!r)return "Prüfung ausstehend";
 if(liveBootstrap.get(chain)?.validatorSetId)return "Registry live · On-Chain-Werte verbindlich";
 if(r.evidenceVerified)return r.verifiedValidatorCount+" Validatoren geprüft";
 return r.evidenceError?"Nachweise prüfen":"Validierung noch offen";
}
function renderInfrastructure(){
 if(!workqueue)return;
 const chains=workqueue.inventory.chains;
 el("infrastructure-list").innerHTML=(workqueue.infrastructure||[]).map(c=>{
  const cfg=chains.find(x=>x.name===c.name);
  const native=cfg?.blsVerifierFormat==="compressed";
  const verifier=(workqueue.bootstrap||[]).find(x=>x.chain===c.name)?.verifierAddress;
  const verifierRow=native&&verifier?
   '<div class="component-row"><span>Nativer BLS-Verifier</span><span class="component-address">'+
   '<button class="address-copy" data-copy="'+esc(verifier)+'" title="'+esc(verifier)+'">'+esc(displayAddress(verifier))+
   ' ⧉</button></span></div>':"";
  const tasks=c.components.map(part=>
   '<div class="component-row"><span>'+esc(coreTitles[part.key]||part.key)+'</span>'+
   (part.status==="documented"&&part.address?
    '<button class="address-copy" data-copy="'+esc(part.address)+'" title="'+esc(part.address)+'">'+
     esc(displayAddress(part.address))+' ⧉</button>':
    '<button class="component-pending" data-open-chain="'+esc(c.name)+
     '" data-open-component="'+esc(part.key)+'">Ausstehend →</button>')+'</div>').join("");
  const r=deploymentReadiness.get(c.name),live=liveBootstrap.get(c.name);
  const money=n=>n==null?"":moneyInWei(n,c);
  const liveRows=live?.validatorSetId?
   '<details class="chain-onchain-params"><summary>On-Chain-Parameter</summary>'+
    '<div>Reserve-Minimum: '+esc(money(live.liveMinimumReserveWei))+'</div>'+
    '<div>Executor-Limit: '+esc(money(live.liveMaxExecutorReimbursementWei))+'</div>'+
    Object.entries(live.liveValidatorReservesWei||{}).map(([address,value])=>
     '<div>'+esc(displayAddress(address))+': '+esc(money(value))+'</div>').join("")+
    (live.liveFactoryGasLimit?'<div>Factory-Zielgas: '+esc(live.liveFactoryGasLimit)+'</div>':'')+
    (live.feeWei?'<div>Live Source-Fee: '+esc(money(live.feeWei))+
       ' · Nonce '+esc(live.feeNonce)+'</div>':'')+
    '</details>':"";
  return '<article class="chain-card"><div class="chain-top"><strong>'+esc(c.name)+'</strong>'+
   '<span class="status">'+c.documented+'/'+c.required+' Contracts</span></div>'+
   '<small>Chain '+c.chainId+' · Domain '+c.domainId+' · '+esc(c.nativeCurrency.symbol)+'</small>'+
   '<div class="chain-components">'+verifierRow+tasks+'</div>'+
   (c.documented<c.required?
    '<div class="chain-bootstrap-summary"><span>Bootstrap</span><span>'+
    esc(cleanBootstrapStatus(c.name))+'</span></div>':"")+
   liveRows+
   '<div class="chain-actions"><button type="button" class="outline" data-switch="'+esc(c.name)+
   '">Wallet wechseln</button><div class="chain-balance" data-balance="'+esc(c.name)+
   '"></div></div></article>';
 }).join("");
 el("infrastructure-list").querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent="Kopiert ✓";
   setTimeout(()=>{b.textContent=displayAddress(b.dataset.copy)+" ⧉";},1200);
  }catch{b.textContent=b.dataset.copy;}
 }));
 el("infrastructure-list").querySelectorAll("[data-open-chain]").forEach(b=>b.addEventListener("click",()=>{
  openContractModal(b.dataset.openChain,b.dataset.openComponent);
 }));
 el("infrastructure-list").querySelectorAll("button[data-switch]").forEach(b=>b.addEventListener("click",async()=>{
  try{const chain=chains.find(x=>x.name===b.dataset.switch);
   await switchDeploymentChain(chain);await refreshWalletBalances();}
  catch(e){el("wallet-status").textContent=e.message;}
 }));
 if(currentWallet)refreshWalletBalances();
}
function moneyInWei(wei,chain){
 try{return formatNative(String(wei),chain.nativeCurrency.decimals||18,8)+" "+chain.nativeCurrency.symbol}
 catch{return "—"}
}
function presentModalStatus(message,type=""){const n=el("contract-modal-status");n.textContent=message;n.dataset.type=type;}
function modalValues(component){
 const keys=component==="validatorRegistry"
  ?["minimumWei","maxExecutorReimbursementWei","perValidatorWei"]:
   component==="factory"?["sourceFeeWei","defaultDestinationGasLimit"]:[];
 const result={};
 for(const key of keys){
  const v=el("modal-"+key).value.trim();
  if(!/^[1-9][0-9]*$/.test(v))throw Error("Bitte positiven ganzzahligen Wert eingeben: "+key);
  result[key]=key==="defaultDestinationGasLimit"?Number(v):v;
 }
 if(component==="validatorRegistry"&&
  (BigInt(result.perValidatorWei)<BigInt(result.minimumWei)||
   BigInt(result.minimumWei)<BigInt(result.maxExecutorReimbursementWei)))
  throw Error("Validatorreserve ≥ Mindestreserve ≥ Erstattungslimit erforderlich");
 if(component==="factory"&&(!Number.isSafeInteger(result.defaultDestinationGasLimit)||
  result.defaultDestinationGasLimit<21000||result.defaultDestinationGasLimit>10000000))
  throw Error("Destination-Gaslimit muss zwischen 21.000 und 10.000.000 liegen");
 return result;
}
let lastModalPreview=null;
async function openContractModal(chainName,component){
 const chain=workqueue?.inventory?.chains.find(c=>c.name===chainName);
 const infra=workqueue?.infrastructure?.find(c=>c.name===chainName);
 const part=infra?.components.find(x=>x.key===component);
 if(!chain||!part||part.status==="documented")return;
 selectedDeployment={chainName,component};
 const title=coreTitles[component]||component;
 el("contract-modal-title").textContent=title+" · "+chainName;
 el("contract-modal-subtitle").textContent="Chain "+chain.chainId+" · Wallet bestätigt jede Transaktion";
 presentModalStatus("Lade aktuellen Deployment-Status …");
 el("modal-gas-result").textContent="";
 el("modal-gas-check").disabled=true;
 el("modal-deploy").disabled=true;
 el("modal-recover").hidden=true;
 el("modal-parameters").hidden=true;
 el("contract-deploy-dialog").showModal();
 try{
  const [response,status]=await Promise.all([
   get("/admin/api/deployment-readiness?chain="+encodeURIComponent(chainName)),
   get("/admin/api/chain-deploy/status")]);
  if(selectedDeployment?.chainName!==chainName||selectedDeployment.component!==component)return;
  const r=response.readiness,existing=status.intents.entries[chainName+":"+component];
  deploymentReadiness.set(chainName,r);
  renderInfrastructure();
  const requiresValues=component==="validatorRegistry"||component==="factory";
  lastModalPreview=null;
  const fields=component==="validatorRegistry"
   ?["minimumWei","maxExecutorReimbursementWei","perValidatorWei"]:
   component==="factory"?["sourceFeeWei","defaultDestinationGasLimit"]:[];
  el("modal-parameters").hidden=!requiresValues;
   el("modal-bootstrap-evidence").textContent=component==="validatorRegistry"
   ?(r.evidenceVerified?
     r.verifiedValidatorCount+"/3 öffentliche Validatornachweise geprüft · Snapshot "+r.originSnapshotBlock:
     "Validatornachweise müssen vor dem Deploy geprüft werden"):"";
  let proposal=null;
  if(requiresValues){
   try{
    const response=await get("/admin/api/bootstrap/suggestions?chain="+encodeURIComponent(chainName));
    proposal=response.proposal;
   }catch{}
  }
  const fromGitHub={
    minimumWei:r.values.minimumReserveWei,
    maxExecutorReimbursementWei:r.values.maxExecutorReimbursementWei,
    perValidatorWei:r.values.perValidatorReserveWei,
    sourceFeeWei:r.values.sourceFeeWei,
    defaultDestinationGasLimit:chain.defaultDestinationGasLimit
  };
  for(const key of ["minimumWei","maxExecutorReimbursementWei","perValidatorWei","sourceFeeWei","defaultDestinationGasLimit"]){
   const input=el("modal-"+key);
   input.parentElement.hidden=!fields.includes(key);
   // No JSON file authorizes economics. Historical values are reference only.
   input.value="";
   const suggestion=fromGitHub[key]??proposal?.values?.[key];
   input.placeholder=suggestion==null?"Manuell festlegen":String(suggestion);
   input.title="Nur Constructor-Eingabe. Placeholder ist nicht genehmigt oder verbindlich.";
  }
  el("modal-parameter-note").textContent=requiresValues?
   "Einmalige Constructor-Werte. Graue Zahlen sind lediglich Hinweise, keine Konfiguration. "+
   "Nach Deploy zählt ausschließlich der Live-Contract; GitHub speichert nur Adresse und Receipt.":
   "Keine wirtschaftlichen Eingaben nötig. Verifizierte Vorgänger-Contracts werden live geprüft.";

  if(existing){
     el("modal-gas-check").disabled=true;
   el("modal-deploy").disabled=true;
   el("modal-recover").hidden=false;
   presentModalStatus("Vorherige Transaktion: "+existing.stage+
    ". Zuerst wiederherstellen – niemals erneut senden.","warn");
   return;
  }
  if(workqueue.readOnly)throw Error("GitHub main ist nicht aktuell");
  if(component==="validatorRegistry"&&!r.evidenceVerified){
   presentModalStatus("Öffentliche Validatornachweise auf der Zielchain noch nicht verifiziert.","warn");
   return;
  }
  el("modal-gas-check").disabled=false;
  presentModalStatus("Constructor-Werte eingeben und Gas prüfen.");

 }catch(e){presentModalStatus("Prüfung nicht möglich: "+e.message,"error")}
}
async function checkModalGas(){
 if(!selectedDeployment)return;
 const {chainName,component}=selectedDeployment;
 const output=el("modal-gas-result");
 try{
  const chain=workqueue.inventory.chains.find(c=>c.name===chainName);
  const state=await currentWalletState();
  if(!state)throw Error("Zuerst Wallet verbinden");
  if(state.chainId!==chain.chainId){
   await switchDeploymentChain(chain);
  }
  const updated=await currentWalletState();
  if(!updated||updated.chainId!==chain.chainId)throw Error("Wallet auf andere Chain eingestellt");
  const parameters=modalValues(component);
  const result=await postJSON("/admin/api/chain-deploy/preview",{
   chain:chainName,component,wallet:updated.address,parameters
  });
  if(!result.preview?.totalWorstCaseWei)throw Error("Keine gültige Gas-Simulation");
  lastModalPreview={chainName,component,parameters,sourceCommit:result.preview.sourceCommit,wallet:updated.address};
  output.textContent="Gaslimit "+BigInt(result.preview.gasLimit).toString()+
   " · inkl. Constructor-Einlage bis "+moneyInWei(result.preview.totalWorstCaseWei,chain);
  el("modal-deploy").disabled=false;
  presentModalStatus("Gas geprüft. Deployment benötigt Bestätigung in deiner Wallet.");
 }catch(e){el("modal-deploy").disabled=true;presentModalStatus("Gasprüfung blockiert: "+e.message,"error")}
}
async function executeModalDeployment(){
 if(!selectedDeployment)return;
 const {chainName,component}=selectedDeployment;
 const button=el("modal-deploy");button.disabled=true;
 try{
  const chain=workqueue.inventory.chains.find(c=>c.name===chainName);
  const params=modalValues(component);
  if(!lastModalPreview||lastModalPreview.chainName!==chainName||
    lastModalPreview.component!==component||JSON.stringify(lastModalPreview.parameters)!==JSON.stringify(params))
   throw Error("Constructor-Werte geändert: Gas bitte erneut prüfen");
  const state=await currentWalletState();
  if(!state||state.chainId!==chain.chainId)throw Error("Wallet nicht mit ausgewählter Chain verbunden");
  presentModalStatus("Sicherheitsprüfungen und persistentes Transaktionsjournal …");
  const prepared=await postJSON("/admin/api/chain-deploy/prepare",
   {chain:chainName,component,wallet:state.address,parameters:params});
  presentModalStatus("Wallet-Bestätigung ausstehend. Bei Abbruch Wiederherstellung verwenden.");
  const txHash=await broadcastDeploymentIntent(prepared);
  el("modal-recover").hidden=false;
  presentModalStatus("Transaktion gesendet · Hash wird gesichert …");
  await postJSON("/admin/api/chain-deploy/hash",{id:prepared.id,txHash});
  presentModalStatus("Warte auf Receipt und On-Chain-Verifikation …");
  const result=await postJSON("/admin/api/chain-deploy/reconcile",{id:prepared.id});
  if(result.result.stage!=="documented")throw Error("Receipt noch nicht dokumentiert");
  presentModalStatus("Deployment verifiziert und in GitHub dokumentiert.","success");
  el("contract-deploy-dialog").close();selectedDeployment=null;
  await loadMainWorkqueue();
 }catch(e){el("modal-recover").hidden=false;presentModalStatus(
  "Abgleich erforderlich: "+e.message+". Keine zweite Transaktion senden.","error")}
}
async function recoverModalDeployment(){
 if(!selectedDeployment)return;
 const {chainName,component}=selectedDeployment,id=chainName+":"+component;
 try{
  const all=await get("/admin/api/chain-deploy/status");
  const entry=all.intents.entries[id];
  if(!entry)throw Error("Keine laufende Transaktion im Journal");
  if(entry.stage==="prepared"){
   const hash=window.prompt("Transaktionshash der Wallet (falls gesendet):","");
   if(!hash)return presentModalStatus("Unbekannter Broadcast-Status. Transaktion bleibt gesperrt.","warn");
   await postJSON("/admin/api/chain-deploy/hash",{id,txHash:hash});
  }
  const result=await postJSON("/admin/api/chain-deploy/reconcile",{id});
  presentModalStatus("Wiederherstellung: "+result.result.stage,"success");
  if(result.result.stage==="documented"){el("contract-deploy-dialog").close();selectedDeployment=null;await loadMainWorkqueue()}
 }catch(e){presentModalStatus("Wiederherstellung blockiert: "+e.message,"error")}
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
  target.innerHTML='<h3>Offene Routen</h3>'+
   '<p>Chain-Contracts werden ausschließlich über „Chains & Onboarding“ direkt auf der Chain-Karte deployed. '+
   'Einmalige Constructor-Werte erscheinen im jeweiligen Dialog, nicht als GitHub-Konfiguration.</p>'+
   '<label for="deployment-chain-select">Chain</label> '+
   '<select id="deployment-chain-select">'+data.chains.map(c=>
    '<option value="'+esc(c.name)+'"'+(c.name===selectedDeployChain?' selected':'')+'>'+
     esc(c.name)+'</option>').join("")+'</select>'+
   '<div id="route-lifecycle"></div>';
  el("deployment-chain-select").addEventListener("change",e=>{
   selectedDeployChain=e.target.value;loadRouteLifecycle();renderQueue();
  });
  await loadRouteLifecycle();
 }catch(e){target.textContent="Routenübersicht nicht verfügbar: "+e.message;}
}
async function loadRouteLifecycle(){
 const node=el("route-lifecycle");if(!node)return;
 try{
  const res=await get("/admin/api/route-lifecycle");
  if(!node.isConnected)return;
  const tasks=(res.tasks||[]).filter(x=>x.chain===selectedDeployChain);
  const title=task=>task.kind==="router"?
   "Token-Router einmalig deployen · "+task.asset:"Gateway für Rück-/Hinroute vorbereiten · "+task.asset;
  const line=task=>'<div class="first-step"><strong>'+esc(title(task))+
   '</strong><small>'+esc(task.status==="waiting-infrastructure"?
    "Zuerst Chain-Grundverträge bereitstellen":
    task.status==="waiting-dependencies"?
    "Abhängig von: "+task.blockers.join(", "):
    "Nächster Schritt: on-chain Fakten und Factory-Transaktion unabhängig verifizieren")+
   '</small></div>';
  node.innerHTML='<h3>Offene Asset- und Routenaufgaben</h3>'+
   '<p>Mint/Burn-Router nur einmal je Token und Chain. Rückroute nutzt denselben Token-Router, aber ein eigenes gerichtetes Gateway.</p>'+
   (tasks.length?line(tasks[0]):'<p>Keine offenen Router/Gateway-Aufgaben auf dieser Chain.</p>')+
   (tasks.length>1?'<details><summary>'+ (tasks.length-1)+
    ' weitere offene Routenaufgaben</summary>'+
    tasks.slice(1).map(line).join("")+'</details>':"")+
   '<small>BLS-Sicherheitsaktivierung erfolgt erst nach verifizierter Gegenroute. Keine automatische Freischaltung.</small>';
 }catch(e){if(node.isConnected)node.textContent="Routenplan nicht verfügbar: "+e.message;}
}
const deployTitle={blsVerifier:"BLS-Verifier auf dieser EIP-2537-Chain bereitstellen",
 validatorRegistry:"ValidatorRegistry deployen",ism:"Interchain Security Module deployen",
 factory:"Permissionless Factory deployen",sourceRegistry:"Source Registry über Factory deployen"};
function renderPendingChainSteps(chain,readiness){
 const pending=chain.steps.filter(s=>s.kind!=="verify"&&s.status!=="documented");
 const selector=el("deployment-component-select"),old=selector.value;
 selector.innerHTML=pending.map(s=>'<option value="'+esc(s.component)+'">'+
  esc(deployTitle[s.component]||s.title)+'</option>').join("");
 if(pending.some(s=>s.component===old))selector.value=old;
 const next=pending[0];
 el("selected-deploy-details").innerHTML='<div class="first-chain">'+
  '<strong>'+esc(chain.name)+' · '+pending.length+' offene Chain-Contracts</strong>'+
  (chain.verifierFormat==="compressed"?'<p>Nativer BLS-Verifier ist Bestandteil der XGRChain. Kein EIP-2537-Deployment erforderlich.</p>':'')+
  (next?'<div class="first-step"><strong>Nächste Aufgabe: '+esc(deployTitle[next.component]||next.title)+
   '</strong></div>':'<p>Alle Chain-Grundverträge dokumentiert. Weiter zum Routendeploy.</p>')+
  (pending.length>1?'<details><summary>Weitere '+(pending.length-1)+' noch offene Contracts</summary>'+
   pending.slice(1).map(s=>'<div class="first-step">'+esc(deployTitle[s.component]||s.title)+'</div>').join("")+'</details>':'')+'</div>';
 const missing=(readiness?.missing||[]).filter(x=>!x.includes("BLS-Schlüssel")&&!x.includes("PoS-Validator-Snapshot"));
 const bootstrapOpen=readiness?.evidenceVerified===false;
 const isVerifier=next?.component==="blsVerifier";
 const status=el("deployment-execute-reason");
 const action=el("deployment-execute");
 action.disabled=!next||Boolean(workqueue?.readOnly);
 if(!next)status.textContent="Chain-Infrastruktur vollständig";
 else if(workqueue?.readOnly)status.textContent="GitHub main ist nicht aktuell bestätigt";
 else if(!isVerifier&&bootstrapOpen)status.textContent="Öffentliche Validatornachweise beim Contract-Deploy prüfen";
 else status.textContent="Die Wallet bestätigt jeden einzelnen Deploy separat";
 const summary=el("chain-live-preflight");
 summary.textContent=next?"Constructor-Werte werden nur für die konkrete Wallet-Transaktion festgelegt":
  "Keine offenen Chain-Contracts";
 return {pending,missing};
}
async function showSelectedDeployChain(data){
 const chain=data.chains.find(c=>c.name===selectedDeployChain);
 if(!chain)return;
 renderPendingChainSteps(chain,null);
 try{
  const {readiness}=await get("/admin/api/deployment-readiness?chain="+encodeURIComponent(chain.name));
  if(selectedDeployChain!==chain.name)return;
  renderPendingChainSteps(chain,readiness);
 }catch(e){if(selectedDeployChain===chain.name)
  el("deployment-execute-reason").textContent="Statusprüfung nicht möglich: "+e.message;}
 try{
  const preflight=(await get("/admin/api/chain-preflight?chain="+encodeURIComponent(chain.name))).preflight;
  if(selectedDeployChain!==chain.name)return;
  const node=el("chain-live-preflight");
  node.textContent=(preflight.basicRpcPreflightOK?"RPC, Hyperlane und native/BLS-Prüfung OK":
    "Sicherheitsprüfung blockiert: "+(preflight.error||"Preflight fehlt"))+
    " · "+(chain.steps.filter(s=>s.kind!=="verify"&&s.status!=="documented").length)+" Grundverträge offen";
 }catch(e){if(selectedDeployChain===chain.name)el("chain-live-preflight").textContent=
  "RPC-Prüfung momentan nicht erreichbar: "+e.message;}
}

function renderQueue(){
 if(!workqueue)return;
 const items=(workqueue.workItems||[]).filter(item=>{
  if(item.kind==="validator-bootstrap")return !workqueue.bootstrap?.some(p=>p.chain===item.chain&&p.ready);
  if(item.kind==="fee-bootstrap")return !workqueue.bootstrap?.some(p=>p.chain===item.chain&&p.proposedFeeWei);
  return item.status!=="documented";
 });
 const scoped=items.filter(item=>item.chain===selectedDeployChain);
 const other=items.filter(item=>item.chain!==selectedDeployChain);
 const line=item=>'<div class="route"><div><strong>'+esc(item.title)+'</strong></div></div>';
 el("deployment-queue").innerHTML=
  '<p>Nur ausstehende Aufgaben. Die vollständige technische Fehleranalyse erscheint erst beim Start der jeweiligen Aktion.</p>'+
  (scoped.length?scoped.slice(0,1).map(line).join(""):"<p>Keine weiteren offenen Aufgaben auf der ausgewählten Chain.</p>")+
  (scoped.length>1?'<details><summary>'+ (scoped.length-1)+
   ' weitere offene Aufgaben auf '+esc(selectedDeployChain)+'</summary>'+
   scoped.slice(1).map(line).join("")+'</details>':"")+
  (other.length?'<details><summary>'+other.length+' offene Aufgaben auf anderen Chains</summary>'+
   other.map(line).join("")+'</details>':"");
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
  deploymentReadiness.clear();
  renderAssets();renderInfrastructure();renderQueue();loadFirstDeploy();
  // Read-only evidence status lives independently from incomplete GitHub config.
  await Promise.all((data.infrastructure||[]).map(async chain=>{
   try{
    const report=await get("/admin/api/deployment-readiness?chain="+encodeURIComponent(chain.name));
    if(workqueue===data)deploymentReadiness.set(chain.name,report.readiness);
   }catch{}
  }));
  if(workqueue===data){
   try{
    const b=await get("/admin/api/bootstrap");
    liveBootstrap=new Map(b.bootstrap.map(x=>[x.chain,x]));
   }catch{liveBootstrap=new Map();}
   renderInfrastructure();
  }
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
el("modal-close").addEventListener("click",()=>el("contract-deploy-dialog").close());
el("contract-deploy-dialog").addEventListener("close",()=>{selectedDeployment=null;});

el("modal-gas-check").addEventListener("click",checkModalGas);
el("modal-deploy").addEventListener("click",executeModalDeployment);
el("modal-recover").addEventListener("click",recoverModalDeployment);
el("reload-inventory").addEventListener("click",loadMainWorkqueue);
el("deploy-all").addEventListener("click",()=>{setView("infrastructure");history.replaceState(null,"","#infrastructure");});
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
