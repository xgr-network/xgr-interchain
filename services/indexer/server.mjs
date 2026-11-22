import {systemRanking} from "../../apps/web/system-rankings.js";
// Read-only XITA metrics projector. No trust in remote claims: input must be a
// trusted, locally maintained evidence file produced by a finalized-chain verifier.
// No write API, no GitHub credentials, no simulated numbers, no legacy collateral.
import {createServer} from "node:http";
import {readFileSync,statSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildLeaderboardRows,verifiedMetrics} from "../../apps/web/leaderboard-data.js";
import {isDeployedAsset} from "../../apps/web/listing-visibility.js";
import {getCoinGeckoPrices} from "./coingecko.mjs";
import {resolveRecoveryRoute,runRecoveryProcess} from "./transfer-recovery.mjs";
import {pollLocalQuorum} from "./xgr-quorum-poll.mjs";
import {readWalletTransferIndex,readTransferIndexStats} from "./transfer-index-store.mjs";
import {cachedExplorerWallet} from "./explorer-wallet-discovery.mjs";
import {proxyCatalogRpcRead} from "./rpc-read.mjs";
import {derivedVisibility,readPublicationPositions} from "./publication.mjs";
const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const PORT=Number(process.env.XITA_INDEXER_PORT||4088);
const HOST=process.env.XITA_INDEXER_HOST||"127.0.0.1";
const evidencePath=process.env.XITA_METRICS_EVIDENCE||"/var/lib/xita/verified-tvl.json";
const historyPath=process.env.XITA_TVL_HISTORY||"/var/lib/xita/verified-tvl-history.json";
const movedHistoryPath=process.env.XITA_TOTAL_MOVED_HISTORY||"/var/lib/xita/verified-total-moved-history.json";
function readEvidence(){
 if(!existsSync(evidencePath))return null;
 const info=statSync(evidencePath);
 if(!info.isFile()||info.size>2_000_000)throw Error("Metrics evidence size invalid");
 const data=JSON.parse(readFileSync(evidencePath,"utf8"));
 if(data?.schemaVersion!==1||data?.kind!=="xita-asset-metrics-v1"||typeof data.assets!=="object")
  throw Error("Unexpected evidence schema");
 const at=Date.parse(data.asOf);
 if(!Number.isFinite(at)||at>Date.now()+30000||Date.now()-at>120000)
  return null;
 return data;
}
export function projectMetrics(catalog,evidence,marketSnapshot=null){
 const keys=Object.keys(catalog.assets||{});
 // Accepted Join proposals and partially documented deployments are not
 // physical escrows. Their absence of TVL/24h evidence must not erase the
 // independently verified totals of already deployed assets.
 const activeKeys=keys.filter(key=>isDeployedAsset(catalog.assets[key],catalog));
 const assets={};
 for(const key of keys){
  const original=evidence?.assets?.[key];
  // The current web model accepts only verified, internally self-consistent
  // evidence; no arbitrary /POST metrics API ever bypasses provenance review.
  assets[key]=isDeployedAsset(catalog.assets[key],catalog)&&verifiedMetrics(evidence,key)?structuredClone(original):{
   assetId:key,verified:false,market:{status:"unavailable"},
   custody:{status:"unavailable"},movement:{status:"unavailable"}
  };
  const id=catalog.assets[key].profile?.market?.coingeckoId;
  const price=marketSnapshot?.records?.[id];
  if(price&&catalog.assets[key].profile?.market?.priceSource==="coingecko"){
   // Public market data may be displayed, but it cannot attest custody.
   assets[key].market={status:"market-data",source:"coingecko",
    priceUsd:price.priceUsd,marketCapUsd:price.marketCapUsd,circulating:price.circulating,
    asOf:price.asOf};
  }
 }
 // Keep unknown aggregate unknown; never sum a partial selection as network TVL.
 const facts=buildLeaderboardRows(catalog,{kind:"xita-asset-metrics-v1",schemaVersion:1,assets},{includeUnlisted:true});
 const activeFacts=facts.filter(f=>activeKeys.includes(f.id));
 const completeTVL=activeFacts.length>0&&activeFacts.every(f=>f.lockedUsd!==null);
 const completeMoved=activeFacts.length>0&&activeFacts.every(f=>f.movedUsd!==null);
 const totals={
  lockedUsd:completeTVL?activeFacts.reduce((s,x)=>s+x.lockedUsd,0):null,
  movedUsd:completeMoved?activeFacts.reduce((s,x)=>s+x.movedUsd,0):null
 };
 // This is a separate, explicitly incomplete lower bound, never the total.
 // Each included asset already passed receipt-backed deployment, finalized
 // source-event validation, USD pricing and verifiedMetrics' anti-double-count
 // checks. Unknown movement is omitted, NOT treated as zero.
 const verifiedMovement=activeFacts.filter(f=>f.movedUsd!==null);
 const partialMovement=!completeMoved&&verifiedMovement.length>0?{
  verifiedMinimumUsd:verifiedMovement.reduce((sum,f)=>sum+f.movedUsd,0),
  verifiedAssets:verifiedMovement.length,
  requiredAssets:activeFacts.length
 }:null;
 // The 24h comparison must be anchored to the timestamp of these verified
 // totals, not the timestamp of an unrelated (potentially stale) history point.
 const asOf=typeof evidence?.asOf==="string"&&Number.isFinite(Date.parse(evidence.asOf))?
  evidence.asOf:null;
 const indexedTvl=evidence?.indexedTvl?.kind==="xita-indexed-tvl-v1"?
  Object.fromEntries(activeKeys.flatMap(key=>{
   const p=evidence.indexedTvl.positions?.[key];
   return p?.assetId===catalog.assets[key].metadata?.assetId&&
    Number.isFinite(p.lockedUsd)&&p.lockedUsd>=0?[[key,p]]:[];
  })):null;
 return {schemaVersion:1,kind:"xita-asset-metrics-v1",asOf,assets,totals,
  ...(indexedTvl&&{indexedTvl:{kind:"xita-indexed-tvl-v1",positions:indexedTvl,
   lockedUsd:activeKeys.length&&Object.keys(indexedTvl).length===activeKeys.length?
    Object.values(indexedTvl).reduce((sum,p)=>sum+p.lockedUsd,0):null}}),
  partialMovement,
  status:completeTVL&&completeMoved?"verified":"incomplete",
  metadata:{configuredAssets:keys.length,deployedAssets:activeKeys.length,
   verifiedAssets:activeFacts.filter(f=>f.lockedUsd!==null&&f.movedUsd!==null).length,
   source:evidence?"trusted-evidence-file":"no-finalized-chain-evidence"}};
}
let cache={until:0,snapshot:null};
// This is only a process load guard, never a transfer state journal.
// Recovery source of truth remains canonical on-chain events.
const recoveryRequests=new Map();
const MAX_RECOVERY_PROCESS=2;
const MAX_RECOVERY_RECENT=60;
const rateLimit=new Map();
const rpcDiagnosticAt=new Map();
function reportRpcReadFailure(error){
 const code=/^RPC_[A-Z0-9_]{3,64}$/.test(error?.rpcReadCode||"")?
  error.rpcReadCode:"RPC_INTERNAL_FAILURE";
 const chainId=Number.isSafeInteger(error?.chainId)?error.chainId:null;
 const attempts=Array.isArray(error?.attempts)?error.attempts.slice(0,8)
  .filter(x=>Number.isSafeInteger(x.endpoint)&&x.endpoint>0&&
   ["identity","read"].includes(x.phase)&&
   /^RPC_[A-Z0-9_]{3,64}$/.test(x.code||"")):[];
 const key=code+":"+chainId+":"+attempts.map(x=>x.code).join(",");
 const now=Date.now();
 if(now-(rpcDiagnosticAt.get(key)||0)>30000){
  rpcDiagnosticAt.set(key,now);
  console.warn("XITA_RPC_READ",JSON.stringify({code,chainId,attempts}));
 }
 if(rpcDiagnosticAt.size>100)rpcDiagnosticAt.clear();
 return {code,chainId,attempts};
}
export async function serveUnsignedTransferRecovery({
 catalog,route,messageId,asset,sourceTxHash=null,now=Date.now(),
 runner=runRecoveryProcess,quorumPoll=pollLocalQuorum
}){
 const request=resolveRecoveryRoute(catalog,route,messageId,asset,sourceTxHash);
 const key=asset+":"+route+":"+request.messageId;
 // Limit replay and quorum request spam without storing transfer state.
 for(const [k,ts] of rateLimit)if(ts<=now-60000)rateLimit.delete(k);
 if(rateLimit.size>=MAX_RECOVERY_RECENT&&!rateLimit.has(key))
  return {code:429,body:{ok:false,error:"Proof preparation busy; retry later"}};
 const inFlight=recoveryRequests.get(key);
 if(inFlight)return {code:202,body:{ok:true,status:"PREPARING",messageId:request.messageId}};
 if(recoveryRequests.size>=MAX_RECOVERY_PROCESS)
  return {code:429,body:{ok:false,error:"Proof preparation busy; retry later"}};
 if((rateLimit.get(key)||0)>now-15000)
  return {code:429,body:{ok:false,error:"Retry shortly; original source remains unchanged"}};
 rateLimit.set(key,now);
 const pending=(async()=>{
  // Known external transfers already queued for independent validation
  // can wait on the local node without replaying source receipt reads.
  if(sourceTxHash&&request.env.ORIGIN_CHAIN_ID!=="1643"){
   let status;
   try{
    status=await quorumPoll({route:request.env.ATTESTATION_ROUTE,messageId:request.messageId});
   }catch(error){
    throw Object.assign(new Error("Local quorum status unavailable",{cause:error}),
     {code:"PROOF_QUORUM_UNAVAILABLE",stage:"quorum"});
   }
   if(["PENDING","PARTIAL_QUORUM","RETRYING_VALIDATION"].includes(status))
    return {status:"PENDING",messageId:request.messageId};
  }
  return runner(request);
 })();
 recoveryRequests.set(key,pending);
 try{
  const result=await pending;
  return {code:200,body:{ok:true,...result}};
 }finally{
  if(recoveryRequests.get(key)===pending)recoveryRequests.delete(key);
 }
}
export async function handler(req,res){
 const parsed=new URL(req.url,"http://127.0.0.1");
 const pathname=parsed.pathname;
 const send=(status,data)=>{
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
   "Access-Control-Allow-Origin":"https://xita.xgr.network"});
  res.end(JSON.stringify(data));
 };
 // POST-only same-origin browser transport. No signing, no broadcasting,
 // no arbitrary URL forwarding: upstreams are selected from local GitHub
 // deployment catalog and methods are strictly read-only.
 if(pathname==="/api/xeta/v1/rpc/read"){
  if(req.method!=="POST")return send(405,{ok:false,error:"POST required"});
  try{
   let payload="";
   for await(const part of req){
    payload+=part.toString("utf8");
    if(Buffer.byteLength(payload)>8192)return send(413,{ok:false,error:"RPC request too large"});
   }
   const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
   const result=await proxyCatalogRpcRead({catalog,request:JSON.parse(payload)});
   return send(200,{jsonrpc:"2.0",id:1,result});
  }catch(error){
   const invalid=error?.httpStatus===400;
   if(invalid)return send(400,{ok:false,error:String(error.message).slice(0,130)});
   const info=reportRpcReadFailure(error);
   return send(503,{ok:false,error:"Verified chain RPC unavailable",...info});
  }
 }
 if(req.method!=="GET"||!(pathname==="/api/xeta/v1/metrics/toplist"||pathname==="/api/xeta/v1/visibility"||pathname==="/health"||pathname.startsWith("/api/xeta/v1/systems/")||(pathname==="/api/xeta/v1/transfer/recovery"||pathname==="/api/xeta/v1/transfer/health"||pathname==="/api/xeta/v1/transfers/wallet"||pathname==="/api/xeta/v1/transfers/discovery"||pathname==="/api/xeta/v1/transfers/stats")))
  return send(404,{ok:false,error:"Not found"});
 if(pathname==="/health")return send(200,{ok:true,service:"xita-metrics",mode:"read-only"});
 if(pathname==="/api/xeta/v1/transfer/health"){
  // This checks installation prerequisites, not availability of BLS quorum.
  // It must not depend on the mutable token catalog or market index.
  const script=existsSync(resolve(root,"runtime/native-relayer/recover-iln.mjs"));
  const ethers=existsSync(resolve(root,"runtime/native-relayer/node_modules/ethers/package.json"));
  const configured=script&&ethers;
  return send(configured?200:503,{ok:configured,
   proofBuilder:configured?"installed":"unavailable",
   ...(configured?{}:{reason:!script?"recovery-script-missing":"ethers-package-missing"})});
 }
 try{
  const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
  if(pathname==="/api/xeta/v1/transfer/recovery"){
   const route=parsed.searchParams.get("route"),messageId=parsed.searchParams.get("messageId"),asset=parsed.searchParams.get("asset");
   const sourceTxHash=parsed.searchParams.get("sourceTxHash");
   try{
    const result=await serveUnsignedTransferRecovery({catalog,route,messageId,asset,sourceTxHash});
    return send(result.code,result.body);
   }catch(error){
    const reason=/^PROOF_[A-Z_]{3,40}$/.test(error?.code||"")?error.code:"PROOF_NOT_READY";
    return send(503,{ok:false,status:"UNAVAILABLE",reason,
      ...(/^[a-z][a-z0-9-]{1,54}$/.test(error?.stage||"")?{stage:error.stage}:{}),
      error:"Unsigned destination proof unavailable. Original source transfer remains confirmed; do not lock again."});
   }
  }
  if(pathname==="/api/xeta/v1/transfers/discovery"){
   const account=parsed.searchParams.get("account");
   if(!/^0x[0-9a-f]{40}$/i.test(account||""))
    return send(400,{ok:false,error:"Valid EVM wallet address required"});
   try{
    const result=await cachedExplorerWallet({catalog,account});
    return send(200,{ok:true,kind:"xita-explorer-wallet-discovery-v1",
     wallet:account.toLowerCase(),...result,
     note:"Explorer candidates are never authority for delivery or wallet signatures."});
   }catch{
    return send(503,{ok:false,status:"unavailable",
     error:"Explorer wallet discovery temporarily unavailable"});
   }
  }
  if(pathname==="/api/xeta/v1/transfers/wallet"){
   const account=parsed.searchParams.get("account");
   if(!/^0x[0-9a-f]{40}$/i.test(account||""))
    return send(400,{ok:false,error:"Valid EVM wallet address required"});
   try{
    const result=await readWalletTransferIndex(catalog,account,{
     onlyPending:parsed.searchParams.get("pending")==="1"});
    return send(result.status==="unavailable"?503:200,{ok:result.status!=="unavailable",...result});
   }catch{
    return send(503,{ok:false,error:"Finalized wallet transfer index unavailable"});
   }
  }
  if(pathname==="/api/xeta/v1/transfers/stats"){
   try{
    const result=await readTransferIndexStats(catalog);
    return send(result.status==="unavailable"?503:200,{ok:result.status!=="unavailable",...result});
   }catch{return send(503,{ok:false,error:"Finalized transfer statistics unavailable"});}
  }
  if(Date.now()>=cache.until){
   try{cache.snapshot=await getCoinGeckoPrices(catalog);cache.until=Date.now()+120000;}
   catch{cache.snapshot=null;cache.until=Date.now()+60000;}
  }
  const evidence=readEvidence();
  const metrics=projectMetrics(catalog,evidence,cache.snapshot);
  let positions=null;
  try{positions=await readPublicationPositions();}catch{ /* Not zero: public eligibility unavailable. */ }
  // Native and ERC20 positions must be produced by the local read-only
  // finalized escrow worker, never by an HTTP visitor or browser wallet.
  if(evidence?.custodyEvidence?.kind==="xita-verified-tvl-v1"){
   positions={...(positions||{}),...evidence.custodyEvidence.positions};
  }
  const visibility=derivedVisibility(catalog,positions);
  if(pathname==="/api/xeta/v1/visibility")return send(200,visibility);
  if(pathname.startsWith("/api/xeta/v1/systems/")){
   const chain=pathname.slice("/api/xeta/v1/systems/".length);
   if(!/^[a-z0-9-]{1,60}$/.test(chain))return send(404,{ok:false,error:"Unknown system"});
   const url=new URL(req.url,"http://localhost");
   const result=systemRanking(catalog,metrics,chain,{sort:url.searchParams.get("sort"),search:url.searchParams.get("q")||"",visibility});
   return result?send(200,result):send(404,{ok:false,error:"Unknown system"});
  }
  let history=null;
  try{
   // No receipt-backed routes means no valid historical collateral generation.
    if(Object.values(catalog.assets||{}).some(a=>isDeployedAsset(a,catalog))&&existsSync(historyPath)){
    const stat=statSync(historyPath);
    if(stat.isFile()&&stat.size<1200000){
     const value=JSON.parse(readFileSync(historyPath,"utf8"));
     if(value.kind==="xita-tvl-history-v1"&&value.schemaVersion===1&&Array.isArray(value.points))
      history={kind:value.kind,schemaVersion:1,points:value.points.filter(p=>
       typeof p.asOf==="string"&&Number.isFinite(Date.parse(p.asOf))&&
       typeof p.lockedUsd==="number"&&Number.isFinite(p.lockedUsd)&&p.lockedUsd>=0).map(p=>({asOf:p.asOf,lockedUsd:p.lockedUsd,assets:p.assets&&typeof p.assets==='object'?Object.fromEntries(Object.entries(p.assets).filter(([id,n])=>Object.hasOwn(catalog.assets||{},id)&&typeof n==='number'&&Number.isFinite(n)&&n>=0)):undefined})).slice(-6500)};
    }
   }
  }catch{/* No guessed chart points on invalid local history. */}
  // A previously verified asset remains discoverable as historic evidence when
  // current proof coverage temporarily drops out. It is NEVER marked live.
  if(history?.points?.length){
   const point=history.points.at(-1);
   const recent=Date.parse(point.asOf)>=Date.now()-90*86400000;
   if(recent){
    const single=Object.keys(catalog.assets||{}).length===1;
    metrics.lastVerifiedAssets={};
    for(const id of Object.keys(catalog.assets||{})){
     if(!isDeployedAsset(catalog.assets[id],catalog))continue;
     const amount=point.assets?.[id]??(single?point.lockedUsd:null);
     if(typeof amount==="number"&&Number.isFinite(amount)&&amount>=0&&
       (point.assets?.[id]!==undefined||single))
      metrics.lastVerifiedAssets[id]={lockedUsd:amount,asOf:point.asOf};
    }
   }
  }
  // The cumulative USD valuation is persisted by the background TVL worker.
  // This read never triggers an RPC call or a new database scan.
  let totalMoved=null;
  try{
   if(Object.values(catalog.assets||{}).some(a=>isDeployedAsset(a,catalog))&&existsSync(movedHistoryPath)){
    const stat=statSync(movedHistoryPath);
    if(stat.isFile()&&stat.size<1200000){
     const value=JSON.parse(readFileSync(movedHistoryPath,"utf8"));
     if(value?.kind==="xita-total-moved-history-v1"&&value.schemaVersion===1&&
        value.status==="verified"&&Number.isFinite(value.totalUsd)&&value.totalUsd>=0&&
        Array.isArray(value.points)){
      totalMoved={kind:value.kind,status:"verified",asOf:value.asOf,totalUsd:value.totalUsd,
       lastVerified24h:value.lastVerified24h&&Number.isFinite(value.lastVerified24h.movedUsd)&&
        value.lastVerified24h.movedUsd>=0&&Number.isFinite(Date.parse(value.lastVerified24h.asOf))?
        {movedUsd:value.lastVerified24h.movedUsd,asOf:value.lastVerified24h.asOf}:null,
       points:value.points.filter(p=>typeof p?.asOf==="string"&&
        Number.isFinite(Date.parse(p.asOf))&&Number.isFinite(p.totalUsd)&&p.totalUsd>=0)
        .map(p=>({asOf:p.asOf,totalUsd:p.totalUsd})).slice(-6500)};
      if(!Number.isFinite(Date.parse(totalMoved.asOf))||
        Date.now()-Date.parse(totalMoved.asOf)>180000||Date.parse(totalMoved.asOf)>Date.now()+30000)
       totalMoved=null;
     }
    }
   }
  }catch{totalMoved=null;}
  // Independent 24h collateral delta comes from the SAME worker evidence.
  // Keep a compact reason when the canonical historical anchor is unknown.
  const rawChange=evidence?.indexedChange24h;
  const indexedChange24h=rawChange?.kind==="indexed-tvl-change-24h-v1"&&
   rawChange?.status==="verified"&&rawChange.asOf===evidence.asOf&&
   rawChange.pricing==="current-reference-price"&&
   Number.isFinite(rawChange.percent)&&Number.isFinite(rawChange.openingUsd)&&
   rawChange.openingUsd>0&&Number.isFinite(rawChange.currentUsd)&&rawChange.currentUsd>=0&&
   Number.isFinite(metrics?.indexedTvl?.lockedUsd)&&
   Math.abs(rawChange.currentUsd-metrics.indexedTvl.lockedUsd)<=
    Math.max(.02,metrics.indexedTvl.lockedUsd*.00001)?
   {status:"verified",kind:rawChange.kind,asOf:rawChange.asOf,percent:rawChange.percent,
    openingUsd:rawChange.openingUsd,pricing:rawChange.pricing}:
   {status:"unavailable",reason:typeof rawChange?.reason==="string"?
    rawChange.reason:"24h-canonical-history-incomplete"};
  // Series comes only from the already-materialized, finalized SQL index in
  // the trusted worker evidence. No HTTP-triggered queries or new RPC calls.
  let reconstructedHistory=null;
  const reconstructed=evidence?.reconstructedHistory;
  if(reconstructed?.kind==="indexed-escrow-reconstruction-v1"&&
    ["verified","partial"].includes(reconstructed.status)&&
    reconstructed.pricing==="current-reference-price"&&
    reconstructed.asOf===evidence.asOf&&
    Array.isArray(reconstructed.points)&&reconstructed.points.length<=745){
   const points=reconstructed.points;
   if(points.every(p=>Number.isFinite(Date.parse(p?.asOf))&&
    Number.isFinite(p?.lockedUsd)&&p.lockedUsd>=0&&
    Number.isFinite(p?.movedWindowUsd)&&p.movedWindowUsd>=0)&&
    points.every((p,i)=>!i||(Date.parse(p.asOf)>Date.parse(points[i-1].asOf)&&
      p.movedWindowUsd>=points[i-1].movedWindowUsd))){
    reconstructedHistory={kind:reconstructed.kind,status:reconstructed.status,
     asOf:reconstructed.asOf,pricing:reconstructed.pricing,
     unknownTime:reconstructed.unknownTime,unknown24h:reconstructed.unknown24h,
     windowDays:reconstructed.windowDays,
     points:points.map(p=>({asOf:p.asOf,lockedUsd:p.lockedUsd,
      movedWindowUsd:p.movedWindowUsd}))};
   }
  }
  // Gross volume is reconstructed independently of the collateral opening
  // balance. A TVL deficit must not suppress canonical transaction history.
  let reconstructedMoved=null;
  const moved=evidence?.reconstructedMoved;
  if(moved?.kind==="indexed-gross-movement-history-v1"&&
    ["verified","partial"].includes(moved.status)&&
    moved.pricing==="current-reference-price"&&moved.asOf===evidence.asOf&&
    Array.isArray(moved.points)&&moved.points.length>=2&&moved.points.length<=745&&
    moved.points.every(p=>Number.isFinite(Date.parse(p.asOf))&&
      Number.isFinite(p.movedWindowUsd)&&p.movedWindowUsd>=0)&&
    moved.points.every((p,i)=>!i||(
      Date.parse(p.asOf)>Date.parse(moved.points[i-1].asOf)&&
      p.movedWindowUsd>=moved.points[i-1].movedWindowUsd))){
   reconstructedMoved={kind:moved.kind,status:moved.status,pricing:moved.pricing,
    asOf:moved.asOf,unknownTime:moved.unknownTime,
    points:moved.points.map(p=>({asOf:p.asOf,movedWindowUsd:p.movedWindowUsd}))};
  }
  if(totalMoved&&reconstructedMoved){
   const points=reconstructedMoved.points;
   const end=points.at(-1).movedWindowUsd;
   // An observed cumulative USD total may use historic prices. An anchored
   // current-price window is valid ONLY with a nonnegative opening balance.
   const base=totalMoved.totalUsd-end;
   if(Number.isFinite(base)&&base>=-0.000001){
    const values=points.map(p=>({asOf:p.asOf,totalUsd:Math.max(0,base+p.movedWindowUsd)}));
    totalMoved.reconstructed={status:reconstructedMoved.status,
     pricing:reconstructedMoved.pricing,asOf:reconstructedMoved.asOf,
     unknownTime:reconstructedMoved.unknownTime,points:values};
   }else totalMoved.reconstructionUnavailable="historical-price-basis-incompatible";
  }else if(totalMoved){
   totalMoved.reconstructionUnavailable=moved?.reason||"indexed-movement-timestamps-unavailable";
  }
  return send(200,{...metrics,visibility,history,reconstructedHistory,indexedChange24h,
   historyCoverage:{status:reconstructedHistory?.status||"unavailable",
    reason:reconstructedHistory?null:reconstructed?.reason||"historical-index-incomplete",
    windowDays:reconstructedHistory?.windowDays||null,
    unknown24h:reconstructedHistory?.unknown24h??null},
   totalMoved});
 }catch(error){
  // Never expose filesystem paths or stale statistics after a verification error.
  return send(503,{ok:false,error:"Trusted metrics evidence unavailable or invalid"});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error("Invalid port");
 createServer((req,res)=>{void handler(req,res)}).listen(PORT,HOST,()=>{
  console.log("XITA metrics read-only at http://"+HOST+":"+PORT);
 });
}
