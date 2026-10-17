import {connectDeploymentWallet,currentWalletState,switchDeploymentChain,balanceOnWalletChain,formatNative,walletsAvailable,broadcastDeploymentIntent,getWalletProvider} from "./wallet.js";
import {rotationCalldata,verifyOnChainWallets} from "./service-wallet-rotation.mjs";
import {selector} from "./keccak.mjs";
import {apiJSON} from "./api-client.mjs";
import {awaitDeploymentReceipt} from "./deployment-poll.mjs";
import {awaitVerifiedDeploymentCheckout} from "./deployment-sync-wait.mjs";
import {factoryDeploymentDefaults} from "./factory-defaults.mjs";
import {nextChainDeployment,nextAssetDeployment,chainDeploymentParameters} from "./deployment-batch.mjs";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const el=id=>document.getElementById(id);
async function postJSON(p,data){return apiJSON(fetch,p,{method:"POST",data});}
async function get(p){return apiJSON(fetch,p);}
const labels={"not-deployed":"Nicht deployed",partial:"Teilweise deployed",deployed:"Deployed"};
const pill=(s)=>'<span class="status '+esc(s)+'">'+esc(labels[s]||s)+'</span>';
let workqueue=null;
let assetPage=0;
let assetTasks=[];
let eligibleAssetRoutes=[];
let selectedAssetTask=null;
let assetPreview=null;
const ASSETS_PER_PAGE=12;
function renderAssets(){
 if(!workqueue)return;
 const filter=el("asset-filter").value,q=el("asset-search").value.trim().toLowerCase();
 const eligibleByAsset=new Map();
 for(const route of eligibleAssetRoutes){
  const list=eligibleByAsset.get(route.asset)||new Set();list.add(route.name);eligibleByAsset.set(route.asset,list);
 }
 const selection=Object.values(workqueue.inventory.assets).filter(a=>{
  const allowed=eligibleByAsset.get(a.key);
  if(!allowed)return false;
  const routes=a.routes.filter(r=>allowed.has(r.name));
  const complete=routes.length>0&&routes.every(r=>r.status==="deployed");
  const state=complete?"deployed":routes.some(r=>r.receiptCount>0)?"partial":"not-deployed";
  return (filter==="all"||filter===state)&&
   [a.name,a.symbol,a.key,a.canonicalChain,...routes.map(r=>r.destination)]
    .join(" ").toLowerCase().includes(q);
 });
 el("metrics").innerHTML=[
  ["Assets",eligibleByAsset.size],["Routen",eligibleAssetRoutes.length],
  ["Offen",Object.values(workqueue.inventory.assets).filter(a=>{
   const names=eligibleByAsset.get(a.key);
   return names&&a.routes.some(r=>names.has(r.name)&&r.status!=="deployed");
  }).length]
 ].map(([n,v])=>'<div class="metric"><strong>'+v+'</strong><small>'+n+'</small></div>').join("");
 const pages=Math.max(1,Math.ceil(selection.length/ASSETS_PER_PAGE));
 assetPage=Math.max(0,Math.min(assetPage,pages-1));
 const pageAssets=selection.slice(assetPage*ASSETS_PER_PAGE,(assetPage+1)*ASSETS_PER_PAGE);
 const addressButton=address=>'<button type="button" class="address-copy asset-address" data-copy="'+
  esc(address)+'" title="Vollständige Contract-Adresse kopieren">'+esc(address)+' ⧉</button>';
 el("main-workqueue").innerHTML=selection.length?pageAssets.map(a=>{
  const names=eligibleByAsset.get(a.key),routes=a.routes.filter(r=>names.has(r.name));
  const complete=routes.filter(r=>r.status==="deployed").length;
  const status=routes.length&&complete===routes.length?"deployed":routes.some(r=>r.receiptCount>0)?"partial":"not-deployed";
  const tasks=assetTasks.filter(t=>t.asset===a.key);
  const routers=Object.values(a.representations||{}).flatMap(rep=>
   (rep.deployedContracts||[]).filter(r=>["nativeRouter","syntheticRouter","collateralRouter"].includes(r.component))
    .map(r=>({chain:rep.chain,component:r.component,address:r.address})));
  const completedRouters=routers.map(r=>'<div class="route"><div><strong>Router · '+
   esc(r.chain)+' · '+esc(r.component)+'</strong><small>'+addressButton(r.address)+
   '</small></div>'+pill("deployed")+'</div>').join("");
  const completeGateways=routes.flatMap(r=>(r.instances||[]).filter(instance=>
   instance.status==="deployed"&&instance.gateway&&instance.feeVault).map(instance=>
   '<div class="route"><div><strong>Route · '+esc(r.source)+' → '+esc(r.destination)+
   '</strong><small>Gateway: '+addressButton(instance.gateway)+
   '</small><small>FeeVault: '+addressButton(instance.feeVault)+
   '</small></div>'+pill("deployed")+'</div>')).join("");
  const pending=tasks.map(t=>'<div class="route"><div><strong>'+
   esc(t.kind==="router"?"Token-Router auf "+t.chain+" (einmalig)":t.chain+" · Gateway "+t.id.split(":").slice(1,-1).join(":"))+
   '</strong><small>'+esc(t.blockers.length?"Zuerst: "+t.blockers.join(", "):"Bereit zum Prüfen")+
   '</small></div><button type="button" class="component-pending" data-asset-task="'+esc(t.id)+'"'+
   (t.blockers.length?' disabled title="Voraussetzungen fehlen"':'')+'>Ausstehend →</button></div>').join("");
  return '<section class="asset-card"><div class="asset-head">'+
   '<div class="token-icon">'+esc(a.symbol.substring(0,1))+'</div><div class="asset-intro"><strong>'+esc(a.name)+
   '</strong><p>'+esc(a.symbol)+' · Original: '+esc(a.canonicalChain)+' · '+complete+'/'+routes.length+
   ' verfügbare Routen dokumentiert</p></div>'+pill(status)+
   (tasks.length?'<button type="button" class="component-pending" data-batch-asset="'+esc(a.key)+
    '">Alle Schritte deployen</button>':"")+'</div>'+
   '<div class="routes">'+
   (completedRouters||completeGateways?'<div class="asset-group-title">Dokumentierte Contracts · GitHub-Receipts</div>':"")+
   completedRouters+completeGateways+
   (pending?'<div class="asset-group-title">Noch zu deployen</div>'+pending:"")+
   (!completedRouters&&!completeGateways&&!pending?'<p>Keine offenen oder dokumentierten Routen.</p>':"")+
   '</div></section>';
 }).join(""):'<p>Keine Assets mit verfügbaren Chain-Paaren für diesen Filter.</p>';
 el("main-workqueue").querySelectorAll("[data-asset-task]").forEach(b=>
  b.addEventListener("click",()=>openAssetModal(b.dataset.assetTask)));
 el("main-workqueue").querySelectorAll("[data-batch-asset]").forEach(b=>
  b.addEventListener("click",()=>runDeploymentBatch("asset",b.dataset.batchAsset)));
 el("main-workqueue").querySelectorAll(".asset-address[data-copy]").forEach(button=>
  button.addEventListener("click",async()=>{
   try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent="Kopiert ✓";}
   catch{button.textContent=button.dataset.copy;}
  }));
 const pageNode=el("asset-pagination");
 pageNode.innerHTML='<span>'+esc(selection.length)+' Assets · Seite '+(assetPage+1)+'/'+pages+'</span><button type="button" class="outline" data-page="prev" '+(assetPage===0?"disabled":"")+'>Zurück</button><button type="button" class="outline" data-page="next" '+(assetPage>=pages-1?"disabled":"")+'>Weiter</button>';
 pageNode.querySelectorAll("button[data-page]").forEach(b=>b.addEventListener("click",()=>{
  assetPage+=b.dataset.page==="next"?1:-1;renderAssets();
 }));
}
let currentWallet=null;
let chainObservations=new Map();
let liveBootstrap=new Map();
const coreTitles={
 blsVerifier:"BLS-Verifier",
 validatorRegistry:"ValidatorRegistry V3",
 ism:"Interchain Security Module",
 nativeRouterDeployer:"Native Router Deployer (einmalig)",
 syntheticRouterDeployer:"Synthetic Router Deployer (einmalig)",
 collateralRouterDeployer:"Collateral Router Deployer (einmalig)",
 factory:"Permissionless Token Factory",
 sourceRegistry:"ILN Source Registry",
 executionGateway:"Interchain Fee · Execution Gateway (optional)"
};
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
  const displayCount=c.documented+Number(Boolean(native&&verifier));
  const displayTotal=c.required+Number(native);
  const verifierRow=native&&verifier?
   '<div class="component-row"><span>Nativer BLS-Verifier</span><span class="component-address">'+
   '<button class="address-copy" data-copy="'+esc(verifier)+'" title="'+esc(verifier)+'">'+esc(displayAddress(verifier))+
   ' ⧉</button></span></div>':"";
  const tasks=c.components.map(part=>
   '<div class="component-row"><span>'+esc(coreTitles[part.key]||part.key)+
    (part.optional?' · freiwilliger GmbH-Service':'')+'</span>'+
   (part.status==="documented"&&part.address?
    '<button class="address-copy" data-copy="'+esc(part.address)+'" title="'+esc(part.address)+'">'+
     esc(displayAddress(part.address))+' ⧉</button>'+
    (part.key==="executionGateway"?
     '<button type="button" class="outline" data-rotate-chain="'+esc(c.name)+
     '" data-rotate-contract="'+esc(part.address)+'">Service-Wallet ändern</button>':"") :
    '<button class="component-pending" data-open-chain="'+esc(c.name)+
     '" data-open-component="'+esc(part.key)+'">Nicht deployed →</button>')+'</div>').join("");
  const r=deploymentReadiness.get(c.name),live=liveBootstrap.get(c.name);
  const money=n=>n==null?"":moneyInWei(n,c);
  const liveRows=live?.validatorSetId?
   '<details class="chain-onchain-params"><summary>On-Chain-Parameter</summary>'+
    '<div>Reserve-Minimum: '+esc(money(live.liveMinimumReserveWei))+'</div>'+
    '<div>Executor-Limit: '+esc(money(live.liveMaxExecutorReimbursementWei))+'</div>'+
    Object.entries(live.liveValidatorReservesWei||{}).map(([address,value])=>
     '<div>'+esc(displayAddress(address))+': '+esc(money(value))+'</div>').join("")+
    (live.feeWei?'<div>Live Source-Fee: '+esc(money(live.feeWei))+
       ' · Nonce '+esc(live.feeNonce)+'</div>':'')+
    '</details>':"";
  return '<article class="chain-card"><div class="chain-top"><strong>'+esc(c.name)+'</strong>'+
   '<span class="status">'+displayCount+'/'+displayTotal+' Komponenten</span>'+
   (c.documented<c.required?'<button type="button" class="component-pending" data-batch-chain="'+esc(c.name)+'">Chain fertig deployen</button>':"")+'</div>'+
   '<small>Chain '+c.chainId+' · Domain '+c.domainId+' · '+esc(c.nativeCurrency.symbol)+'</small>'+
   '<div class="chain-components">'+verifierRow+tasks+'</div>'+    liveRows+
   '<div class="chain-actions"><button type="button" class="outline" data-switch="'+esc(c.name)+
   '">Wallet wechseln</button><div class="chain-balance" data-balance="'+esc(c.name)+
   '"></div></div></article>';
 }).join("");
 el("infrastructure-list").querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent="Kopiert ✓";
   setTimeout(()=>{b.textContent=displayAddress(b.dataset.copy)+" ⧉";},1200);
  }catch{b.textContent=b.dataset.copy;}
 }));
 el("infrastructure-list").querySelectorAll("[data-rotate-chain]").forEach(b=>
  b.addEventListener("click",()=>void rotateServiceWallet(b.dataset.rotateChain,b.dataset.rotateContract)));
 el("infrastructure-list").querySelectorAll("[data-open-chain]").forEach(b=>b.addEventListener("click",()=>{
  openContractModal(b.dataset.openChain,b.dataset.openComponent);
 }));
 el("infrastructure-list").querySelectorAll("[data-batch-chain]").forEach(b=>
  b.addEventListener("click",()=>runDeploymentBatch("chain",b.dataset.batchChain)));
 el("infrastructure-list").querySelectorAll("button[data-switch]").forEach(b=>b.addEventListener("click",async()=>{
  try{const chain=chains.find(x=>x.name===b.dataset.switch);
   await switchDeploymentChain(chain);await refreshWalletBalances();}
  catch(e){el("wallet-status").textContent=e.message;}
 }));
 if(currentWallet)refreshWalletBalances();
}
async function rotateServiceWallet(chainName,contract){
 const status=el("wallet-status");
 try{
  const latest=await get("/admin/api/workqueue");
  if(latest.readOnly)throw Error("GitHub-main deployment verification unavailable");
  const verified=latest.infrastructure?.find(c=>c.name===chainName)?.components?.
   find(c=>c.key==="executionGateway"&&c.status==="documented");
  if(!verified||verified.address?.toLowerCase()!==contract.toLowerCase())
   throw Error("Execution Gateway not verified in GitHub main");
  const chain=latest.inventory?.chains?.find(c=>c.name===chainName);
  if(!chain)throw Error("Chain missing from approved catalog");
  let wallet=await currentWalletState();
  if(!wallet)throw Error("Connect independent recovery Admin wallet");
  if(wallet.chainId!==chain.chainId)await switchDeploymentChain(chain);
  wallet=await currentWalletState();
  const provider=getWalletProvider();
  const code=await provider.request({method:"eth_getCode",params:[contract,"latest"]});
  if(!/^0x[0-9a-f]{2,}$/i.test(code||""))
   throw Error("Gateway not deployed at documented contract address");
  const read=async signature=>{
   const result=await provider.request({method:"eth_call",params:[{
    to:contract,data:selector(signature)},"latest"]});
   if(!/^0x[0-9a-f]{64}$/i.test(result||""))
    throw Error("Invalid on-chain role response");
   return "0x"+result.slice(-40);
  };
  const [owner,current,recipient,signer]=await Promise.all([
   read("owner()"),read("serviceWallet()"),
   read("interchainFeeRecipient()"),read("relayerOwner()")]);
  const next=window.prompt("Neue GmbH-Service-Wallet (öffentliche EVM-Adresse):", "");
  if(next===null)return;
  verifyOnChainWallets({admin:wallet.address,recovery:owner,service:current,
   recipient,signer,next:next.trim()});
  if(!window.confirm("Service-Wallet auf "+chainName+" ersetzen?\\n"+
   "Alt: "+current+"\\nNeu: "+next.trim()+"\\n"+
   "Die alte Quote-Signatur wird sofort ungültig."))
   return;
  const tx={from:wallet.address,to:contract,value:"0x0",
   data:rotationCalldata(next.trim())};
  await provider.request({method:"eth_call",params:[tx,"latest"]});
  const gas=await provider.request({method:"eth_estimateGas",params:[tx]});
  const hash=await provider.request({method:"eth_sendTransaction",params:[{...tx,gas}]});
  if(!/^0x[0-9a-f]{64}$/i.test(hash||""))
   throw Error("Wallet returned no valid hash; check chain before repeating");
  status.textContent="Service-Rotation TX "+hash+" gesendet. Bestätigung prüfen.";
  let receipt=null;
  for(let i=0;i<24;i++){
   receipt=await provider.request({method:"eth_getTransactionReceipt",params:[hash]});
   if(receipt)break;
   await new Promise(resolve=>setTimeout(resolve,2500));
  }
  if(!receipt)throw Error("TX "+hash+" noch offen. NICHT erneut senden");
  if(BigInt(receipt.status)!==1n)throw Error("Service-Wallet-Rotation fehlgeschlagen: "+hash);
  const roles=await Promise.all(["serviceWallet()","interchainFeeRecipient()","relayerOwner()"].map(read));
  if(roles.some(value=>value.toLowerCase()!==next.trim().toLowerCase()))
   throw Error("Rotation TX confirmed but on-chain roles differ; verify manually: "+hash);
  status.textContent="Service-Wallet rotiert auf "+chainName+" · "+next.trim()+
   " · Jetzt die Service-Key-Konfiguration aktualisieren.";
 }catch(e){status.textContent="Service-Wallet-Rotation: "+String(e.message||e);}
}
function moneyInWei(wei,chain){
 try{return formatNative(String(wei),chain.nativeCurrency.decimals||18,8)+" "+chain.nativeCurrency.symbol}
 catch{return "—"}
}
function presentModalStatus(message,type=""){const n=el("contract-modal-status");n.textContent=message;n.dataset.type=type;}
function modalValues(component){
 const keys=component==="validatorRegistry"
  ?["minimumWei","maxExecutorReimbursementWei","perValidatorWei"]:
   component==="factory"?["sourceFeeWei"]:
   component==="executionGateway"?["serviceWallet","recoveryAdmin"]:[];
 const result={};
 for(const key of keys){
  const v=el("modal-"+key).value.trim();
  if(key==="serviceWallet"||key==="recoveryAdmin"){
   if(!/^0x[0-9a-f]{40}$/i.test(v)||/^0x0{40}$/i.test(v))
    throw Error("Gültige öffentliche Service-Wallet- und Recovery-Admin-Adresse erforderlich");
   result[key]=v.toLowerCase();
  }else{
   if(!/^[1-9][0-9]*$/.test(v))throw Error("Bitte positiven ganzzahligen Wert eingeben: "+key);
   result[key]=v;
  }
 }
 if(component==="validatorRegistry"&&
  (BigInt(result.minimumWei)<BigInt(result.maxExecutorReimbursementWei)||
    BigInt(result.perValidatorWei)<BigInt(result.minimumWei)))
  throw Error("Mindestreserve muss mindestens der maximalen Executor-Erstattung entsprechen");
 if(component==="executionGateway"&&result.serviceWallet===result.recoveryAdmin)
  throw Error("Recovery-Admin darf NICHT die Service-Wallet sein");
 return result;
}
let lastModalPreview=null;
async function openAssetModal(taskId){
 const task=assetTasks.find(x=>x.id===taskId);
 if(!task)return;
 selectedDeployment=null;selectedAssetTask=task;assetPreview=null;
 el("modal-deploy").hidden=false;el("batch-stop").hidden=true;
 const chain=workqueue.inventory.chains.find(c=>c.name===task.chain);
 el("contract-modal-title").textContent=task.kind==="router"?
  "Token-Router einmalig bereitstellen":
  "Gerichtete Route registrieren";
 el("contract-modal-subtitle").textContent=task.asset+" · "+task.chain+
  " · Chain "+chain.chainId;
 el("modal-parameters").hidden=true;
 el("modal-route-context").hidden=false;
 el("modal-route-context").textContent=task.kind==="router"?
  "Dieser Token-Router gehört zum Asset auf dieser Chain und wird für Rückrouten wiederverwendet.":
  
  "Gateway, FeeVault und lokale Router-Bindung werden atomar ohne Validator-Votum registriert.";
 el("modal-gas-result").textContent="";
 el("modal-deploy").disabled=task.blockers.length>0;
 el("contract-deploy-dialog").showModal();
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
  " · aktuelle Preisschätzung "+moneyInWei(result.preview.simulation.totalWorstCaseWei,chain)+
  " (zusätzliche Rollup-Datengebühren können anfallen; MetaMask zeigt die verbindliche Transaktion)";
 el("modal-deploy").disabled=false;
 presentModalStatus("On-Chain-Vorprüfung erfolgreich. Deployment durch Wallet bestätigen.");
}
async function executeAssetDeployment(){
 const task=selectedAssetTask;
 if(!task)throw Error("Keine Asset-Aufgabe ausgewählt");
 const chain=workqueue.inventory.chains.find(c=>c.name===task.chain);
 let wallet=await currentWalletState();
 if(!wallet)throw Error("Wallet verbinden");
 if(wallet.chainId!==chain.chainId)await switchDeploymentChain(chain);
 wallet=await currentWalletState();
 if(!wallet||wallet.chainId!==chain.chainId)throw Error("Falsche Wallet-Chain");
 el("modal-deploy").disabled=true;
 const prepared=await postJSON("/admin/api/asset-deploy/prepare",{
  taskId:task.id,wallet:wallet.address});
 presentModalStatus("MetaMask-Transaktion bestätigen oder abbrechen.");
 let txHash;
 try{txHash=await broadcastDeploymentIntent(prepared);}
 catch(e){
  if(!walletRejected(e))throw e;
  await postJSON("/admin/api/asset-deploy/cancel-prepared",{id:prepared.id,createdAt:prepared.createdAt});
  el("modal-deploy").disabled=false;
  presentModalStatus("MetaMask abgebrochen. Keine Transaktion gesendet; erneuter Deploy möglich.");
  return;
 }

 await postJSON("/admin/api/asset-deploy/hash",{id:prepared.id,txHash});
 presentModalStatus("Überprüfe Router/Gateway, FeeVault und Block-Receipt …");
 const report=await awaitDeploymentReceipt(
  ()=>postJSON("/admin/api/asset-deploy/reconcile",{id:prepared.id}),{
   onPending:r=>presentModalStatus("Transaktion "+(r.reason==="confirmations"?"wartet auf Finalität":"wartet auf Receipt")+
    " – derselbe Hash, keine weitere Wallet-Signatur.","warn")
  });
 if(report.result.stage==="pending"){
  el("modal-deploy").disabled=false;
  presentModalStatus("Transaktion noch ausstehend. Erneuter Klick startet eine neue MetaMask-Transaktion.","warn");
  return;
 }
 if(report.result.stage!=="documented")throw Error("Deployment-Receipt noch nicht veröffentlicht");
 presentModalStatus("Deployment dokumentiert. Route ist lokal permissionless registriert.","success");
 el("contract-deploy-dialog").close();selectedAssetTask=null;await waitForDeploymentSync(report.result);
}
async function openContractModal(chainName,component){
 const chain=workqueue?.inventory?.chains.find(c=>c.name===chainName);
 const infra=workqueue?.infrastructure?.find(c=>c.name===chainName);
 const part=infra?.components.find(x=>x.key===component);
 if(!chain||!part||part.status==="documented")return;
 selectedAssetTask=null;el("modal-route-context").hidden=true;
 el("modal-deploy").hidden=false;el("batch-stop").hidden=true;
 selectedDeployment={chainName,component};
 const title=coreTitles[component]||component;
 el("contract-modal-title").textContent=title+" · "+chainName;
 el("contract-modal-subtitle").textContent="Chain "+chain.chainId+" · Wallet bestätigt jede Transaktion";
 presentModalStatus("Lade aktuellen Deployment-Status …");
 el("modal-gas-result").textContent="";
 el("modal-deploy").disabled=true;
 el("modal-parameters").hidden=true;
 el("contract-deploy-dialog").showModal();
 try{
  const [response,status]=await Promise.all([
   get("/admin/api/deployment-readiness?chain="+encodeURIComponent(chainName)),
   get("/admin/api/chain-deploy/status")]);
  if(selectedDeployment?.chainName!==chainName||selectedDeployment.component!==component)return;
  const r=response.readiness;
  deploymentReadiness.set(chainName,r);
  renderInfrastructure();
  const requiresValues=component==="validatorRegistry"||
   component==="factory"||component==="executionGateway";
  lastModalPreview=null;
  const fields=component==="validatorRegistry"
   ?["minimumWei","maxExecutorReimbursementWei","perValidatorWei"]:
   component==="factory"?["sourceFeeWei"]:
   component==="executionGateway"?["serviceWallet","recoveryAdmin"]:[];
  el("modal-parameters").hidden=!requiresValues;
   el("modal-bootstrap-evidence").textContent=component==="validatorRegistry"
   ?(r.evidenceVerified?
     r.verifiedValidatorCount+" Genesis-Validatoren gegen Zielchain-BLS-Verifier geprüft":
     "Validator-Bootstrap: "+(r.evidenceError||"Prüfung noch nicht abgeschlossen")):"";
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
    sourceFeeWei:r.values.sourceFeeWei
  };
  const factoryDefaults=component==="factory"?factoryDeploymentDefaults({chainName,chain,readiness:r,proposal}):null;
  for(const key of ["minimumWei","maxExecutorReimbursementWei","perValidatorWei","sourceFeeWei","serviceWallet","recoveryAdmin"]){
   const input=el("modal-"+key);
   input.parentElement.hidden=!fields.includes(key);
   // Main bootstrap economics are the reviewed defaults, not estimates.
    // Users can review/edit the actual transaction inputs before wallet signing.
   const xgrInitial=chainName==="xgrchain"&&component==="validatorRegistry"?{
    minimumWei:"750000000000000000",maxExecutorReimbursementWei:"500000000000000000",
     perValidatorWei:"750000000000000000"}:null;
   input.value=["serviceWallet","recoveryAdmin"].includes(key)?"":component==="factory"?String(factoryDefaults?.[key]??""):
     String(fromGitHub[key]??xgrInitial?.[key]??"");
   const suggestion=fromGitHub[key]??proposal?.values?.[key];
   input.placeholder=["serviceWallet","recoveryAdmin"].includes(key)?"0x… öffentliche EVM-Adresse":
    suggestion==null?"Manuell festlegen":String(suggestion);
   input.title=key==="recoveryAdmin"?
    "Unabhängige Recovery-Admin-Wallet (idealerweise Hardware-Wallet), die die Service-Wallet bei Verlust rotieren darf. Nicht auf Servern speichern.":key==="serviceWallet"?
    "Eine öffentliche GmbH-Adresse für EIP-712-Signaturen, Interchain-Fee-Sammelclaims und Gas-Sponsoring.":component==="factory"?
    "Editierbare Validatorgebühr in der nativen Währung der Quellchain.":
    "Konfigurierter Wert wird vorausgefüllt und vor der Signatur geprüft. Graue Platzhalter sind nur unverbindliche Vorschläge.";
  }
  el("modal-parameter-note").textContent=requiresValues?
   (chainName==="xgrchain"&&component==="validatorRegistry"?
    "Vorausgefüllt: 0,75 XGR Mindestreserve und 0,5 XGR Erstattungslimit. Beide Werte vor Wallet-Signatur änderbar. ":
    component==="executionGateway"?
    "Eine öffentliche GmbH-Service-Wallet für Quote, Interchain Fee und Sponsoring; dazu eine separate Offline-Recovery-Admin-Adresse für Notfallrotation. Je Chain nur ein Contract. Kein Private Key in die Admin-UI. ": 
    component==="factory"?
    (chainName==="xgrchain"?
      "Initiale Source-Fee 0,1 XGR (100000000000000000 Wei) pro ausgehendem Hop; vor Wallet-Signatur änderbar. ":
      "Initiale Source-Fee in der nativen Quellchain-Währung; Ketten-Gaspreis nur als unverbindlicher Vorschlag. ")+
    "Kein Gaslimit-Eingabefeld: Hyperlane-Metadaten sind intern konstant; bei der Zustellung schätzt MetaMask das tatsächliche Zielgas. ":
    "Einmalige Constructor-Werte. Graue Zahlen sind lediglich Hinweise, keine Konfiguration. ")+
   "Nach Deploy zählt ausschließlich der Live-Contract; GitHub speichert nur Adresse und Receipt.":
   "Keine wirtschaftlichen Eingaben nötig. Verifizierte Vorgänger-Contracts werden live geprüft.";

  // Chain contracts are deployed in canonical dependency order. Never offer
  // a signing step while a preceding core module is still missing.
  const stepIndex=infra.components.findIndex(p=>p.key===component);
  const missingPrerequisites=infra.components.slice(0,stepIndex)
    .filter(p=>p.status!=="documented").map(p=>coreTitles[p.key]||p.key);

  if(missingPrerequisites.length){
   el("modal-deploy").disabled=true;
   presentModalStatus("Zuerst deployen und verifizieren: "+missingPrerequisites.join(", "), "warn");
   return;
  }
  // Gas preview works with a clean checked-out main even if GitHub is temporarily unavailable.
  // The server independently validates the LIVE main before wallet preparation.
  if(component==="validatorRegistry"&&!r.evidenceVerified){
   presentModalStatus("Validator-Bootstrap: "+(r.evidenceError||"BLS-Nachweis nicht bestätigt"),"warn");
   return;
  }
  el("modal-deploy").disabled=false;
  presentModalStatus(existing&&existing.stage!=="prepared"
   ?"Bereits gesendete Transaktion erkannt. Deploy setzt sie automatisch fort."
   :"Werte prüfen und mit Wallet deployen. Gebühren zeigt MetaMask.");

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
   " · geschätzter ETH-/Native-Gesamtbedarf inkl. Gas und Einlage "+
   moneyInWei(result.preview.totalWorstCaseWei,chain)+
   (BigInt(result.preview.depositWei||"0")>0n?
    " · darin enthaltene Validator-Einlage: "+moneyInWei(result.preview.depositWei,chain):"")+
   (chainName==="base"?
    " · darin enthaltene Base-L1-Datenfee: "+
     moneyInWei(result.preview.l1DataFeeUpperBoundWei,chain)+
    " · Operatorgebühr: "+moneyInWei(result.preview.operatorFeeWei,chain):"")+
   " · Aktueller Kostensnapshot: vor jeder Signatur in MetaMask prüfen";
  el("modal-deploy").disabled=false;
  presentModalStatus("Gas geprüft. Deployment benötigt Bestätigung in deiner Wallet.");
 }catch(e){el("modal-deploy").disabled=true;presentModalStatus("Gasprüfung blockiert: "+e.message,"error")}
}
async function executeModalDeployment(){
 if(selectedAssetTask){try{await executeAssetDeployment()}catch(e){el("modal-deploy").disabled=false;presentModalStatus("Deployment noch nicht abgeschlossen: "+e.message+". Erneuter Klick startet eine neue Wallet-Transaktion.","error");}return;}
 if(!selectedDeployment)return;
 const {chainName,component}=selectedDeployment;
 const button=el("modal-deploy");button.disabled=true;
 try{
  const chain=workqueue.inventory.chains.find(c=>c.name===chainName);
  const params=modalValues(component);
  let state=await currentWalletState();
  if(!state)throw Error("Wallet verbinden");
  if(state.chainId!==chain.chainId)await switchDeploymentChain(chain);
  state=await currentWalletState();
  if(!state||state.chainId!==chain.chainId)throw Error("MetaMask-Netzwerk stimmt nicht überein");
  presentModalStatus("Prüfe Contract und bereite MetaMask-Transaktion vor …");
  const prepared=await postJSON("/admin/api/chain-deploy/prepare",
   {chain:chainName,component,wallet:state.address,parameters:params});
  presentModalStatus("MetaMask-Transaktion bestätigen oder abbrechen.");
  let txHash;
  try{txHash=await broadcastDeploymentIntent(prepared);}
  catch(e){
   if(!walletRejected(e))throw e;
   await postJSON("/admin/api/chain-deploy/cancel-prepared",{id:prepared.id,createdAt:prepared.createdAt});
   el("modal-deploy").disabled=false;
   presentModalStatus("MetaMask abgebrochen. Keine Transaktion gesendet; erneuter Deploy möglich.");
   return;
  }
 
  presentModalStatus("Transaktion gesendet · Hash wird gesichert …");
  await postJSON("/admin/api/chain-deploy/hash",{id:prepared.id,txHash});
  presentModalStatus("Warte auf Receipt und On-Chain-Verifikation …");
  const result=await awaitDeploymentReceipt(
   ()=>postJSON("/admin/api/chain-deploy/reconcile",{id:prepared.id}),{
    onPending:r=>presentModalStatus("Transaktion "+
      (r.reason==="confirmations"?"wartet auf Bestätigungen":"wartet auf On-Chain-Receipt")+
      " – keine weitere Wallet-Signatur.","warn")
   });
  if(result.result.stage==="pending"){button.disabled=false;presentModalStatus("Wallet-Transaktion noch ausstehend. Erneuter Klick startet eine neue MetaMask-Transaktion.","warn");return;}
  if(result.result.stage!=="documented")throw Error("Receipt noch nicht dokumentiert");
  presentModalStatus("Deployment verifiziert und in GitHub dokumentiert.","success");
  el("contract-deploy-dialog").close();selectedDeployment=null;
  await waitForDeploymentSync(result.result);
 }catch(e){button.disabled=false;presentModalStatus(
  "Deployment noch nicht abgeschlossen: "+e.message+". Erneuter Klick startet eine neue Wallet-Transaktion.","error")}
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
let batchActive=false;
let batchStopRequested=false;
let batchRetry=null;
const walletRejected=e=>e?.code===4001||e?.code==="ACTION_REJECTED"||
 /user (rejected|denied|cancelled)|userrejectedrequest/i.test(String(e?.message||""));
async function runDeploymentBatch(type,target){
 if(batchActive)return;
 batchActive=true;batchStopRequested=false;
 selectedDeployment=null;selectedAssetTask=null;assetPreview=null;
 const dialog=el("contract-deploy-dialog");
 el("contract-modal-title").textContent=type==="chain"?"Chain-Infrastruktur deployen":"Token & Routen deployen";
 el("contract-modal-subtitle").textContent=target+" · fehlende Schritte nacheinander · jede Transaktion durch MetaMask";
 el("modal-parameters").hidden=true;
 el("modal-route-context").hidden=true;
 el("modal-gas-result").textContent="";
 el("modal-deploy").hidden=true;
 el("batch-stop").hidden=false;
 if(!dialog.open)dialog.showModal();
 let stepCount=0;
 try{
  let wallet=await currentWalletState();
  if(!wallet)wallet=await connectDeploymentWallet({onChange:refreshWalletBalances});
  if(!wallet)throw Error("Wallet konnte nicht verbunden werden");
  const owner=wallet.address.toLowerCase();
  for(;stepCount<128;stepCount++){
   if(batchStopRequested){
    presentModalStatus("Deployment pausiert. Bereits bestätigte Contracts bleiben dokumentiert.","warn");
    break;
   }
   await loadMainWorkqueue();
   if(!workqueue||workqueue.readOnly)
    throw Error("GitHub-main-Sync noch nicht abgeschlossen. Nach der Synchronisierung denselben Deploy-Button erneut klicken.");
   const next=type==="chain"?
    nextChainDeployment(workqueue,target):
    nextAssetDeployment(workqueue,assetTasks,target);
   if(!next){
    presentModalStatus("Fertig: Alle geplanten "+(type==="chain"?"Chain-Komponenten":"Token-Router und Routen")+" sind dokumentiert.","success");
    break;
   }
   if(next.kind==="blocked")
    throw Error("Nächster Schritt "+next.id+" benötigt: "+next.blockers.join(", "));
   const chain=workqueue.inventory.chains.find(c=>c.name===next.chain);
   if(!chain)throw Error("Nicht freigegebene Zielchain: "+next.chain);
   presentModalStatus("Schritt "+(stepCount+1)+" · "+next.id+" · Netzwerkwechsel zu "+chain.name+" …");
   wallet=await currentWalletState();
   if(!wallet||wallet.address.toLowerCase()!==owner)
    throw Error("Die verbundene Deploy-Wallet wurde gewechselt");
   if(wallet.chainId!==chain.chainId)await switchDeploymentChain(chain);
   wallet=await currentWalletState();
   if(!wallet||wallet.chainId!==chain.chainId||wallet.address.toLowerCase()!==owner)
    throw Error("MetaMask-Netzwerk bzw. Deploy-Wallet stimmt nicht überein");
   const core=type==="chain";
   let params={};
   if(core&&(next.component==="validatorRegistry"||next.component==="factory")){
    const evidence=await get("/admin/api/deployment-readiness?chain="+encodeURIComponent(chain.name));
    params=chainDeploymentParameters(next.component,evidence.readiness);
   }
   let prepared=null,txHash=null;
   try{
    presentModalStatus("Schritt "+(stepCount+1)+" · "+next.id+" · Vertragsdaten und Gas geprüft; MetaMask-Bestätigung …");
    prepared=core?
     await postJSON("/admin/api/chain-deploy/prepare",{
      chain:chain.name,component:next.component,wallet:wallet.address,parameters:params
     }):await postJSON("/admin/api/asset-deploy/prepare",{
      taskId:next.id,wallet:wallet.address
     });
    // EIP-1193 supplies an explicit independent approval for EACH transaction.
    txHash=await broadcastDeploymentIntent(prepared);
    presentModalStatus("Schritt "+(stepCount+1)+" · "+next.id+" · TX "+txHash.slice(0,14)+"… verifizieren …");
    const prefix=core?"/admin/api/chain-deploy":"/admin/api/asset-deploy";
    await postJSON(prefix+"/hash",{id:prepared.id,txHash});
    const outcome=await awaitDeploymentReceipt(
     ()=>postJSON(prefix+"/reconcile",{id:prepared.id}),{
      onPending:()=>presentModalStatus("Schritt "+(stepCount+1)+" · "+next.id+" · Bestätigungen/Receipt ausstehend …")
     });
    if(outcome.result?.stage!=="documented")
     throw Error("Transaktion "+txHash+" gesendet, aber Receipt noch nicht dokumentiert");
    presentModalStatus("Schritt "+(stepCount+1)+" abgeschlossen · GitHub-Receipt dokumentiert. Nächsten Schritt vorbereiten …","success");
    await waitForDeploymentSync(outcome.result);
   }catch(e){
    if(prepared&&!txHash&&walletRejected(e)){
     try{
      await postJSON((core?"/admin/api/chain-deploy":"/admin/api/asset-deploy")+
       "/cancel-prepared",{id:prepared.id,createdAt:prepared.createdAt});
      throw Error("MetaMask abgebrochen – keine Transaktion gesendet. Erneuter Deploy jederzeit möglich.");
     }catch(cancelError){
      if(String(cancelError.message||"").includes("MetaMask abgebrochen"))throw cancelError;
      throw Error("MetaMask abgebrochen; Entwurf wird beim nächsten Deploy nach Nonce-Prüfung freigegeben: "+cancelError.message);
     }
    }
    if(txHash)throw Error("TX "+txHash+" ist noch nicht in GitHub dokumentiert. Ein erneuter Deploy-Klick startet eine neue MetaMask-Transaktion: "+e.message);
    throw e;
   }
  }
  if(stepCount>=128)throw Error("Schrittlime 128 erreicht; bitte neu starten, damit der Live-Stand geprüft wird");
 }catch(e){
  presentModalStatus("Batch pausiert bei Schritt "+(stepCount+1)+": "+e.message,"error");
 }finally{
  batchActive=false;el("batch-stop").hidden=true;
  await loadMainWorkqueue();
  el("modal-deploy").hidden=false;el("modal-deploy").disabled=false;
  el("modal-deploy").textContent="Erneut mit Wallet deployen";batchRetry={type,target};
 }
}
async function waitForDeploymentSync(result){
 const commit=result?.commit||null;
 el("main-status").textContent="GitHub-Receipt und lokalen Checkout automatisch synchronisieren …";
 const status=await awaitVerifiedDeploymentCheckout({
  expectedCommit:commit,
  readQueue:()=>get("/admin/api/workqueue"),
  readSyncStatus:()=>get("/admin/api/deployment-sync/status"),
  paused:()=>batchActive&&batchStopRequested,
  onWaiting:({diagnostic,message})=>{
   el("main-status").textContent="Checkout-Sync läuft · "+String(diagnostic?.error||message||"GitHub-Receipt übernehmen").slice(0,180);
  }
 });
 if(status.status==="paused")return;
 await loadMainWorkqueue();
}
async function loadMainWorkqueue(){
 el("main-status").textContent="Aktuellen GitHub main prüfen …";
 try{
  const data=await get("/admin/api/workqueue");
  workqueue=data;
  el("main-status").textContent=data.readOnly ? ("Nur Leseansicht · lokaler main "+data.commit.slice(0,12)+" · "+(data.warning||"Deployment gesperrt")) : ("GitHub main verifiziert · "+data.commit.slice(0,12)+" · Nur bestätigte On-Chain-Belege zählen als Deployment");
  deploymentReadiness.clear();
  try{const tasks=await get("/admin/api/route-lifecycle");assetTasks=tasks.tasks||[];eligibleAssetRoutes=tasks.eligibleRoutes||[];}
  catch{assetTasks=[];eligibleAssetRoutes=[];}
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
el("modal-close").addEventListener("click",()=>{if(batchActive)batchStopRequested=true;el("contract-deploy-dialog").close();});
el("contract-deploy-dialog").addEventListener("cancel",()=>{if(batchActive)batchStopRequested=true;});
el("contract-deploy-dialog").addEventListener("close",()=>{if(batchActive)batchStopRequested=true;selectedDeployment=null;selectedAssetTask=null;assetPreview=null;batchRetry=null;});


el("batch-stop").addEventListener("click",()=>{batchStopRequested=true;presentModalStatus("Pausiert nach der aktuellen Wallet-Transaktion …","warn");});
el("modal-deploy").addEventListener("click",()=>{
 if(batchRetry){const next=batchRetry;batchRetry=null;el("contract-deploy-dialog").close();void runDeploymentBatch(next.type,next.target);return;}
 void executeModalDeployment();
});
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
