import {sponsorRouteReady} from "./sponsor-route-readiness.js";
import {publicDirectoryCatalog,isDeployedAsset,isPublicAsset,listingStatus} from "./listing-visibility.js";
import {deployedRoutes,executableTransferRoutes} from "./route-availability.js";
import {draft,validateStep,joinMarkup,joinPendingMarkup,joinConfirmationMarkup} from "./join.js";
import {buildLeaderboardRows,rankAssets,formatUsd,verifiedMetrics} from "./leaderboard-data.js";
import {mountUniverse3D} from "./universe-3d.js";
import {buildExperienceModel,renderDashboard,renderUniverse,renderPlanRoute,renderFAQ,renderTokenBridge,renderRepresentationInventory} from "./experience.js";
import {loadXetaOverview,loadXetaAsset,loadXetaTransfers,loadMarketPrice,aggregate,displayPrice,displayUnix} from "./ui-data.js";
import {connectWallet,authorizedWalletAccount,shorten,formatUnits} from "./wallet-core.js";
import {metaMaskTokenSpec,injectedMetaMask,requestMetaMaskToken,metaMaskFailure} from "./metamask-token.js";
import {readNativeGasBalances} from "./wallet-gas.js";
import {findWalletSourceTx,configuredGatewayRoutes} from "./wallet-transfers.js";
import {selectedRecovery,openWalletTransfers,blocksUnverifiedSourceRepeat} from "./wallet-transfer-selection.js";
import {renderMyTransfers,validWalletAddress} from "./transfer-page.js";
import {startTransfer,startVerifiedOnwardHop,resumeDelivery,waitForWalletReceipt,amountToUnits} from "./transfer-actions.js";
import {readWalletTokenBalances} from "./wallet-token-balances.js";
import {pendingDeliveryCount} from "./wallet-pending.js";
import {rememberSourceTxHint} from "./source-tx-hints.js";
import {renderTransferFlow} from "./transfer-status-flow.js";
import {downstreamGasProjection,formatWeiFee} from "./fee-gas-projection.js";
import {transferFlowBinding} from "./transfer-flow-binding.js";
import {nextVerifiedWalletStep,walletStepKey} from "./automatic-transfer-step.js";
import {linkIndexedJourneys,mergeWalletObservation} from "./verified-journey.js";
import {canonicalWalletSnapshot} from "./wallet-index-projection.js";
const el=document.querySelector("#app"),connect=document.querySelector("#connect");
const state={catalog:null,assetId:"XGR",account:null,quote:null,quoteKey:null,transfer:null,walletChainId:null,walletGas:null,walletBalances:null,walletTokenBalances:null,walletGasCheckedAt:null,walletGasLoading:false,busy:false,indexed:null,assetStats:{},transfers:{},prices:{},apiState:"not-deployed",experience:{system:"xgrchain",origin:"xgrchain",destination:"base",asset:"XGR",tvlPeriod:"24h"},leaderboard:null,visibility:null,leaderboardSort:"lockedUsd",leaderboardDir:"desc",leaderboardSearch:"",universeSort:"lockedUsd",universeQuery:""};
const names={xgrchain:"XGRChain",base:"Base",polygon:"Polygon",arbitrum:"Arbitrum"};
const sponsorship={enabled:false,available:false,walletAware:false,chains:{},status:"unknown",checkedAt:0,loading:false};
const sponsorTransfer={key:"",status:"unavailable",grants:[],checkedAt:0,loading:false};
async function refreshSponsorship(){
 if(sponsorship.loading||Date.now()-sponsorship.checkedAt<30000)return;
 sponsorship.loading=true;sponsorship.checkedAt=Date.now();
 try{
  const response=await fetch("/api/xita/v1/managed/health",{
   cache:"no-store",credentials:"omit",headers:{accept:"application/json"}
  });
  if(!response.ok)throw Error("Sponsor status endpoint unavailable");
  const data=await response.json();
  if(data?.ok!==true||!data.sponsorship)
   throw Error("No verified sponsor status");
  sponsorship.enabled=data.sponsorship.enabled===true;
  sponsorship.available=data.sponsorship.available===true;
  sponsorship.walletAware=data.sponsorship.walletAware===true;
  sponsorship.chains=data.sponsorship.chains&&typeof data.sponsorship.chains==="object"?
   data.sponsorship.chains:{};
  sponsorship.status=sponsorship.available?"available":"unavailable";
 }catch{
  sponsorship.enabled=false;sponsorship.available=false;sponsorship.walletAware=false;sponsorship.chains={};sponsorship.status="unknown";
 }finally{
  sponsorship.loading=false;
  if(path()==="/transfer"&&state.catalog)render();
 }
}

let previewRevision=0,previewTimer=null;
const feePreviewCache=new Map(); // UI only renders backend quotes; browser never contacts CoinGecko.
const feePreviewPending=new Map(); // Deduplicate concurrent re-renders of one quote.
function sourceFeeCoin(chain){return {xgrchain:"XGR",base:"ETH",arbitrum:"ETH",polygon:"POL"}[chain]||chain;}

