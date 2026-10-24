// XITA operations diagnostics. Read-only, loopback-only and free of credentials.
// Deployment authority, source transfers and validator quorum are never touched.
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFileSync,statSync} from "node:fs";
import {probeILNValidators,attachXitaReferenceLag} from "./validator-indexer-health.mjs";

const execFileAsync=promisify(execFile);
export const UNITS=Object.freeze([
 {id:"admin",title:"Admin API",group:"Core",unit:"xita-admin.service"},
 {id:"web-proxy",title:"Nginx HTTPS Gateway",group:"Core",unit:"nginx.service"},
 {id:"postgresql",title:"PostgreSQL",group:"Core",unit:"postgresql.service"},
 {id:"metrics-api",title:"XITA Metrics / Proof Builder API",group:"Indexer",unit:"xita-indexer.service"},
 {id:"transfer-worker",title:"XITA Transfer Index Worker",group:"Indexer",unit:"xita-transfer-indexer.service"},
 {id:"transfer-intake",title:"TX Announcement Intake",group:"Indexer",unit:"xita-transfer-intake.service",optional:true},
 {id:"tvl-worker",title:"Verified TVL Worker",group:"Indexer",unit:"xita-tvl.service",optional:true},
 {id:"quote",title:"Fee Quote Signer",group:"Managed Services",unit:"xita-interchain-fee-quote.service",optional:true},
 {id:"preview",title:"Fee Preview",group:"Managed Services",unit:"xita-fee-preview.service",optional:true},
 {id:"managed-relayer",title:"Managed Relay Worker",group:"Managed Services",unit:"xita-managed-relayer.service",optional:true},
 {id:"gas-sponsor",title:"Gas Sponsoring Timer",group:"Managed Services",unit:"xita-gas-sponsor.timer",optional:true},
 {id:"fee-claim",title:"Fee Claim Timer",group:"Managed Services",unit:"xita-interchain-fee-claim.timer",optional:true},
 {id:"join",title:"Join Application API",group:"Onboarding",unit:"xita-join.service",optional:true},
 {id:"join-notifier",title:"Join Status Notification Timer",group:"Onboarding",unit:"xita-join-notifier.timer",optional:true},
 {id:"deployment-sync",title:"GitHub Receipt Sync Watcher",group:"Operations",unit:"xita-deployment-sync.path",optional:true},
 {id:"deployment-poll",title:"Deployment Sync Retry Timer",group:"Operations",unit:"xita-deployment-sync-poll.timer",optional:true}
]);
const UNIT_NAMES=new Set(UNITS.map(x=>x.unit));
const HTTP_TARGETS=Object.freeze([
 {id:"indexer-api",title:"Indexer API",port:4088,path:"/health",group:"Indexer"},
 {id:"proof-builder",title:"Unsigned Proof Builder (installation)",port:4088,path:"/api/xeta/v1/transfer/health",group:"Indexer"},
 {id:"transfer-stats",title:"Transfer Index / Database",port:4088,path:"/api/xeta/v1/transfers/stats",group:"Indexer"},
 {id:"transfer-intake-api",title:"TX Announcement Intake",port:4089,path:"/health",group:"Indexer",optional:true},
 {id:"quote-api",title:"Fee Quote API",port:4092,path:"/api/xita/v1/managed/health",group:"Managed Services",optional:true},
 {id:"preview-api",title:"Fee Preview API",port:4093,path:"/api/xita/v1/managed/health",group:"Managed Services",optional:true},
 {id:"join-api",title:"Join Application Readiness",port:4090,path:"/api/xita/join/status",group:"Onboarding",optional:true}
]);
const safeNumber=x=>x===null||x===undefined||x===""?null:
 Number.isSafeInteger(Number(x))&&Number(x)>=0?Number(x):null;
