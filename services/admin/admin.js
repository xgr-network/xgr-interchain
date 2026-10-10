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
   '<p>Nur offene Aufgaben. Die nächste ausführbare Aktion steht oben; bereits erledigte Contracts werden nicht erneut angeboten.</p>'+
   '<label for="deployment-chain-select">Deployment-Chain</label> '+
   '<select id="deployment-chain-select">'+data.chains.map(c=>
    '<option value="'+esc(c.name)+'"'+(c.name===selectedDeployChain?' selected':'')+'>'+
      esc(c.name)+' · '+esc(c.nativeCurrency.symbol)+'</option>').join("")+'</select>'+
   '<div class="chain-actions"><label for="deployment-component-select">Nächster Chain-Contract</label><select id="deployment-component-select"></select><button type="button" class="outline" id="deployment-check-draft">Gas für diesen Schritt prüfen</button><small id="deployment-draft-result"></small></div>'+ 
   '<div id="selected-deploy-details"></div><p id="chain-live-preflight">RPC-Prüfung noch nicht gestartet</p><div id="route-lifecycle">Prüfe Router- und Routenplan …</div>'+ 
   '<details class="chain-bootstrap"><summary>Verifizierten Bootstrap und Chain-Parameter in GitHub main freigeben</summary>'+
   '<p>Die drei öffentlichen Validator-Beweise werden vom Server erneut kryptografisch geprüft. Nur die wirtschaftlichen Werte in Wei sowie das Gaslimit gibst du frei.</p>'+
   '<label>Mindestreserve je Validator (Wei) <input id="approval-minimum" inputmode="numeric" placeholder="Wei" /></label>'+
   '<label>Max. Executor-Erstattung (Wei) <input id="approval-reimbursement" inputmode="numeric" placeholder="Wei" /></label>'+
   '<label>Anfangsreserve je Validator (Wei) <input id="approval-reserve" inputmode="numeric" placeholder="Wei" /></label>'+
   '<label>Initiale Source-Fee (Wei) <input id="approval-fee" inputmode="numeric" placeholder="Wei" /></label>'+
   '<label>Default Destination Gas Limit <input id="approval-gas" inputmode="numeric" placeholder="Ganzer Gas-Wert" /></label>'+
   '<button type="button" id="approve-chain-bootstrap">Bootstrap nach main schreiben</button>'+
   '<small id="approval-status">Erst nach gültiger PoS-/BLS-Verifikation verfügbar. Keine Wallet-Transaktion.</small></details>'+
   '<div class="chain-actions"><button type="button" class="outline" id="deployment-switch-wallet">Wallet auf ausgewählte Chain wechseln</button><button type="button" id="deployment-execute" title="Verifizierten Chain-Contract mit verbundener Wallet deployen">Deploy auf dieser Chain</button><button type="button" class="outline" id="deployment-recover">Transaktion wiederherstellen</button><small id="deployment-execute-reason">Sicherheitsgates werden geprüft</small></div>';
  el("deployment-chain-select").addEventListener("change",e=>{
   selectedDeployChain=e.target.value;
   showSelectedDeployChain(data);loadRouteLifecycle();renderQueue();
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
  el("approve-chain-bootstrap").addEventListener("click",async()=>{
   const output=el("approval-status"),chain=selectedDeployChain;
   const entries=[
    ["minimumWei","approval-minimum"],
    ["maxExecutorReimbursementWei","approval-reimbursement"],
    ["perValidatorWei","approval-reserve"],
    ["sourceFeeWei","approval-fee"]
   ];
   const values=Object.fromEntries(entries.map(([k,v])=>[k,el(v).value.trim()]));
   values.defaultDestinationGasLimit=Number(el("approval-gas").value.trim());
   const all=[...entries.map(([,id])=>el(id).value.trim()),el("approval-gas").value.trim()];
   if(all.some(x=>!/^[1-9][0-9]*$/.test(x))){
    output.textContent="Nur positive ganze Werte zulässig";return;
   }
   const nativeSymbol=workqueue?.inventory?.chains?.find(x=>x.name===chain)?.nativeCurrency?.symbol||"Native";
   const totalReserve=(BigInt(values.perValidatorWei)*3n).toString();
   const statement="Chain: "+chain+" ("+nativeSymbol+")\\n"+
    "Mindestreserve: "+values.minimumWei+" Wei\\n"+
    "Max. Executor-Erstattung: "+values.maxExecutorReimbursementWei+" Wei\\n"+
    "Reserve je Validator: "+values.perValidatorWei+" Wei\\n"+
    "Gesamtreserve für drei Validatoren: "+totalReserve+" Wei ("+
      formatNative(totalReserve,18,8)+" "+nativeSymbol+")\\n"+
    "Source-Fee: "+values.sourceFeeWei+" Wei\\n"+
    "Gaslimit: "+values.defaultDestinationGasLimit+
    "\\n\\nDiese unveränderlichen Constructor-Grundwerte in GitHub main freigeben?";
   if(!window.confirm(statement))
    return;
   const button=el("approve-chain-bootstrap");button.disabled=true;
   output.textContent="Prüfe Validator-Proofs und GitHub main ...";
   try{
    const response=await postJSON("/admin/api/bootstrap/approve",{chain,values});
    output.textContent="Bootstrap freigegeben: "+response.result.commit;
    window.location.reload();
   }catch(e){output.textContent="Freigabe verweigert: "+e.message;button.disabled=false;}
  });
  el("deployment-switch-wallet").addEventListener("click",async()=>{
   try{
    const chain=workqueue?.inventory?.chains?.find(c=>c.name===selectedDeployChain);
    if(!chain)throw Error("Chain not approved in main");
    await switchDeploymentChain(chain);await refreshWalletBalances();
   }catch(e){el("deployment-execute-reason").textContent=e.message;}
  });
  el("deployment-execute").addEventListener("click",async()=>{
   const button=el("deployment-execute"),out=el("deployment-execute-reason");
   button.disabled=true;const chainName=selectedDeployChain;
   try{
    const state=await currentWalletState();
    const chain=workqueue?.inventory?.chains?.find(c=>c.name===chainName);
    if(!state||!chain||state.chainId!==chain.chainId)
     throw Error("Wallet muss mit der gewählten Chain verbunden sein");
    const component=el("deployment-component-select").value;
    out.textContent="Vorprüfung, Build, RPC-Simulation und persistentes Journal ...";
    const prepared=await postJSON("/admin/api/chain-deploy/prepare",
      {chain:chainName,component,wallet:state.address});
    out.textContent="Wallet-Bestätigung ausstehend. Bei Abbruch erst Wiederherstellung nutzen.";
    const txHash=await broadcastDeploymentIntent(prepared);
    out.textContent="Gesendet: "+txHash+" · speichere Hash ...";
    await postJSON("/admin/api/chain-deploy/hash",{id:prepared.id,txHash});
    out.textContent="Hash gesichert. Warte auf finalen Receipt / Verifikation ...";
    const result=await postJSON("/admin/api/chain-deploy/reconcile",{id:prepared.id});
    out.textContent="Deployment: "+result.result.stage+" · "+(result.result.address||txHash);
   }catch(e){out.textContent="Gesperrt / manuell abgleichen: "+e.message+
    ". Keinesfalls erneut deployen, bevor die Wiederherstellung abgeschlossen ist.";}
   finally{button.disabled=false;}
  });
  el("deployment-recover").addEventListener("click",async()=>{
   const out=el("deployment-execute-reason");out.textContent="Lade Journal ...";
   try{
    const all=await get("/admin/api/chain-deploy/status");
    const component=el("deployment-component-select").value;
    const id=selectedDeployChain+":"+component;
    const entry=all.intents.entries[id];
    if(!entry){out.textContent="Kein gespeicherter Vorgang für "+id;return;}
    if(entry.stage==="prepared"){
     const typed=window.prompt("Wallet-Transaktionshash eingeben, falls gesendet. Keine erneute Transaktion auslösen:","");
     if(!typed){out.textContent="Intent bleibt gesperrt; Wallet-Nonce prüfen";return;}
     await postJSON("/admin/api/chain-deploy/hash",{id,txHash:typed});
    }
    const result=await postJSON("/admin/api/chain-deploy/reconcile",{id});
    out.textContent="Wiederherstellung: "+result.result.stage+" · "+(result.result.address||"");
   }catch(e){out.textContent="Abgleich blockiert: "+e.message;}
  });
  showSelectedDeployChain(data);loadRouteLifecycle();
 }catch(e){target.textContent="Deployment-Plan nicht verfügbar: "+e.message;}
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
 const bootstrapOpen=!readiness?.bootstrapReady||!readiness?.manifestMatchesEvidence;
 const isVerifier=next?.component==="blsVerifier";
 const status=el("deployment-execute-reason");
 const action=el("deployment-execute");
 action.disabled=!next||Boolean(workqueue?.readOnly)||(!isVerifier&&bootstrapOpen);
 if(!next)status.textContent="Chain-Infrastruktur vollständig";
 else if(workqueue?.readOnly)status.textContent="GitHub main ist nicht aktuell bestätigt";
 else if(!isVerifier&&bootstrapOpen)status.textContent="Zuerst: verifizierten Bootstrap und Reserve/Fee/Gas freigeben";
 else status.textContent="Die Wallet bestätigt jeden einzelnen Deploy separat";
 const approve=el("approve-chain-bootstrap");
 if(approve)approve.disabled=Boolean(workqueue?.readOnly)||Boolean(readiness?.manifestMatchesEvidence&&readiness?.bootstrapReady);
 const summary=el("chain-live-preflight");
 if(bootstrapOpen&&!isVerifier){
  summary.textContent=readiness?.evidenceVerified?
   readiness.verifiedValidatorCount+" Validatoren verifiziert · Bootstrap-Konfiguration noch freigeben":
   "Bootstrap-Nachweise müssen auf dieser Zielchain noch geprüft werden";
 }else if(next){
  summary.textContent="Nächster Schritt: "+(deployTitle[next.component]||next.title);
 }else summary.textContent="Keine offenen Chain-Contracts";
 const details=document.querySelector("details.chain-bootstrap");
 if(details)details.hidden=Boolean(readiness?.manifestMatchesEvidence&&readiness?.bootstrapReady);
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