function updatePreviewState(status,details=""){
 const element=document.getElementById("ux-fee-preview-status");
 const output=document.getElementById("ux-fee-preview-details");
 if(!element||!output)return;
 element.textContent=status;
 output.textContent=details;output.hidden=!details;
}
async function refreshFeePreview(){
 const marker=++previewRevision;
 const asset=state.experience.asset,source=state.experience.origin,
  destination=state.experience.destination,amount=state.experience.amount||"";
 if(path()!=="/transfer"||!state.catalog)return;
 const catalog=state.catalog;
 if(sponsorship.walletAware&&!state.account){
  updatePreviewState("Connect your wallet to calculate the personalized Service Fee.");
  return;
 }
 const first=source!=="xgrchain"&&destination!=="xgrchain"?"xgrchain":destination;
 const routes=deployedRoutes(catalog);
 if(!routes.some(r=>r.asset===asset&&r.source===source&&r.destination===first)||
  (first!==destination&&!routes.some(r=>r.asset===asset&&r.source==="xgrchain"&&r.destination===destination))){
  updatePreviewState("This route is not fully deployed.");return;
 }
 let raw;
 try{raw=amountToUnits(amount,catalog.assets[asset].metadata.decimals).toString();}
 catch{updatePreviewState("Enter a positive token amount to estimate costs.");return;}
 const wallet=state.account?.toLowerCase()||"";
 const cacheKey=[asset,source,destination,raw,wallet].join(":");
 const cached=feePreviewCache.get(cacheKey);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),13000);
 updatePreviewState("Calculating verified protocol and Interchain Fee costs…");
 try{
  let value;
  if(cached&&Date.now()-cached.at<120000){
   value=cached.value;
  }else{
   let pending=feePreviewPending.get(cacheKey);
   if(!pending){
    pending=(async()=>{
     const res=await fetch("/api/xita/v1/managed/preview",{method:"POST",cache:"no-store",
      credentials:"omit",headers:{"content-type":"application/json"},
      signal:controller.signal,body:JSON.stringify({asset,source,destination,amountRaw:raw,
       ...(wallet?{payer:wallet,recipient:wallet}:{})})});
     const type=res.headers?.get?.("content-type")||"";
     if(!/application\/(?:[a-z0-9.-]+\+)?json\b/i.test(type))
      throw Error("Cost preview endpoint unavailable (HTTP "+res.status+")");
     let fetched;
     try{fetched=await res.json()}
     catch{throw Error("Invalid cost preview response (HTTP "+res.status+")")}
     if(!res.ok||fetched?.status!=="UNSIGNED_FEE_PREVIEW")
      throw Error(fetched?.error||"Quote service unavailable (HTTP "+res.status+")");
     return fetched;
    })();
    feePreviewPending.set(cacheKey,pending);
    void pending.finally(()=>{if(feePreviewPending.get(cacheKey)===pending)feePreviewPending.delete(cacheKey)}).catch(()=>{});
   }
   value=await pending;
   feePreviewCache.set(cacheKey,{at:Date.now(),value});
   if(feePreviewCache.size>40)feePreviewCache.delete(feePreviewCache.keys().next().value);
  }
  if(marker!==previewRevision||path()!=="/transfer")return;
  const coin=sourceFeeCoin(source),fee=BigInt(value.interchainFeeWei),
   validator=BigInt(value.validatorFeeWei),
   principal=BigInt(value.sourceTokenPrincipalWei||0),
   bridge=BigInt(value.sourceBridgeNativeWei);
  const onward=BigInt(value.pricing?.onwardProtocolFeeWei||0);
  if(bridge<principal+validator||fee<0n||
   (fee===0n&&value.directGatewayEligible!==true))throw Error("Inconsistent protocol quote");
  const native=bridge-principal;
  const total=native+fee;
  if(String(value.estimatedRouteFeeWei)!==total.toString()||
   !/^(0|[1-9][0-9]*)[.][0-9]{8}$/.test(String(value.estimatedRouteFeeUsd||"")))
   throw Error("Inconsistent USD fee preview");
  const detail=document.getElementById("ux-fee-preview-details");
  updatePreviewState("", "");
  if(detail){
   const rows=downstreamGasProjection(value.pricing?.journeyCostStages||[],sponsorship);
   const make=(tag,cls,label)=>{
    const node=document.createElement(tag);if(cls)node.className=cls;
    if(label!==undefined)node.textContent=label;return node;
   };
   const allocation=value.pricing?.walletAware===true?
    value.pricing?.sponsorAllocation:null;
   const rrows=rows.map(r=>{
    const stages=Array.isArray(allocation)?allocation.filter(x=>x.chain===r.chain):null;
    const paid=stages?.reduce((sum,x)=>sum+BigInt(x.walletCoveredWei),0n);
    const sponsored=stages?.reduce((sum,x)=>sum+BigInt(x.shortfallWei),0n);
    return {...r,coin:sourceFeeCoin(r.chain),label:names[r.chain]||r.chain,
     ...(stages?{conditionalNetWei:paid,potentialSponsorWei:sponsored,
       eligible:sponsored>0n}:{})};
   });
   detail.hidden=false;
   const section=make("div","ux-fee-summary");
   const initial=make("div","ux-fee-summary-part");
   initial.append(make("span","ux-fee-summary-label","Initial Service Fees"),
    make("strong","ux-fee-summary-value",formatWeiFee(total)+" "+coin),
    make("small","ux-fee-summary-hint","Protocol + XITA Service Fee · ~ $"+value.estimatedRouteFeeUsd+" USD"));
   const gas=make("div","ux-fee-summary-part");
   gas.append(make("span","ux-fee-summary-label",allocation?
    "Wallet-paid downstream gas & protocol costs":"Transfer Gas Fees"));
   if(rrows.length){
    for(const r of rrows){
     const line=make("div","ux-fee-summary-gas-line");
     line.append(make("span","",r.label),
      make("strong","",formatWeiFee(r.conditionalNetWei)+" "+r.coin));
     gas.append(line);
    }
    gas.append(make("small","ux-fee-summary-hint",
     sponsorship.enabled?(allocation?"Wallet-paid native gas · quote-time estimate":"After potential XITA sponsorship · estimates"):"Estimated additional downstream network gas"));
   }else gas.append(make("strong","ux-fee-summary-value","Unavailable"));
   section.append(initial,gas);
   const breakdown=make("details","ux-fee-details");
   breakdown.append(make("summary","","View fee breakdown"));
   const content=make("div","ux-fee-details-content");
   const detailRow=(label,amount,type)=>{
    const line=make("div","ux-fee-detail-row"+(type?" ux-fee-"+type:""));
    line.append(make("span","",label),make("strong","",amount));return line;
   };
   content.append(make("p","ux-fee-details-caption","Initial payment · "+coin),
    detailRow("Protocol fee",formatWeiFee(native)+" "+coin,"cost"),
    detailRow("XITA Service Fee",formatWeiFee(fee)+" "+coin,"cost"));
   if(rrows.length){
    content.append(make("p","ux-fee-details-caption","Additional gas · 30% safety buffer"));
    for(const r of rrows){
     content.append(detailRow("Network gas · "+r.label,
      "+ "+formatWeiFee(r.rawWei)+" "+r.coin,"cost"));
     content.append(detailRow("Gas buffer · "+r.label,
      "+ "+formatWeiFee(r.gasWithBufferWei-r.rawWei)+" "+r.coin,"cost"));
     if(r.eligible)
      content.append(detailRow("Potential XITA sponsorship · "+r.label,
       "− "+formatWeiFee(r.potentialSponsorWei)+" "+r.coin,"credit"));
     else if(allocation)
      content.append(make("p","ux-fee-details-note",
       "No sponsorship required on "+r.label+" · existing wallet gas covers this stage."));
     else if(sponsorship.enabled)
      content.append(make("p","ux-fee-details-note","Sponsorship on "+r.label+" is unavailable; the wallet may need to fund gas."));
    }
   }
   if(value.pricing?.uiServiceFeeWei!=null){
    content.append(detailRow("XITA UI availability fee",
     formatWeiFee(value.pricing.uiServiceFeeWei)+" "+coin,"cost"));
    if(BigInt(value.pricing.sponsoredServiceFeeWei||"0")>0n)
     content.append(detailRow("Optional gas sponsorship service",
      formatWeiFee(value.pricing.sponsoredServiceFeeWei)+" "+coin,"cost"));
   }
   content.append(make("p","ux-fee-details-note",allocation?
    "Wallet-specific quote estimate: XITA charges a fixed 1,000 gwei native-coin UI availability fee (0.000001 source coin). Optional sponsorship is separately calculated from the committed gas shortfall with the agreed pricing margin. Existing wallet gas and source wallet transaction gas are paid separately.":
    "Initial payment excludes wallet gas. Sponsorship is conditional on eligibility, wallet shortfall and reserves, verified after the initial fee transaction. Source gas and ERC-20 approvals are not included."));
   if(onward>0n)content.append(make("p","ux-fee-details-note",allocation?
    "The XGR onward protocol fee is split between existing wallet gas funds and the quote-locked sponsor shortfall. Only the sponsor-funded portion is included in the XITA Service Fee.":
    "XGR onward protocol processing is already priced into the XITA Service Fee."));
   breakdown.append(content);
   detail.replaceChildren(section,breakdown);
  }
 }catch(error){
  if(marker===previewRevision&&path()==="/transfer")
   updatePreviewState("Fee estimate unavailable: "+String(error.message||error).slice(0,150)+". No transfer was initiated.");
 }finally{clearTimeout(timer);}
}
function scheduleFeePreview(){
 ++previewRevision;
 if(previewTimer!==null)clearTimeout(previewTimer);
 if(path()!=="/transfer")return;
 previewTimer=setTimeout(()=>{previewTimer=null;void refreshFeePreview();},450);
}
let transferRequest=0;
const flowView={open:false,journey:null,stage:"",sourceTxHash:null,account:null};
// One attempt per verified step and wallet session. Wallet rejection is not retried automatically.
const attemptedWalletSteps=new Set();
let automaticWalletQueued=false;
function scheduleAutomaticWalletStep(){
 if(automaticWalletQueued||!flowView.open||transferActivity.working||transferActivity.scanning)return;
 const binding=currentFlowBinding();
 const step=nextVerifiedWalletStep(binding?.record);
 const key=walletStepKey(binding,step);
 if(!key||attemptedWalletSteps.has(key))return;
 automaticWalletQueued=true;
 queueMicrotask(()=>{
  automaticWalletQueued=false;
  const current=currentFlowBinding(),next=nextVerifiedWalletStep(current?.record);
  if(!flowView.open||transferActivity.working||transferActivity.scanning||
     !current||walletStepKey(current,next)!==key||attemptedWalletSteps.has(key))return;
  attemptedWalletSteps.add(key);
  void performTransferAction();
 });
}
const transferActivity={items:[],scanned:false,scanning:false,working:false,selectedTxHash:null,indexCoverage:null,indexOpenCount:0,report:null,notice:"",error:""};
// Explicit resume-link fallback only: never scan arbitrary historical chains
// or accept an unverified indexer claim as canonical wallet ownership.
const resumeProbed=new Map;
function refreshTransferLink(){
 const connected=validWalletAddress(state.account);
 const link=document.querySelector("#my-transfers-link");
 if(link)link.hidden=!connected;
 const alert=document.querySelector("#wallet-pending-alert");
 if(!alert)return;
 // Opening the badge must lead to the wallet's verified worklist, never
 // an accidental "new transfer" source action.
 alert.href="/my-transfers";
 const pending=connected?pendingDeliveryCount({account:state.account,
  items:transferActivity.items,indexedOpenCount:transferActivity.indexOpenCount}):0;
 alert.hidden=pending===0;
 if(pending){
  const open=transferActivity.items.filter(t=>t.account?.toLowerCase()===
   state.account?.toLowerCase()&&t.status==="awaiting-proof"&&
   t.confirmed===true&&t.delivered===false);
  const specific=pending===1&&open.length===1?
   (open[0].sourceChain==="xgrchain"?"1 mint pending →":
    open[0].destinationChain==="xgrchain"?"1 unlock pending →":
    "1 transfer awaiting delivery →"):null;
  alert.textContent=specific||
   (pending===1?"1 transfer awaiting completion →":pending+" transfers awaiting completion →");
  alert.title="Open verified XITA steps. Never repeat an already confirmed source lock/burn";
 }
}
function setConnectedAccount(next){
 const account=validWalletAddress(next)?next:null;
 const changed=state.account?.toLowerCase()!==account?.toLowerCase();
 state.account=account;
 connect.textContent=account?shorten(account):"Connect Wallet";
 if(changed){
  transferRequest++;
  Object.assign(transferActivity,{items:[],scanned:false,scanning:false,working:false,selectedTxHash:null,indexCoverage:null,indexOpenCount:0,report:null,notice:"",error:""});
  resumeProbed.clear();
  attemptedWalletSteps.clear();
   flowView.open=false;flowView.journey=null;flowView.sourceTxHash=null;flowView.account=null;flowView.stage="";
    document.getElementById("xita-flow-dialog")?.close();
 }
 refreshTransferLink();
 if(!account&&path()==="/my-transfers")history.replaceState(null,"","/");
 if(state.catalog&&(changed||path()==="/my-transfers"))render();
 if(changed&&account&&state.catalog)void scanWalletHistory();
}
function upsertTransfer(record){
 if(!record||record.account?.toLowerCase()!==state.account?.toLowerCase())return;
 const previous=transferActivity.items.find(t=>t.sourceChain===record.sourceChain&&
  t.txHash?.toLowerCase()===record.txHash?.toLowerCase());
 // Canonical-source evidence is monotonic across a delayed SQL index, direct
 // finality lookups, multiple RPC providers and background refreshes.
 // A conflicting immutable identity never authorizes new wallet activity.
 const observed=mergeWalletObservation(previous,record);
 const current=[observed,...transferActivity.items.filter(t=>
  !(t.sourceChain===record.sourceChain&&
    t.txHash?.toLowerCase()===record.txHash?.toLowerCase()))];
 // One journey, not two pending operations. Link only independently verified
 // child Gateway+Dispatch provenance to the original parentMessageId.
 transferActivity.items=linkIndexedJourneys(current,current);
 if(observed.confirmed===true&&/^0x[0-9a-f]{64}$/i.test(observed.txHash||"")&&
    state.catalog?.chains?.[observed.sourceChain])
  rememberSourceTxHint({account:state.account,sourceChain:observed.sourceChain,txHash:observed.txHash});
 refreshTransferLink();
 updateFlowModal();
}
// Non-blocking, untrusted staging hint after MetaMask broadcasts. No UI
// action, funds, recovery, or transfer history depends on this POST succeeding.
// The index worker verifies every submitted hash against canonical RPC.
function announceWalletSourceTx(sourceChain,txHash,account=state.account){
 if(!validWalletAddress(account)||!state.catalog?.chains?.[sourceChain]||
   !/^0x[0-9a-f]{64}$/i.test(txHash||""))return;
 rememberSourceTxHint({account,sourceChain,txHash});
 void fetch("/api/xeta/v1/transfers/announce",{
  method:"POST",credentials:"omit",cache:"no-store",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({sourceChain,txHash,account})
 }).catch(()=>null);
}
// The operator indexer owns historical discovery. A 4,096-block RPC walk
// never runs implicitly on wallet connection and never blocks a new transfer.
async function scanWalletHistory(){
 const account=state.account;
 if(!account||!state.catalog||transferActivity.scanning)return;
 const marker=++transferRequest;
 transferActivity.scanning=true;
 transferActivity.scanned=true;
 transferActivity.indexCoverage=null;transferActivity.indexOpenCount=0;
 if(path()==="/my-transfers")render();
 // PostgreSQL history queries may need the configured 8-second statement budget.
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch("/api/xeta/v1/transfers/wallet?"+
   // Include delivered history too: the wallet API separately reports
   // openCount for the header badge. A completed test transfer must not
   // vanish from My Transfers just because its proof finally succeeded.
   new URLSearchParams({account}),{cache:"no-store",credentials:"omit",
   headers:{accept:"application/json"},signal:controller.signal});
  if(!response.ok)throw Error("Indexer temporarily unavailable");
  const data=await response.json();
  if(marker!==transferRequest||state.account?.toLowerCase()!==account.toLowerCase())return;
  if(data?.kind!=="xita-wallet-transfer-index-v1"||
    data.wallet?.toLowerCase()!==account.toLowerCase()||
    !["complete","partial"].includes(data.status)||!Array.isArray(data.items))
   throw Error("Invalid indexer wallet response");
  // Canonical SQL wallet projection REPLACES the previous browser read model.
  // Only the exact transaction being broadcast in this wallet session may
  // remain provisional until the index catches up. No Explorer/hint history.
  transferActivity.items=canonicalWalletSnapshot({
   account,rows:data.items,previous:transferActivity.items,
   activeSourceHash:flowView.account?.toLowerCase()===account.toLowerCase()&&
     flowView.open?flowView.sourceTxHash:null
  });
  transferActivity.indexOpenCount=Number.isSafeInteger(data.openCount)?
   Math.max(0,data.openCount):0;
  transferActivity.indexCoverage=data.coverage||null;
  const complete=data.status==="complete"&&data.coverage?.complete===true&&data.truncated!==true;
  transferActivity.report={source:"indexer",lookback:null,
   scannedRoutes:data.coverage?.requiredRoutes||0,limited:data.truncated===true};
  transferActivity.notice=complete?
   "Wallet index synchronized. Source confirmations are checked separately.":
   "Finalized wallet index incomplete ("+(data.coverage?.indexedRoutes||0)+"/"+
     (data.coverage?.requiredRoutes||0)+" routes). Prior source locks remain on-chain. "+
     "XITA will refresh wallet history automatically. Never resend the source transfer.";
  refreshTransferLink();
  updateFlowModal();
 }catch(error){
  if(marker!==transferRequest||state.account?.toLowerCase()!==account.toLowerCase())return;
  // Never interpret an unavailable indexer or schema migration as empty history.
  // Manual source-TX verification still works without PostgreSQL.
  transferActivity.report=null;
  transferActivity.indexCoverage=null;
  transferActivity.notice="Wallet history index unavailable or timed out. "+
   "Previously sent transfers remain on-chain. XITA will retry automatically "+
   "while the wallet is connected. The indexer may need repair; never rebroadcast "+
   "the original source transfer.";
  transferActivity.error="";
 }finally{
  clearTimeout(timeout);
  if(marker===transferRequest&&state.account?.toLowerCase()===account.toLowerCase()){
   transferActivity.scanning=false;refreshTransferLink();
   if(path()==="/my-transfers"||path()==="/transfer")render();
   updateFlowModal();
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
  announceWalletSourceTx(sourceChain,txHash,account);
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
   updateFlowModal();
  }
 }
}
function setFlowStage(stage,notice){
 flowView.stage=stage;
 if(notice)transferActivity.notice=notice;
 updateFlowModal();
}
function currentFlowBinding(){
 return transferFlowBinding({account:state.account,selectedTxHash:transferActivity.selectedTxHash,
  items:transferActivity.items,session:flowView});
}
function resetFlowView(){
 flowView.open=false;flowView.journey=null;flowView.sourceTxHash=null;
 flowView.account=null;flowView.stage="";
 document.getElementById("xita-flow-dialog")?.close();
}
async function refreshTransferSponsorship(binding){
 const record=binding?.record;
 if(!record?.confirmed||!record.messageId||!sponsorship.enabled)return;
 const key=record.sourceChain+":"+record.messageId.toLowerCase()+":"+binding.account.toLowerCase();
 if(sponsorTransfer.loading||(sponsorTransfer.key===key&&Date.now()-sponsorTransfer.checkedAt<15000))return;
 sponsorTransfer.loading=true;sponsorTransfer.key=key;sponsorTransfer.checkedAt=Date.now();
 try{
  const query=new URLSearchParams({source:record.sourceChain,messageId:record.messageId,account:binding.account});
  const response=await fetch("/api/xita/v1/managed/sponsorship?"+query,{
   cache:"no-store",credentials:"omit",headers:{accept:"application/json"}});
  if(!response.ok)throw Error("Sponsor status unavailable");
  const data=await response.json();
  if(sponsorTransfer.key!==key)return;
  sponsorTransfer.grants=Array.isArray(data.grants)?data.grants:[];
  // Only the backend may declare ALL committed stages complete.
  // A single confirmed grant is never evidence that the full journey's
  // sponsorship obligations have been fulfilled.
  sponsorTransfer.status=["confirmed","needs-review","submitted","reserved",
   "pending","not-required","disabled"].includes(data.status)?data.status:
   data.status==="tracked"?
    (sponsorTransfer.grants.length>0&&
     sponsorTransfer.grants.every(x=>x.status==="confirmed")?"confirmed":
     sponsorTransfer.grants.some(x=>x.status==="needs-review")?"needs-review":
     "pending"):"unavailable";
 }catch{
  if(sponsorTransfer.key===key)sponsorTransfer.status="unavailable";
 }finally{
  sponsorTransfer.loading=false;
  if(sponsorTransfer.key===key&&flowView.open)updateFlowModal();
 }
}
async function requireUpfrontSponsorship(record,account){
 if(!record?.confirmed||!record.executionAdapter||
    BigInt(record.interchainFeeWei||"0")<=0n)return;
 const query=new URLSearchParams({source:record.sourceChain,
  messageId:record.messageId,account});
 const response=await fetch("/api/xita/v1/managed/sponsorship?"+query,{
  cache:"no-store",credentials:"omit",headers:{accept:"application/json"}
 }).catch(()=>null);
 const evidence=response?.ok?await response.json().catch(()=>null):null;
 if(evidence?.ok!==true||evidence.upfrontRequired!==false&&
   evidence.status!=="confirmed"&&evidence.status!=="not-required")
  throw Error("Waiting for ALL quote-locked gas grants to be confirmed before TX2. No wallet transaction was sent.");
}
function updateFlowModal(){
 const dialog=document.getElementById("xita-flow-dialog");
 if(!dialog||!flowView.open)return;
 const binding=currentFlowBinding();
 if(!binding){resetFlowView();return}
 // Rebuild from the current selected source transaction, NEVER from stale
 // global journey state or the most recent child hop.
 if(sponsorship.enabled&&binding.record?.confirmed)void refreshTransferSponsorship(binding);
 const sponsorKey=binding.record?.sourceChain+":"+String(binding.record?.messageId||"").toLowerCase()+":"+binding.account.toLowerCase();
 const sponsorEnabled=sponsorship.enabled&&binding.record?.executionAdapter&&
   BigInt(binding.record?.interchainFeeWei||0)>0n;
 const html=renderTransferFlow({journey:{...binding.journey,sourceTxHash:binding.sourceTxHash},
  record:binding.record,stage:binding.sameSession?flowView.stage:"",
  working:transferActivity.working,scanning:transferActivity.scanning,
  notice:binding.sameSession?transferActivity.notice:"",
  error:binding.sameSession?transferActivity.error:"",
  sponsorship:{enabled:sponsorEnabled,
   status:sponsorTransfer.key===sponsorKey?sponsorTransfer.status:"pending"}});
 const scroll=dialog.scrollTop;
 dialog.innerHTML=html;dialog.scrollTop=scroll;
 if(!dialog.open)dialog.showModal();
 dialog.querySelector("#xita-flow-close")?.addEventListener("click",closeFlowModal);
 dialog.querySelector("#xita-flow-done")?.addEventListener("click",closeFlowModal);
 dialog.querySelector("#xita-flow-history")?.addEventListener("click",()=>{closeFlowModal();history.pushState(null,"","/my-transfers");render();});
 scheduleAutomaticWalletStep();
}
function closeFlowModal(){flowView.open=false;document.getElementById("xita-flow-dialog")?.close();}
function openFlowModal(){
 const binding=currentFlowBinding();
 if(!binding)return;
 if(!binding.sameSession){
  flowView.stage="";transferActivity.error="";transferActivity.notice="";
 }
 flowView.journey=binding.journey;
 flowView.sourceTxHash=binding.sourceTxHash;
 flowView.account=state.account;
 attemptedWalletSteps.clear();
 flowView.open=true;updateFlowModal();
}
async function performTransferAction(){
 if(transferActivity.working||!state.catalog)return;
 if(!state.account){document.querySelector("#connect")?.click();return;}
 const account=state.account;
 const selected=selectedRecovery(transferActivity.items,account,transferActivity.selectedTxHash);
 if(blocksUnverifiedSourceRepeat(transferActivity.selectedTxHash,selected)){
  transferActivity.error="A previous source TX is selected but not independently verified for continuation. Never submit another source burn/lock. Refresh My Transfers instead.";
  if(path()==="/transfer")render();
  return;
 }
 if(selected&&!flowView.open)openFlowModal();
 transferActivity.working=true;transferActivity.error="";
 setFlowStage(selected?.status==="awaiting-onward"?"onward-source-sign":selected?.status==="awaiting-final-proof"?"final-proof-wait":selected?"first-proof-wait":"source-sign");
 let broadcastKnown=false;
 let autoContinueParent=null;
 transferActivity.notice=selected?"Rechecking original source and destination chains…":
  "Checking recovery readiness, wallet nonce and source route…";
 render();
 try{
  if(selected){
   if(selected.status==="awaiting-final-proof"){
    setFlowStage("final-proof-wait");
    if(!selected.secondHopTxHash||!selected.secondHopMessageId)
     throw Error("Onward TX is not independently indexed; final delivery is blocked");
    const next=await findWalletSourceTx({catalog:state.catalog,account,
     sourceChain:"xgrchain",txHash:selected.secondHopTxHash});
    if(next.parentMessageId!==selected.messageId||
       next.messageId!==selected.secondHopMessageId||
       next.destinationChain!==selected.finalDestinationChain||
       next.asset!==selected.asset||
       next.amountRaw!==selected.amountRaw||
       next.status!=="awaiting-proof")
     throw Error("Parent-linked onward receipt changed; do not submit a delivery");
    await requireUpfrontSponsorship(selected,account);
    const outcome=await resumeDelivery({catalog:state.catalog,account,
     record:next,provider:globalThis.ethereum,waitForProof:false,
     onWalletReady:()=>setFlowStage("final-delivery-sign","Proof verified. Confirm final Base delivery in MetaMask."),
     onStatus:msg=>{setFlowStage("final-proof-wait",msg);if(path()==="/transfer")render();},
     onBroadcast:({txHash})=>{
      broadcastKnown=true;
      setFlowStage("final-delivery-pending");
      transferActivity.notice="Final destination TX "+txHash+" submitted.";
      if(path()==="/transfer")render();
     }
    });
    transferActivity.notice=outcome.status==="delivered"?
     "Both hops delivered; refreshing independent chain index.":
     outcome.notice||"Final destination delivery remains pending.";
    await scanWalletHistory();
    return;
   }
   if(selected.status==="awaiting-onward"){
    setFlowStage("onward-source-sign");
    // The first on-chain message is already delivered to XGRChain. NEVER
    // replay its source Gateway, even if an RPC or UI later fails.
    await requireUpfrontSponsorship(selected,account);
    const sent=await startVerifiedOnwardHop({
     catalog:state.catalog,account,record:selected,provider:globalThis.ethereum,
     onBroadcast:({txHash})=>{
      broadcastKnown=true;
      setFlowStage("onward-source-pending");
      announceWalletSourceTx("xgrchain",txHash,account);
      transferActivity.notice="Onward XGRChain TX "+txHash+
       " submitted. Original first-hop source remains untouched.";
      render();
     }
    });
    broadcastKnown=true;
    const receipt=await waitForWalletReceipt(globalThis.ethereum,sent.txHash,{
     attempts:20,delayMs:2500
    });
    if(!receipt){
     transferActivity.notice="Onward source TX pending; refresh My Transfers before any retry.";
     return;
    }
    if(receipt.status!=="0x1"){
     transferActivity.notice="Onward source TX failed; original delivery to XGRChain remains confirmed.";
     return;
    }
    const onward=await findWalletSourceTx({catalog:state.catalog,account,
     sourceChain:"xgrchain",txHash:sent.txHash});
    upsertTransfer(onward);
    if(onward.status==="awaiting-proof"){
     // The modal and selection remain anchored to the ORIGINAL Arbitrum parent.
     setFlowStage("final-proof-wait");
     transferActivity.notice="Onward TX verified. Waiting for final destination validator proof…";
     if(path()==="/transfer")render();
     // Backend proof observer, not the browser, prepares validator evidence.
     await scanWalletHistory();

    }else{
     transferActivity.notice="Onward Gateway confirmed; its destination delivery can be resumed later.";
    }
    return;
   }
   if(selected.status!=="awaiting-proof"){
    await lookupWalletTransfer(selected.sourceChain,selected.txHash);
    return;
   }
   const result=await resumeDelivery({catalog:state.catalog,account,record:selected,
    provider:globalThis.ethereum,waitForProof:false,
    onWalletReady:()=>setFlowStage("first-delivery-sign","Validator proof verified. Confirm XGRChain delivery in MetaMask."),
    onStatus:notice=>{
     transferActivity.notice=notice;if(path()==="/transfer")render();
    },onBroadcast:({txHash})=>{
     broadcastKnown=true;
     setFlowStage("first-delivery-pending");
     transferActivity.notice="Destination TX "+txHash+
      " submitted. Original source transfer is NEVER repeated.";
    }});
   transferActivity.notice=result.status==="delivered"?
    "Delivery confirmed by the destination Mailbox.":
    result.status==="waiting"?result.notice||"Validator proof pending; retry later.":
    result.status==="failed"?"Destination TX failed; retry only the destination.":
    "Destination TX pending; do not repeat it until chain status is checked.";
   if(result.status==="waiting"||result.status==="paused"){
    // Preserve the proof-builder's actual quorum/RPC/stage diagnostic. A
    // second source lookup would replace this with a generic success notice.
    await scanWalletHistory();
    transferActivity.notice=result.notice||transferActivity.notice;
    return;
   }
   await lookupWalletTransfer(selected.sourceChain,selected.txHash);
   if(result.status==="delivered"&&selected.destinationChain==="xgrchain"&&selected.finalDestinationChain&&
      selected.onwardRouteId&&flowView.open&&flowView.sourceTxHash?.toLowerCase()===selected.txHash.toLowerCase())
    autoContinueParent=selected.txHash.toLowerCase();
   return;
  }
  const model=buildExperienceModel(state.catalog,()=>false);
  const asset=state.experience.asset,origin=state.experience.origin,
   destination=state.experience.destination,amount=state.experience.amount||"";
  const firstDestination=origin!=="xgrchain"&&destination!=="xgrchain"?
   "xgrchain":destination;
  const firstRoute=model.transferRoutes.some(r=>
   r.asset===asset&&r.source===origin&&r.destination===firstDestination);
  const onwardRoute=firstDestination===destination||model.transferRoutes.some(r=>
   r.asset===asset&&r.source==="xgrchain"&&r.destination===destination);
  if(!firstRoute||!onwardRoute)
   throw Error("Both independently deployed XITA routes are required");
  // Preflight/approvals do not constitute an on-chain bridge operation.
  // Keep status modal closed until a source Gateway TX was broadcast.
  const sent=await startTransfer({catalog:state.catalog,account,asset,source:origin,
   destination,amount,provider:globalThis.ethereum,
   onBroadcast:({txHash})=>{
    broadcastKnown=true;
    flowView.journey={origin,destination,asset};flowView.sourceTxHash=txHash;
    flowView.account=account;
    flowView.open=true;setFlowStage("source-pending");
    // Preserve the canonical source hash in the URL immediately after
    // broadcast. A reload must not turn a pending source into a new CTA.
    transferActivity.selectedTxHash=txHash;
    void updateWalletGas();
    history.replaceState(null,"","/transfer?token="+encodeURIComponent(asset)+"&resume="+txHash);
    announceWalletSourceTx(origin,txHash,account);
    transferActivity.notice="Source TX "+txHash+" submitted; do NOT lock/burn again while pending.";
    render();
   }});
  flowView.journey={origin,destination,asset};flowView.sourceTxHash=sent.txHash;
  flowView.account=account;
  flowView.open=true;setFlowStage("source-pending","Source TX submitted. Waiting for lock/burn confirmation…");
  const receipt=await waitForWalletReceipt(globalThis.ethereum,sent.txHash,{attempts:20,delayMs:2500});
  if(!receipt)transferActivity.notice="Source TX still pending. Reconnect later to rescan the chain.";
  else if(receipt.status!=="0x1"){
   transferActivity.notice="Source TX reverted; no lock/burn was committed.";
   transferActivity.selectedTxHash=null;
   history.replaceState(null,"","/transfer?token="+encodeURIComponent(asset));
  }
  else {
   // The source receipt is irreversible. Continue this SAME on-chain message,
   // never start another bridge. The destination still requires a wallet signature.
   setFlowStage("source-pending","Source receipt mined. Verifying required source-chain finality…");
   if(path()==="/transfer")render();
   const record=await findWalletSourceTx({catalog:state.catalog,account,
    sourceChain:sent.sourceChain,txHash:sent.txHash});
   upsertTransfer(record);
   updateFlowModal();
   if(record.status==="confirming"){
    transferActivity.notice="Source receipt confirmed by wallet. Waiting for required Arbitrum finality; do not resend.";
    return;
   }
   if(record.status==="awaiting-proof"){
    transferActivity.selectedTxHash=record.txHash;
    setFlowStage("first-proof-wait","Source finalized. Waiting for validator proof and destination delivery…");
    // Continue background proof verification via canonical SQL observer.
    await scanWalletHistory();

   }else{
    transferActivity.notice="Source transaction recorded. Waiting for confirmations or destination RPC.";
   }
  }
 }catch(error){
  transferActivity.error=String(error.message||error);
  if(!broadcastKnown&&!selected&&!flowView.sourceTxHash)resetFlowView();
  updateFlowModal();
  // A failed preflight must not keep displaying a stale in-progress status.
  // Preserve broadcast evidence when a transaction actually left the wallet.
  if(!broadcastKnown)transferActivity.notice="";
 }finally{
  if(state.account?.toLowerCase()===account.toLowerCase()){
   transferActivity.working=false;
   if(path()==="/transfer")render();
   updateFlowModal();
   // Auto-continue only this explicitly active, verified two-hop journey.
   // The hub adapter checks the on-chain once-per-parent guard before TX3.
   if(autoContinueParent&&state.account?.toLowerCase()===account.toLowerCase()&&
      transferActivity.selectedTxHash?.toLowerCase()===autoContinueParent&&flowView.open){
    const parent=transferActivity.items.find(t=>t.txHash?.toLowerCase()===autoContinueParent&&
      t.account?.toLowerCase()===account.toLowerCase());
    if(parent?.status==="awaiting-onward"&&parent.delivered===true)
     void performTransferAction();
   }
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
const activeFor=id=>deployedRoutes(state.catalog).filter(r=>r.asset===id).length;
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
  '<small class="muted">'+activeFor(id)+' deployed routes</small><br>'+
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
 const columns=[["lockedUsd","Locked TVL"],["movedUsd","Escrow moved · 24h"],["marketCapUsd","Market cap"]];
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
 '<div><span>Escrow moved · 24h</span><strong>'+formatUsd(state.leaderboard?.totals?.movedUsd)+'</strong></div></div>'+
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
 const stage=listingStatus(a,state.visibility?.assets?.[id],state.catalog);
 const chips=(p.categories||[]).map(cat=>'<span class="category-chip">'+x(cat)+'</span>').join(" ");
 return '<div class="columns"><article><a href="/markets" data-nav class="muted">← All tokens</a>'+
 '<div class="token-link section">'+projectLogo(id)+'<div><div class="eyebrow">'+x(names[canonical]||canonical)+' · Canonical asset</div>'+
 '<h1>'+x(p.name)+' <small>'+x(id)+'</small></h1><span class="tag">'+x(stage)+'</span></div></div>'+
 '<div class="card"><h2>Project overview</h2><p class="lead" style="font-size:16px">'+x(p.shortDescription)+'</p><p class="muted">'+x(p.description)+'</p>'+chips+
 '<div class="pair"><span>Canonical network</span><b>'+x(names[canonical]||canonical)+'</b></div>'+
 '<div class="pair"><span>Token decimals</span><b>'+a.metadata.decimals+'</b></div>'+
 '<div class="pair"><span>Documented ILN routes</span><b>'+
  (a.deployment?.routeDeployments?.length||0)+'</b></div>'+
 '<div class="pair"><span>Market price</span><b>'+x(state.leaderboard?.assets?.[id]?.market?.source==="coingecko"?formatUsd(state.leaderboard.assets[id].market.priceUsd):displayPrice(state.prices[id]))+'</b></div>'+tokenMarketMarkup(id)+
 '<h3>Project links</h3><div class="project-links">'+projectLinks(id)+'</div></div>'+
 '<section class="section"><h2>Network representations</h2><p class="ux-small">Contract addresses from documented deployment receipts.</p><div class="routes">'+(a.metadata.representations||[]).map(rep=>
 renderRepresentationInventory(model,id,rep.chain,walletGasView())).join("")+'</div></section>'+
 '<section class="section"><h2>Deployed interchain routes</h2><div class="routes">'+
 (deployedRoutes(state.catalog).filter(r=>r.asset===id).map(rt=>
  '<div class="route"><strong>'+x(routeName({sourceChain:rt.source,destinationChain:rt.destination}))+
  '</strong><div class="ux-small">Deployed · Gateway '+x(rt.gateway)+'</div></div>').join("")||
  '<p class="ux-small">No routes deployed yet.</p>')+'</div></section>'+
 '</article><aside class="card ux-token-aside">'+renderTokenBridge(model,id,state.experience,walletGasView())+'</aside></div>';
}
const joinState={data:null,step:0,status:"",busy:false,accepted:false};
const joinConfirmation={phase:"idle",message:"",prNumber:null,prUrl:null};
let joinConfirmationProcessed=false;
async function processJoinEmailConfirmation(){
 if(joinConfirmationProcessed)return;
 joinConfirmationProcessed=true;
 const code=location.hash.slice(1);
 // Remove the secret fragment before network calls, logging or rendering.
 history.replaceState(null,"","/join/confirm");
 const match=/^([0-9a-f-]{36})\.([a-f0-9]{64})$/.exec(code);
 if(!match){joinConfirmation.phase="invalid";render();return;}
 joinConfirmation.phase="verifying";
 // Keep the confirmation status in memory so any other render preserves it.
 try{
  const response=await fetch("/api/xita/join/confirm",{method:"POST",
   headers:{"Content-Type":"application/json"},body:JSON.stringify({id:match[1],token:match[2]})});
  const result=await response.json();
  if(!response.ok||!result.ok)throw Error(result.error||"Confirmation unavailable");
  if(!Number.isSafeInteger(result.prNumber)||!/^https:\/\/github\.com\/xgr-network\/xgr-interchain\/pull\/\d+$/.test(result.prUrl||""))
   throw Error("Confirmation response is incomplete; contact XGR support and do not resubmit");
  joinConfirmation.phase="success";
  joinConfirmation.prNumber=result.prNumber;joinConfirmation.prUrl=result.prUrl;
 }catch(e){
  joinConfirmation.phase="failed";
  joinConfirmation.message=String(e.message||"Confirmation unavailable");
 }
 if(path()==="/join/confirm")render();
}

function join(){
 if(joinState.accepted)return joinPendingMarkup(joinState.data);
 if(!joinState.data)joinState.data=draft(state.catalog.chains);
 return joinMarkup(state.catalog.chains,joinState.data,joinState.step,joinState.status,joinState.busy);
}
function drawJoin(){if(path()==="/join"||path()==="/join/submitted")render();}
function captureJoin(){
 const d=joinState.data;
 document.querySelectorAll("[data-join]").forEach(el=>{
  const key=el.dataset.join;
  if(el.type==="checkbox")d[key]=el.checked;
  else if(key==="decimals")d[key]=el.value===""?null:Number(el.value);
  else d[key]=el.value;
 });
 d.symbol=d.symbol.trim().toUpperCase();
}
async function runJoin(action){
 if(joinState.busy||joinState.accepted)return;
 captureJoin();
 const d=joinState.data;
 if(action==="back"){joinState.step=Math.max(0,joinState.step-1);joinState.status="";drawJoin();return;}
 if(action==="export"){
  const {contactEmail,...publicDraft}=d;
   const blob=new Blob([JSON.stringify({...publicDraft,kind:"xita-alliance-application-draft"},null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="xita-alliance-application.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  joinState.status="Downloaded locally; no data was submitted.";drawJoin();return;
 }
 const problems=validateStep(d,joinState.step,state.catalog.chains);
 if(problems.length){
   joinState.status="Please complete the required fields.";
   const fields={name:"name",symbol:"symbol",website:"website",
     "Short description (15–280 characters)":"shortDescription",
     "Full description (40–5000 characters)":"description",
     "CoinGecko coin ID":"coingeckoId","Contact email":"contactEmail","Relationship to token":"applicantRole",
     "ERC-20 contract address":"canonicalAddress",
     "Canonical chain":"canonicalChain",Decimals:"decimals",
     "HTTPS logo URL":"logoUrl","HTTPS website":"website",
     "Project confirmation":"confirmed"};
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
 if(action==="next"){joinState.step=Math.min(2,joinState.step+1);joinState.status="";drawJoin();return;}
 if(action==="submit"){
  joinState.busy=true;
  joinState.status="Validating public token manifests…";drawJoin();
  try{
   const response=await fetch("/api/xita/join/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});
   const body=await response.json();
   if(!response.ok||!body.ok)throw Error(body.error||"Backend preview unavailable");
   joinState.status="CoinGecko identity validated. Sending confirmation email…";drawJoin();
   const submission=await fetch("/api/xita/join/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});
   const result=await submission.json();
   if(!submission.ok||!result.ok)throw Error(result.error||"Submit unavailable");
   joinState.accepted=true;
   joinState.status="";
   history.replaceState(null,"","/join/submitted");
  }catch(e){joinState.status="Application could not be completed: "+e.message+". No second submission was made.";}
  joinState.busy=false;
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
 if(path()==="/"||path()==="/transfer"||path()==="/plan-route"||path().startsWith("/token/"))render();
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
   if(path()==="/"||path()==="/transfer"||path()==="/plan-route"||path().startsWith("/token/"))render();
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
 document.body.classList.toggle("xita-subpage-planet",p!=="/");
 if(p==="/transfer"){
  const query=new URLSearchParams(location.search);
  const preselect=query.get("token");
  if(preselect&&state.catalog?.assets?.[preselect])state.experience.asset=preselect;
  // A resume URL is only a selection intent; it never verifies ownership
  // or authorizes a source TX. Only wallet-indexed records can do that.
  const requested=query.get("resume");
  const nextSelected=/^0x[0-9a-f]{64}$/i.test(requested||"")?
   requested.toLowerCase():null;
  if(nextSelected!==transferActivity.selectedTxHash&&flowView.sourceTxHash?.toLowerCase()!==nextSelected)resetFlowView();
  transferActivity.selectedTxHash=nextSelected;
 }
 if(p==="/my-transfers"&&!state.account){
  history.replaceState(null,"","/");
  return render();
 }
 const match=/^\/token\/([a-z0-9-]{1,80})$/.exec(p);
 const id=match?allAssets().find(a=>profile(a).slug===match[1]):null;
 state.assetId=id||"XGR";
 const detailRequested=Boolean(id||p==="/xgr");
 const detailPublic=detailRequested&&isPublicAsset(state.assetId,asset(),state.visibility,state.catalog);
 const detailDeployed=detailRequested&&isDeployedAsset(asset(),state.catalog);
 // All discovery surfaces use the same derived publication policy. Only
 // deployed chain-specific representations become token planets.
 const universe=buildExperienceModel(p==="/transfer"?state.catalog:publicCatalog(),()=>false);
 el.innerHTML=p==="/"?renderDashboard(universe,state.experience,state.apiState,state.leaderboard,publicCatalog(),walletGasView()):p==="/transfer"?renderPlanRoute(universe,state.experience,state.apiState,walletGasView(),{
   items:transferActivity.items,scanning:transferActivity.scanning,
   busy:transferActivity.working,selectedTxHash:transferActivity.selectedTxHash,
   notice:transferActivity.notice,error:transferActivity.error,coverage:transferActivity.indexCoverage,
   hasFlow:Boolean(flowView.journey)&&Boolean(state.account),
    sponsorship:{available:sponsorRouteReady(sponsorship,state.experience.origin,state.experience.destination),status:sponsorship.status,
      chains:sponsorship.chains}
  }):p==="/faq"?renderFAQ():p==="/markets"?markets():p==="/my-transfers"?
  renderMyTransfers({account:state.account,catalog:state.catalog,
   items:transferActivity.items,scanning:transferActivity.scanning,
   scanReport:transferActivity.report,indexCoverage:transferActivity.indexCoverage,
   notice:transferActivity.notice,error:transferActivity.error}):detailPublic?token():detailRequested&&detailDeployed?'<div class="ux-app ux-start-error"><h1>Token not publicly listed</h1><p>The deployed token does not currently meet the minimumLockedUsd publication policy. Existing transfers and permissionless recovery remain available.</p></div>':detailRequested?'<div class="ux-app ux-start-error"><h1>Token deployment pending</h1><p>The asset is configured but its complete verified XITA route deployments are not yet documented.</p></div>':p==="/join"?join():p==="/join/submitted"?joinPendingMarkup(joinState.accepted?joinState.data:null):p==="/join/confirm"?joinConfirmationMarkup(joinConfirmation):'<h1>Page not found</h1>'+btn("/markets","Browse tokens");
 if(p==="/transfer"){
  // The planner normalizes the target when the source changes. Commit the
  // actual visible form values before any preview or wallet transaction.
  for(const [key,id] of [["asset","ux-asset"],["origin","ux-origin"],["destination","ux-destination"]]){
   const value=document.getElementById(id)?.value;
   if(typeof value==="string"&&value)state.experience[key]=value;
  }
  void refreshSponsorship();scheduleFeePreview();
  document.querySelector("#xita-flow-open")?.addEventListener("click",openFlowModal);
 }
 if(p==="/join/confirm")void processJoinEmailConfirmation();
 updateFlowModal();
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
   if(details)details.innerHTML=renderUniverse(universe,key,state.leaderboard,walletGasView()).match(/<aside class="ux-panel ux-details"[^>]*>([\s\S]*?)<\/aside>/)?.[1]||"";
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
 document.querySelector("#ux-transfer-amount")?.addEventListener("input",e=>{state.experience.amount=e.target.value;transferActivity.error="";document.querySelector("#xita-transfer-form-error")?.setAttribute("hidden","");scheduleFeePreview();});
 document.querySelector("#xita-open-transfer")?.addEventListener("change",e=>{
  const params=new URLSearchParams(location.search);
  if(/^0x[0-9a-f]{64}$/i.test(e.target.value||""))
   params.set("resume",e.target.value.toLowerCase());
  else params.delete("resume");
  history.replaceState(null,"","/transfer"+(params.size?"?"+params.toString():""));
  resetFlowView();transferActivity.error="";transferActivity.notice="";
  render();
 });
 document.querySelector("#xita-transfer-primary")?.addEventListener("click",()=>void performTransferAction());
 document.querySelector("#xita-flow-reopen")?.addEventListener("click",openFlowModal);
 document.querySelector("#ux-fee-info-trigger")?.addEventListener("click",()=>document.querySelector("#ux-fee-info-dialog")?.showModal());
 document.querySelector("#ux-fee-info-close")?.addEventListener("click",()=>document.querySelector("#ux-fee-info-dialog")?.close());
 document.querySelector("[data-fee-info-close]")?.addEventListener("click",()=>document.querySelector("#ux-fee-info-dialog")?.close());
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
let boundWalletProvider=null;
function bindWalletEvents(){
 const provider=globalThis.ethereum;
 if(!provider?.on||boundWalletProvider===provider)return;
 boundWalletProvider=provider;
 provider.on("accountsChanged",accounts=>{
  setConnectedAccount(Array.isArray(accounts)?accounts[0]:null);
  state.walletBalances=null;state.walletTokenBalances=null;state.walletGasCheckedAt=null;state.walletGas=null;
  void updateWalletGas();
 });
 provider.on("chainChanged",()=>{
  state.walletBalances=null;state.walletTokenBalances=null;
  state.walletGasCheckedAt=null;void updateWalletGas();
 });
}
// This is intentionally permissionless: a user who authorized the website
// before reload does not have to press Connect Wallet again. A new user sees
// no wallet activity and gets no permission/signature dialog.
async function restoreAuthorizedWallet(){
 const provider=globalThis.ethereum;
 if(!provider||state.account)return;
 let timer=null;
 try{
  const known=await Promise.race([
   authorizedWalletAccount(provider),
   new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1600);})
  ]);
  if(known&&!state.account){
   bindWalletEvents();
   setConnectedAccount(known);
   if(state.catalog)void updateWalletGas();
  }
 }catch{ /* An unavailable/locked wallet must not block the website. */ }
 finally{if(timer!==null)clearTimeout(timer);}
}
bindWalletEvents();
// A wallet may inject after the module loads (common in mobile browsers).
// Never request account authorization just because injection was delayed.
window.addEventListener("ethereum#initialized",()=>{
 bindWalletEvents();
 if(state.catalog&&!state.account)void restoreAuthorizedWallet();
});
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
 if(field.matches('[data-join="canonicalChain"],[data-join="priceSource"]')){
  captureJoin();drawJoin();
 }
});
document.addEventListener("click",e=>{
 const a=e.target.closest("a[data-nav]");
 if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
 e.preventDefault();history.pushState(null,"",a.pathname+a.search+a.hash);render();scrollTo(0,0);
});
document.addEventListener("click",e=>{
 const copy=e.target.closest("button[data-xita-copy-address]");
 if(!copy)return;
 const address=copy.dataset.xitaCopyAddress;
 if(!/^0x[0-9a-f]{40}$/i.test(address||""))return;
 e.preventDefault();
 if(!navigator.clipboard?.writeText){copy.textContent="Copy unavailable";return;}
 void navigator.clipboard.writeText(address).then(()=>{copy.textContent="Copied";}).catch(()=>{copy.textContent="Copy unavailable";});
});
let metaMaskImportBusy=false;
document.addEventListener("click",async event=>{
 const button=event.target.closest("button[data-xita-add-metamask]");
 if(!button||metaMaskImportBusy||!state.catalog)return;
 event.preventDefault();
 const spec=metaMaskTokenSpec(buildExperienceModel(state.catalog,()=>false),button.dataset.asset,button.dataset.chain);
 if(!spec){button.textContent="Token unavailable";return;}
 const provider=injectedMetaMask(globalThis.ethereum);
 if(!provider){button.textContent="MetaMask required";return;}
 metaMaskImportBusy=true;button.disabled=true;button.textContent="Open MetaMask…";
 try{button.textContent=await requestMetaMaskToken(provider,spec)?"Added to MetaMask":"Not added";}
 catch(error){button.textContent="Retry MetaMask";button.title=metaMaskFailure(error);}
 finally{metaMaskImportBusy=false;button.disabled=false;}
});
// A missing remote token image should reveal the ticker, never a broken icon.
document.addEventListener("error",event=>{
 const img=event.target;
 if(img?.matches?.(".ux-dashboard-token-logo-img"))img.hidden=true;
},true);
window.addEventListener("popstate",render);
// Exact-hash finality polling is separate from the finalized event index.
// Read-only; an RPC outage never causes another source transaction.
let directFinalityPoll=false;
setInterval(async()=>{
 if(directFinalityPoll||transferActivity.scanning||transferActivity.working||
  !state.account||!state.catalog||document.visibilityState==="hidden"||
  path()!=="/transfer")return;
 const hash=transferActivity.selectedTxHash;
 const entry=transferActivity.items.find(t=>t.txHash?.toLowerCase()===hash?.toLowerCase()&&
  t.account?.toLowerCase()===state.account.toLowerCase());
 if(!entry||["delivered","journey-delivered"].includes(entry.status))return;
 directFinalityPoll=true;
 const account=state.account;
 try{
  if(["pending-source","confirming","confirming-native-finality","finality-unavailable"].includes(entry.status)){
   const record=await findWalletSourceTx({catalog:state.catalog,account,
    sourceChain:entry.sourceChain,txHash:entry.txHash});
   if(state.account?.toLowerCase()!==account.toLowerCase()||
    transferActivity.selectedTxHash?.toLowerCase()!==hash?.toLowerCase())return;
   upsertTransfer(record);
   if(record.confirmed)flowView.stage="first-proof-wait";
  }else{
   // Light polling reads ONLY durable SQL/validator observations, never
   // starts proof subprocesses or any wallet transaction in the browser.
   const reply=await fetch("/api/xeta/v1/transfers/wallet?"+
    new URLSearchParams({account}),{cache:"no-store",credentials:"omit"});
   if(!reply.ok)return;
   const data=await reply.json();
   if(data?.kind!=="xita-wallet-transfer-index-v1"||
      data.wallet?.toLowerCase()!==account.toLowerCase()||
      !Array.isArray(data.items))return;
   if(state.account?.toLowerCase()!==account.toLowerCase()||
     transferActivity.selectedTxHash?.toLowerCase()!==hash?.toLowerCase())return;
   transferActivity.items=canonicalWalletSnapshot({
    account,rows:data.items,previous:transferActivity.items,
    activeSourceHash:flowView.account?.toLowerCase()===account.toLowerCase()&&
      flowView.open?flowView.sourceTxHash:null
   });
   if(Number.isSafeInteger(data.openCount))transferActivity.indexOpenCount=data.openCount;
   refreshTransferLink();
  }
  if(path()==="/transfer")render();
  updateFlowModal();
 }catch{/* Unknown index/RPC status cannot downgrade canonical evidence. */}
 finally{directFinalityPoll=false}
},12000);
setInterval(()=>{
 if(!state.account||!state.catalog||transferActivity.scanning||
    transferActivity.working||document.visibilityState==="hidden")return;
 // A pending transfer continues updating even if the user navigates to
 // Tokens or the Universe. Hidden tabs can rely on the server-side observer.
 if(path()==="/my-transfers"||path()==="/transfer"||
    transferActivity.indexOpenCount>0||
    openWalletTransfers(transferActivity.items,state.account).length>0)
  void scanWalletHistory();
},45000);
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
  // Check previously authorized accounts BEFORE rendering a direct
  // /my-transfers URL, otherwise the unauthenticated deep-link redirect
  // would discard the pending-transfer view on every browser restart.
  await restoreAuthorizedWallet();
  render();
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
   details.innerHTML=renderUniverse(model,state.experience.system,body,walletGasView()).match(/<aside class="ux-panel ux-details"[^>]*>([\s\S]*?)<\/aside>/)?.[1]||"";
  }
 }}catch{ /* Unavailable is not zero */ }}

// The dialog is deliberately outside #app: repainting the planner must not close
// an active MetaMask/proof status view or reset its scroll/focus state.
const statusDialog=document.createElement("dialog");
statusDialog.id="xita-flow-dialog";statusDialog.className="ux-flow-dialog";
statusDialog.setAttribute("aria-labelledby","xita-flow-title");
statusDialog.addEventListener("cancel",()=>{flowView.open=false;});
document.body.append(statusDialog);