const safeDate=x=>{
 if(typeof x!=="string")return null;
 const n=Date.parse(x);
 return Number.isFinite(n)?new Date(n).toISOString():null;
};
export function parseUnitShow(text,definition){
 if(typeof text!=="string"||text.length>16000)throw Error("Unexpected systemd reply");
 const fields=Object.fromEntries(text.split(/\r?\n/).filter(x=>x.includes("=")).map(x=>[x.slice(0,x.indexOf("=")),x.slice(x.indexOf("=")+1)]));
 const load=fields.LoadState,active=fields.ActiveState,sub=fields.SubState||null;
 const unitFileState=fields.UnitFileState||null;
 let state="unknown";
 if(load==="not-found")state="not-installed";
 else if(load==="masked"||unitFileState==="masked")state="disabled";
 else if(load==="loaded"&&active==="active")state="ok";
 else if(load==="loaded"&&active==="failed")state="failed";
 else if(load==="loaded"&&active==="inactive"){
  // "inactive" alone is not a crash. In particular, fee Claim and Gas
  // Sponsoring timers are deliberately inactive under install-fee-preview.
  // A disabled unit is intentionally not scheduled; an *enabled* inactive
  // unit is unexpectedly stopped, but has not necessarily failed.
  state=unitFileState==="disabled"||unitFileState==="indirect"?"not-enabled":
   ["enabled","enabled-runtime","linked","linked-runtime"].includes(unitFileState)?"stopped":"inactive";
 }else if(load==="loaded"&&["activating","deactivating","reloading"].includes(active))
  state="warning";
 const timer=definition.unit.endsWith(".timer");
 const systemdTime=x=>typeof x==="string"&&x!=="n/a"&&x!=="0"&&x.length<110?x:null;
 return {
  id:definition.id,title:definition.title,group:definition.group,
  unit:definition.unit,optional:Boolean(definition.optional),
  state,active:active||null,sub,unitFileState,
  restarts:safeNumber(fields.NRestarts),
  ...(timer?{lastTrigger:systemdTime(fields.LastTriggerUSec),
   nextTrigger:systemdTime(fields.NextElapseUSecRealtime)}:{})
 };
}
export async function readSystemdUnit(unit){
 if(!UNIT_NAMES.has(unit))throw Error("Unrecognized monitoring unit");
 const {stdout}=await execFileAsync("systemctl",[
  "show",unit,"--no-pager","--property=LoadState,ActiveState,SubState,UnitFileState,NRestarts,LastTriggerUSec,NextElapseUSecRealtime"
 ],{timeout:2500,maxBuffer:16000,encoding:"utf8"});
 return stdout;
}
export async function readLocalJSON(target,{fetcher=globalThis.fetch,timeoutMs=3500}={}){
 if(!HTTP_TARGETS.some(x=>x.port===target.port&&x.path===target.path))
  throw Error("Unrecognized local monitoring endpoint");
 const response=await fetcher("http://127.0.0.1:"+target.port+target.path,{
  method:"GET",cache:"no-store",redirect:"error",
  signal:AbortSignal.timeout(timeoutMs),headers:{accept:"application/json"}
 });
 if(!response.ok)throw Error("Local service HTTP "+response.status);
 const raw=await response.text();
 if(raw.length>120000)throw Error("Local service response too large");
 const data=JSON.parse(raw);
 if(!data||typeof data!=="object"||Array.isArray(data)||data.ok!==true)
  throw Error("Local service did not return positive health");
 return data;
}
export function summarizeTransferIndex(stats,{now=Date.now(),staleMs=180000}={}){
 if(!stats||stats.ok!==true||!Array.isArray(stats.coverage?.routes))
  return {state:"unavailable",reason:"Transfer index or database did not respond",routes:[],
   indexedRoutes:null,requiredRoutes:null};
 const {coverage}=stats;
 const routes=coverage.routes.map(item=>{
  const updatedAt=safeDate(item.updatedAt);
  const ageMs=updatedAt?now-Date.parse(updatedAt):null;
  const scannedTo=safeNumber(item.scannedTo);
  const finalizedHead=safeNumber(item.finalizedHead);
  const lagBlocks=scannedTo===null||finalizedHead===null?null:
   Math.max(0,finalizedHead-scannedTo);
  let state="unknown";
  if(updatedAt&&ageMs>=-30000&&ageMs<=staleMs&&lagBlocks===0&&item.complete===true)
   state="ok";
  else if(updatedAt&&ageMs>=-30000&&ageMs<=staleMs&&lagBlocks!==null)
   state=lagBlocks>0?"catching-up":"warning";
  else if(ageMs!==null&&ageMs>staleMs)state="stalled";
  return {asset:String(item.asset||"").slice(0,48),source:String(item.source||"").slice(0,45),
   destination:String(item.destination||"").slice(0,45),
   route:String(item.route||"").slice(0,100),
   scannedTo,finalizedHead,lagBlocks,updatedAt,ageMs,state};
 });
 const indexedRoutes=safeNumber(coverage.indexedRoutes),requiredRoutes=safeNumber(coverage.requiredRoutes);
 let state="unknown";
 if(requiredRoutes===0)state="not-configured";
 else if(routes.length&&routes.every(r=>r.state==="ok")&&coverage.complete===true)state="ok";
 else if(routes.some(r=>r.state==="stalled"))state="stalled";
 else if(routes.length)state="warning";
 return {state,indexedRoutes,requiredRoutes,routes,
  reason:state==="ok"?"All configured route cursors are current":
   state==="stalled"?"At least one indexed route has a stale cursor":
   state==="not-configured"?"No deployed transfer routes":
   "Route scanning still incomplete, unverified or catching up"};
}
export function inspectEvidenceFile(path,{now=Date.now()}={}){
 try{
  const stat=statSync(path);
  if(!stat.isFile()||stat.size>2000000)return {status:"invalid",asOf:null,verifiedAssets:0};
  const doc=JSON.parse(readFileSync(path,"utf8"));
  if(doc?.schemaVersion!==1||doc?.kind!=="xita-asset-metrics-v1"||
    !doc.assets||typeof doc.assets!=="object"||Array.isArray(doc.assets))
   return {status:"invalid",asOf:null,verifiedAssets:0};
  const asOf=safeDate(doc.asOf);
  if(!asOf)return {status:"invalid",asOf:null,verifiedAssets:0};
  const age=now-Date.parse(asOf);
  const verifiedAssets=Object.values(doc.assets).filter(v=>v?.verified===true).length;
  return {status:age>=-30000&&age<=120000?"fresh":"stale",asOf,verifiedAssets};
 }catch(e){return {status:e?.code==="ENOENT"?"missing":"invalid",asOf:null,verifiedAssets:0};}
}
export function summarizeEvidence(result){
 if(!result||typeof result!=="object")return {state:"unknown",asOf:null};
 const raw=result.evidence;
 const state=["fresh","stale","missing","invalid"].includes(raw?.status)?raw.status:"unknown";
 return {state,asOf:safeDate(raw?.asOf),verifiedAssets:safeNumber(raw?.verifiedAssets)};
}
export async function probeChain(chain,{fetcher=globalThis.fetch,timeoutMs=3000}={}){
 const chainId=safeNumber(chain?.chainId);
 const rpcUrls=(chain?.rpcUrls||[]).filter(x=>typeof x==="string"&&
  /^https:\/\/[^/@?#]+(?:\/[^?#]*)?$/.test(x)).slice(0,4);
 const result={name:String(chain?.name||"unknown").slice(0,80),chainId,
  configuredEndpoints:rpcUrls.length,attempted:0,state:"unavailable",head:null};
 if(!chainId||!rpcUrls.length)return result;
 for(const url of rpcUrls){
  result.attempted++;
  try{
   const call=async(method)=>{
    const res=await fetcher(url,{method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({jsonrpc:"2.0",id:1,method,params:[]}),
     redirect:"error",signal:AbortSignal.timeout(timeoutMs)});
    if(!res.ok)throw Error("RPC HTTP unavailable");
    const data=await res.json();
    if(data.error||typeof data.result!=="string"||!/^0x[0-9a-f]+$/i.test(data.result))
     throw Error("Malformed RPC");
    return BigInt(data.result);
   };
   const identity=await call("eth_chainId");
   if(identity!==BigInt(chainId))throw Error("Unexpected RPC chain");
   const head=await call("eth_blockNumber");
   if(head>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Unsafe chain height");
   result.head=Number(head);
   result.state=result.attempted>1?"fallback":"ok";
   return result;
  }catch{}
 }
 return result;
}
function aggregateState(units,checks,indexer,chains){
 // Not-installed optional services are informational, not a green check.
 const relevant=units.filter(x=>!(x.optional&&
  ["not-installed","unknown","not-enabled","inactive"].includes(x.state)));
 const serious=relevant.some(x=>
  ["failed","stopped","disabled","not-installed"].includes(x.state))||
  checks.some(x=>x.state==="unavailable"&&!x.optional)||
  indexer.state==="stalled";
 const partial=serious||relevant.some(x=>x.state==="unknown"||x.state==="warning")||
  checks.some(x=>!x.optional&&["unavailable","warning"].includes(x.state))||
  (indexer.state!=="ok"&&indexer.state!=="not-configured")||
  chains.some(x=>!["ok","fallback"].includes(x.state));
 return serious?"degraded":partial?"warning":"ok";
}
export async function collectOperationsHealth({
 catalog,readUnit=readSystemdUnit,readHTTP=readLocalJSON,
 checkChain=probeChain,readEvidence=inspectEvidenceFile,checkValidators=probeILNValidators,now=Date.now()
}={}){
 if(!catalog||typeof catalog!=="object"||!catalog.chains)
  throw Error("Configured chain catalog unavailable");
 const [units,probes,chains]=await Promise.all([
  Promise.all(UNITS.map(async def=>{
   try{return parseUnitShow(await readUnit(def.unit),def)}
   catch{return {id:def.id,title:def.title,group:def.group,unit:def.unit,
    optional:Boolean(def.optional),state:"unknown",active:null,sub:null,restarts:null}}
  })),
  Promise.all(HTTP_TARGETS.map(async target=>{
   try{
    const data=await readHTTP(target);
    return {...target,state:"ok",data};
   }catch{
    return {...target,state:"unavailable",data:null};
   }
  })),
  Promise.all(Object.entries(catalog.chains).map(async ([name,c])=>{
   try{return await checkChain({...c,name})}
   catch{return {name,chainId:safeNumber(c?.chainId),
    configuredEndpoints:Array.isArray(c?.rpcUrls)?c.rpcUrls.length:0,
    attempted:0,head:null,state:"unavailable"}}
  }))
 ]);
 // Optional inactive components must not make a healthy deployment yellow.
 // Preserve the probe state if the endpoint responds despite missing systemd.
 const optionalServiceByProbe={
  "transfer-intake-api":"transfer-intake",
  "quote-api":"quote","preview-api":"preview","join-api":"join"
 };
 const observedProbes=probes.map(p=>{
  const unit=units.find(s=>s.id===optionalServiceByProbe[p.id]);
  if(p.optional&&unit?.state==="not-installed"&&p.state==="unavailable")
   return {...p,state:"not-installed"};
  // HTTP 200 with available:false means confirmed submissions are disabled.
  if(p.id==="join-api"&&p.state==="ok")
   return {...p,state:p.data?.available===true?"ok":"warning"};
  return p;
 });
 const api=observedProbes.find(p=>p.id==="indexer-api");
 const stats=observedProbes.find(p=>p.id==="transfer-stats");
 const indexer=summarizeTransferIndex(stats?.data,{now});
 const evidence=summarizeEvidence({evidence:readEvidence(process.env.XITA_METRICS_EVIDENCE||"/var/lib/xita/verified-tvl.json",{now})});
 const services=units.map(unit=>{
  const linked={admin:[], "metrics-api":["indexer-api","proof-builder","transfer-stats"],
   "transfer-intake":["transfer-intake-api"],quote:["quote-api"],preview:["preview-api"],
   join:["join-api"]}[unit.id]||[];
  const observed=observedProbes.filter(p=>linked.includes(p.id));
  let state=unit.state;
  if(unit.state==="ok"&&observed.some(p=>p.state!=="ok"))
   state="warning";
  if(unit.id==="transfer-worker"&&unit.state==="ok"&&["stalled","unavailable"].includes(indexer.state))
   state="warning";
  if(unit.id==="tvl-worker"&&unit.state==="ok"&&evidence.state!=="fresh")
   state="warning";
  return {...unit,state};
 });
 const checks=observedProbes.map(p=>({
  id:p.id,title:p.title,group:p.group,optional:Boolean(p.optional),
  state:p.state,
  ...(p.id==="proof-builder"&&p.data?{installationOnly:true}:{}),
  ...(p.id==="join-api"?{submissionsConfigured:p.state==="ok"&&p.data?.available===true}:{}),
  ...(p.id==="quote-api"&&p.data?{enabledChains:Array.isArray(p.data.enabledChains)?
   p.data.enabledChains.filter(x=>/^[a-z0-9-]+$/.test(x)).slice(0,20):[]}:{}),
 }));
 // Evidence is diagnostic: a responding API alone cannot establish that
 // the TVL/market verification worker has produced fresh evidence.
 const validators=await checkValidators({now});
 const baseStatus=aggregateState(services,checks,indexer,chains);
 const status=validators.some(v=>["unavailable","degraded","stalled"].includes(v.state))?"degraded":validators.some(v=>v.state!=="ok")&&baseStatus==="ok"?"warning":baseStatus;
 return {ok:true,kind:"xita-admin-operations-health-v1",
  checkedAt:new Date(now).toISOString(),status,
  services,checks,indexer,evidence,chains,validators,
  summary:{servicesHealthy:services.filter(s=>s.state==="ok").length,
   servicesInstalled:services.filter(s=>s.state!=="not-installed").length,
   servicesDown:services.filter(s=>["failed","stopped"].includes(s.state)).length,
   servicesNotInstalled:services.filter(s=>s.state==="not-installed").length,
   chainsReachable:chains.filter(c=>["ok","fallback"].includes(c.state)).length,
   chainsConfigured:chains.length,
   validatorsHealthy:validators.filter(v=>v.state==="ok").length,
   validatorsConfigured:validators.length},
  note:"Read-only observations. Process active, API answering and finalized indexing are separate signals. A healthy proof-builder installation does not establish validator quorum or delivered funds."};
}
