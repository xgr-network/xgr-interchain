import {connectDeploymentWallet,currentWalletState,switchDeploymentChain,balanceOnWalletChain,formatNative,walletsAvailable,broadcastDeploymentIntent} from "./wallet.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const el=id=>document.getElementById(id);
async function postJSON(p,data){const r=await fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"HTTP "+r.status);return d;}
async function get(p){const r=await fetch(p,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"HTTP "+r.status);return d;}
const labels={"not-deployed":"Nicht deployed",partial:"Teilweise deployed",deployed:"Deployed"};
const pill=(s)=>'<span class="status '+esc(s)+'">'+esc(labels[s]||s)+'</span>';
let workqueue=null;
let assetPage=0;
let assetTasks=[];
let selectedAssetTask=null;
let assetPreview=null;
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
 '<div class="routes">'+assetTasks.filter(t=>t.asset===a.key).map(t=>
  '<div class="route"><div><strong>'+
  esc(t.kind==="router"?"Token-Router auf "+t.chain+" (einmalig)":t.chain+" · Gateway "+t.id.split(":").slice(1,-1).join(":"))+
  '</strong><small>'+esc(t.blockers.length?"Zuerst: "+t.blockers.join(", "):"Bereit zum Prüfen")+
  '</small></div><button type="button" class="component-pending" data-asset-task="'+esc(t.id)+'">Ausstehend →</button></div>').join("")+
  (assetTasks.some(t=>t.asset===a.key)?"":'<p>Keine offenen Router- oder Gateway-Deployments.</p>')+
  '</div></section>').join(""):'<p>Keine Assets für diesen Filter.</p>';
 el("main-workqueue").querySelectorAll("[data-asset-task]").forEach(b=>
  b.addEventListener("click",()=>openAssetModal(b.dataset.assetTask)));
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
  ?["minimumWei","maxExecutorReimbursementWei"]:
   component==="factory"?["sourceFeeWei","defaultDestinationGasLimit"]:[];
 const result={};
 for(const key of keys){
  const v=el("modal-"+key).value.trim();
  if(!/^[1-9][0-9]*$/.test(v))throw Error("Bitte positiven ganzzahligen Wert eingeben: "+key);
  result[key]=key==="defaultDestinationGasLimit"?Number(v):v;
 }
 if(component==="validatorRegistry"&&
  (BigInt(result.minimumWei)<BigInt(result.maxExecutorReimbursementWei)))
  throw Error("Mindestreserve muss mindestens der maximalen Executor-Erstattung entsprechen");
 if(component==="factory"&&(!Number.isSafeInteger(result.defaultDestinationGasLimit)||
  result.defaultDestinationGasLimit<21000||result.defaultDestinationGasLimit>10000000))
  throw Error("Destination-Gaslimit muss zwischen 21.000 und 10.000.000 liegen");
 return result;
}
let lastModalPreview=null;
async function openAssetModal(taskId){
 const task=assetTasks.find(x=>x.id===taskId);
 if(!task)return;
 selectedDeployment=null;selectedAssetTask=task;assetPreview=null;
 const chain=workqueue.inventory.chains.find(c=>c.name===task.chain);
 el("contract-modal-title").textContent=task.kind==="router"?
  "Token-Router einmalig bereitstellen":task.kind==="activation"?
  "BLS-Routenaktivierung":"Gerichtete Route vorbereiten";
 el("contract-modal-subtitle").textContent=task.asset+" · "+task.chain+
  " · Chain "+chain.chainId;
 el("modal-parameters").hidden=true;
 el("modal-route-context").hidden=false;
 el("modal-route-context").textContent=task.kind==="router"?
  "Dieser Token-Router gehört zum Asset auf dieser Chain und wird für Rückrouten wiederverwendet.":
  task.kind==="activation"?"Die Gegenroute muss unabhängig verifiziert und mit einem echten Validator-BLS-Quorum bestätigt werden. Die Wallet kann das nicht stellvertretend unterschreiben.":
  "Das Gateway und sein FeeVault werden gemeinsam erzeugt. Die Route bleibt bis zur BLS-Bestätigung inaktiv.";
 el("modal-gas-result").textContent="";
 el("modal-deploy").disabled=task.blockers.length>0;
 el("modal-recover").hidden=true;
 el("contract-deploy-dialog").showModal();
 if(task.kind==="activation"){
  el("modal-deploy").disabled=true;
  presentModalStatus("BLS-Quorum und unabhängiger Gegenketten-Nachweis fehlen. Noch nicht aktiv.","warn");
  return;
 }
 try{
  const journal=(await get("/admin/api/chain-deploy/status")).intents.entries;
  const graph=workqueue.inventory.assets[task.asset];
  const component=task.kind==="gateway"?"gateway":
   graph.representations[task.chain].role==="native"?"nativeRouter":
   graph.representations[task.chain].role==="synthetic"?"syntheticRouter":"collateralRouter";
  const routeName=task.kind==="gateway"?task.id.slice(task.asset.length+1).replace(/:prepare$/,""):"none";
  const id=task.chain+":"+task.asset+":"+component+":"+routeName;
  if(journal[id]){
   el("modal-deploy").disabled=true;
   el("modal-recover").hidden=false;
   presentModalStatus("Transaktion vorhanden ("+journal[id].stage+"). Zuerst wiederherstellen; kein erneutes Senden.","warn");
   return;
  }
 }catch(e){el("modal-deploy").disabled=true;presentModalStatus("Journal nicht erreichbar: "+e.message,"error");return;}
 if(task.blockers.length)presentModalStatus("Zuerst erforderlich: "+task.blockers.join(", "),"warn");
 else presentModalStatus("Bereit: Mit Wallet deployen. Gebühren bestätigt MetaMask.");
}
async function previewAssetDeployment(){
 const task=selectedAssetTask;
 if(!task)return;
 const chain=workqueue.inventory.chains.find(c=>c.name===task.chain);
 let wallet=await currentWalletState();
 if(!wallet)throw Error("Wallet verbinden");
 if(wallet.chainId!==chain.chainId)await switchDeploymentChain(chain);
 wallet=await currentWalletState();
 if(!wallet||wallet.chainId!==chain.chainId)throw Error("Wallet-Chain stimmt nicht überein");
 const result=await postJSON("/admin/api/asset-deploy/preview",{taskId:task.id,wallet:wallet.address});
 assetPreview={taskId:task.id,wallet:wallet.address};
 el("modal-gas-result").textContent="Gaslimit "+BigInt(result.preview.simulation.gasLimit).toString()+
  " · Maximal "+moneyInWei(result.preview.simulation.totalWorstCaseWei,chain);
 el("modal-deploy").disabled=false;
 presentModalStatus("On-Chain-Vorprüfung erfolgreich. Deployment durch Wallet bestätigen.");
}
async function executeAssetDeployment(){
 const task=selectedAssetTask;
 if(!task)throw Error("Keine Asset-Aufgabe ausgewählt");
 const wallet=await currentWalletState();
 if(!wallet)throw Error("Wallet verbinden");
 el("modal-deploy").disabled=true;
 const prepared=await postJSON("/admin/api/asset-deploy/prepare",{
  taskId:task.id,wallet:wallet.address});
 el("modal-recover").hidden=false;
 presentModalStatus("Wallet signiert. Bei Unterbrechung ausschließlich Wiederherstellung verwenden.");
 const txHash=await broadcastDeploymentIntent(prepared);
 await postJSON("/admin/api/asset-deploy/hash",{id:prepared.id,txHash});
 presentModalStatus("Überprüfe Router/Gateway, FeeVault und Block-Receipt …");
 const report=await postJSON("/admin/api/asset-deploy/reconcile",{id:prepared.id});
 if(report.result.stage!=="documented")throw Error("Deployment-Receipt noch nicht veröffentlicht");
 presentModalStatus("Deployment dokumentiert. Route bleibt bis zur BLS-Aktivierung gesperrt.","success");
 el("contract-deploy-dialog").close();selectedAssetTask=null;await loadMainWorkqueue();
}
async function recoverAssetDeployment(){
 const task=selectedAssetTask;
 if(!task)return;
 const chain=workqueue.inventory.chains.find(c=>c.name===task.chain);
 const component=task.kind==="router"?task.id.includes(":")?
   (workqueue.inventory.assets[task.asset]?.representations[task.chain]?.role==="native"?"nativeRouter":
     workqueue.inventory.assets[task.asset]?.representations[task.chain]?.role==="synthetic"?"syntheticRouter":"collateralRouter"):"":
   "gateway";
 const routeName=task.kind==="gateway"?task.id.slice(task.asset.length+1).replace(/:prepare$/,""):"none";
 const id=chain.name+":"+task.asset+":"+component+":"+routeName;
 const existing=(await get("/admin/api/chain-deploy/status")).intents.entries[id];
 if(!existing)throw Error("Keine gespeicherte Asset-Transaktion");
 if(existing.stage==="prepared"){
  const txHash=window.prompt("Bereits gesendeten Wallet-Hash eingeben – niemals neu senden:","");
  if(!txHash)throw Error("Unbekannter Broadcast-Status bleibt gesperrt");
  await postJSON("/admin/api/asset-deploy/hash",{id,txHash});
 }
 const outcome=await postJSON("/admin/api/asset-deploy/reconcile",{id});
 presentModalStatus("Wiederhergestellt: "+outcome.result.stage,"success");
 if(outcome.result.stage==="documented"){
  el("contract-deploy-dialog").close();selectedAssetTask=null;await loadMainWorkqueue();
 }
}
async function openContractModal(chainName,component){
 const chain=workqueue?.inventory?.chains.find(c=>c.name===chainName);
 const infra=workqueue?.infrastructure?.find(c=>c.name===chainName);
 const part=infra?.components.find(x=>x.key===component);
 if(!chain||!part||part.status==="documented")return;
 selectedAssetTask=null;el("modal-route-context").hidden=true;
 selectedDeployment={chainName,component};
 const title=coreTitles[component]||component;
 el("contract-modal-title").textContent=title+" · "+chainName;
 el("contract-modal-subtitle").textContent="Chain "+chain.chainId+" · Wallet bestätigt jede Transaktion";
 presentModalStatus("Lade aktuellen Deployment-Status …");
 el("modal-gas-result").textContent="";
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
    sourceFeeWei:r.values.sourceFeeWei,
    defaultDestinationGasLimit:chain.defaultDestinationGasLimit
  };
  for(const key of ["minimumWei","maxExecutorReimbursementWei","sourceFeeWei","defaultDestinationGasLimit"]){
   const input=el("modal-"+key);
   input.parentElement.hidden=!fields.includes(key);
   // No JSON file authorizes economics. Historical values are reference only.
   const xgrInitial=chainName==="xgrchain"&&component==="validatorRegistry"?{
    minimumWei:"750000000000000000",maxExecutorReimbursementWei:"500000000000000000"}:null;
   input.value=xgrInitial?.[key]??"";
   const suggestion=fromGitHub[key]??proposal?.values?.[key];
   input.placeholder=suggestion==null?"Manuell festlegen":String(suggestion);
   input.title="Nur Constructor-Eingabe. Placeholder ist nicht genehmigt oder verbindlich.";
  }
  el("modal-parameter-note").textContent=requiresValues?
   (chainName==="xgrchain"&&component==="validatorRegistry"?
    "Vorausgefüllt: 0,75 XGR Mindestreserve und 0,5 XGR Erstattungslimit. Beide Werte vor Wallet-Signatur änderbar. ":
    "Einmalige Constructor-Werte. Graue Zahlen sind lediglich Hinweise, keine Konfiguration. ")+
   "Nach Deploy zählt ausschließlich der Live-Contract; GitHub speichert nur Adresse und Receipt.":
   "Keine wirtschaftlichen Eingaben nötig. Verifizierte Vorgänger-Contracts werden live geprüft.";

  if(existing){
   el("modal-deploy").disabled=true;
   el("modal-recover").hidden=false;
   presentModalStatus("Vorherige Transaktion: "+existing.stage+
    ". Zuerst wiederherstellen – niemals erneut senden.","warn");
   return;
  }
  // Gas preview works with a clean checked-out main even if GitHub is temporarily unavailable.
  // The server independently validates the LIVE main before wallet preparation.
  if(component==="validatorRegistry"&&!r.evidenceVerified){
   presentModalStatus("Öffentliche Validatornachweise auf der Zielchain noch nicht verifiziert.","warn");
   return;
  }
  el("modal-deploy").disabled=false;
  presentModalStatus("Werte prüfen und Mit Wallet deployen. Gebühren zeigt MetaMask.");

 }catch(e){presentModalStatus("Prüfung nicht möglich: "+e.message,"error")}
}
async function checkModalGas(){
 if(selectedAssetTask){try{await previewAssetDeployment()}catch(e){presentModalStatus(e.message,"error");el("modal-deploy").disabled=true;}return;}
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
 if(selectedAssetTask){try{await executeAssetDeployment()}catch(e){presentModalStatus("Transaktion prüfen: "+e.message+" · niemals doppelt senden","error");el("modal-recover").hidden=false;}return;}
 if(!selectedDeployment)return;
 const {chainName,component}=selectedDeployment;
 const button=el("modal-deploy");button.disabled=true;
 try{
  const chain=workqueue.inventory.chains.find(c=>c.name===chainName);
  const params=modalValues(component);
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
 if(selectedAssetTask){try{await recoverAssetDeployment()}catch(e){presentModalStatus(e.message,"error")}return;}
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
function renderQueue(){} // No separate work queue: cards are the actionable interface.
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
  try{const tasks=await get("/admin/api/route-lifecycle");assetTasks=tasks.tasks||[];}
  catch{assetTasks=[];}
  renderAssets();renderInfrastructure();
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
el("contract-deploy-dialog").addEventListener("close",()=>{selectedDeployment=null;selectedAssetTask=null;assetPreview=null;});


el("modal-deploy").addEventListener("click",executeModalDeployment);
el("modal-recover").addEventListener("click",recoverModalDeployment);
el("reload-inventory").addEventListener("click",loadMainWorkqueue);

el("asset-search").addEventListener("input",()=>{assetPage=0;renderAssets();});
el("asset-filter").addEventListener("change",()=>{assetPage=0;renderAssets();});


for(const a of document.querySelectorAll("[data-view]"))a.addEventListener("click",e=>{e.preventDefault();setView(a.dataset.view);history.replaceState(null,"","#"+a.dataset.view);if(a.dataset.view==="infrastructure")checkLiveInfrastructure();});
setView(["assets","infrastructure"].includes(location.hash.slice(1))?location.hash.slice(1):"assets");
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
