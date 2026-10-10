import http from "node:http";
import {readFileSync,writeFileSync,mkdirSync,renameSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {inspectContract} from "./inspector.mjs";
import {getJobs,recordJobEvent} from "./github-jobs.mjs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildPlan,renderStepCommand} from "./plan.mjs";
import {readOnlyWorkQueue,assertCurrentMain} from "./main-gate.mjs";
import {infrastructureInventory,verifyChainInfrastructure} from "./chain-state.mjs";
import {buildWorkItems} from "./work-items.mjs";
import {bootstrapPlan,readLiveBootstrap} from "./bootstrap.mjs";
import {inspectConfiguredChain} from "./chain-preflight.mjs";
import {buildFirstChainDeploymentPlan} from "./deployment-sequence.mjs";
import {deploymentJournal} from "./deployment-journal.mjs";
import {readDeploymentReadiness} from "./deployment-readiness.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const host=process.env.XGR_ADMIN_HOST||"127.0.0.1";
const port=Number(process.env.XGR_ADMIN_PORT||4087);
if(!["127.0.0.1","::1"].includes(host))throw Error("Admin must bind to loopback");
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("Invalid admin port");
const load=path=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
function inventory(){
 const chains={},infrastructure={};
 for(const name of ["xgrchain","base"]){
  chains[name]=load("config/chains/"+name+".json");
  infrastructure[name]=load("deployments/mainnet/infrastructure/"+name+".json");
 }
 return {schemaVersion:1,chains,infrastructure,assets:{XGR:{routes:load("config/assets/XGR/routes.json")}}};
}
const dataDir=process.env.XGR_ADMIN_STATE_DIR||resolve(root,"runtime-state/admin");
const statePath=resolve(dataDir,"progress.json");
function readState(){
 try{return JSON.parse(readFileSync(statePath,"utf8"))}
 catch(e){if(e.code==="ENOENT")return {version:1,records:{},history:[]};throw e}
}
function writeState(state){
 mkdirSync(dataDir,{recursive:true,mode:0o700});
 const tmp=resolve(dataDir,"."+randomUUID()+".tmp");
 writeFileSync(tmp,JSON.stringify(state,null,2)+"\n",{mode:0o600,flag:"wx"});
 renameSync(tmp,statePath);
}
function security(req){
 const hostHeader=String(req.headers.host||"");
 const external=/^xita\.xgr\.network(?::443)?$/i.test(hostHeader);
 if(!external&&!/^127\.0\.0\.1(?::4087)?$/.test(hostHeader)&&!/^localhost(?::4087)?$/.test(hostHeader))throw Error("Invalid Host");
 const origin=req.headers.origin;
 if(origin&&origin!=="https://xita.xgr.network")throw Error("Invalid Origin");
 if(req.headers["sec-fetch-site"]&&req.headers["sec-fetch-site"]==="cross-site")throw Error("Cross-site request blocked");
}
async function bodyJSON(req){
 if(!req.headers["content-type"]?.startsWith("application/json"))throw Error("JSON required");
 let chunks=[],length=0;
 for await(const chunk of req){length+=chunk.length;if(length>8192)throw Error("Request too large");chunks.push(chunk)}
 return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
const evidenceKinds=new Set(["bls_base","bindings","governance_xgr","bootstrap_xgr","governance_base","bootstrap_base","e2e_outbound","e2e_return","publish"]);
function present(s){
 return {completed:Object.entries(s.records).filter(([,v])=>v.status==="recorded").length,records:s.records,history:s.history.slice(-35)};
}
function prereqs(steps,state,id){
 const step=steps.find(x=>x.id===id);if(!step)throw Error("Unknown step");
 const missing=step.dependsOn.filter(d=>state.records[d]?.status!=="recorded");
 if(missing.length)throw Error("Dependencies not completed: "+missing.join(", "));
 return step;
}
let writeBusy=false;
async function mutate(fn){
 if(writeBusy)throw Error("Progress update already running");
 writeBusy=true;
 try{const s=readState(),result=await fn(s);writeState(s);return result}
 finally{writeBusy=false}
}
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY",
 "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'"};
function reply(res,status,data,type="application/json; charset=utf-8"){
 res.writeHead(status,{"Content-Type":type,...headers});
 res.end(typeof data==="string"?data:JSON.stringify(data));
}
async function probe(url,method,params){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),5000);
 try{
  const response=await fetch(url,{method:"POST",signal:controller.signal,
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
  if(!response.ok)throw Error("RPC HTTP "+response.status);
  const result=await response.json();
  if(result.error)throw Error("RPC error");
  return result.result;
 }finally{clearTimeout(timeout)}
}
async function preflight(catalog){
 const results=[];
 for(const name of ["xgrchain","base"]){
  const chain=catalog.chains[name],infra=catalog.infrastructure[name];
  const status={name,expectedChainId:chain.chainId,chainIdOk:false,mailboxCode:false,hookCode:false};
  try{
   const url=chain.rpcUrls?.[0];
   if(typeof url!=="string"||!url.startsWith("https://"))throw Error("Invalid configured RPC");
   const actual=await probe(url,"eth_chainId",[]);
   status.chainIdOk=BigInt(actual)===BigInt(chain.chainId);
   if(!status.chainIdOk)throw Error("RPC chain ID mismatch");
   const [mailbox,hook]=await Promise.all([
    probe(url,"eth_getCode",[infra.hyperlaneCore.mailbox,"latest"]),
    probe(url,"eth_getCode",[infra.hyperlaneCore.merkleTreeHook,"latest"])
   ]);
   status.mailboxCode=typeof mailbox==="string"&&mailbox!=="0x";
   status.hookCode=typeof hook==="string"&&hook!=="0x";
  }catch(e){status.error=String(e.message).slice(0,180)}
  results.push(status);
 }
 return {checkedAt:new Date().toISOString(),results,ready:results.every(r=>r.chainIdOk&&r.mailboxCode&&r.hookCode),
  note:"Checks RPC identity and contract code only; not BLS, governance or custody."};
}
const dir=dirname(fileURLToPath(import.meta.url));
const staticFiles=new Map([
 ["/admin/",["index.html","text/html; charset=utf-8"]],
 ["/admin/admin.js",["admin.js","text/javascript; charset=utf-8"]],
 ["/admin/style.css",["style.css","text/css; charset=utf-8"]],
 ["/admin/wallet.js",["wallet.js","text/javascript; charset=utf-8"]]
]);
http.createServer(async(req,res)=>{
 try{security(req)}catch(e){return reply(res,403,{ok:false,error:e.message})}
 if(!["GET","POST"].includes(req.method))return reply(res,405,{ok:false,error:"Unsupported method"});
 const path=new URL(req.url,"http://localhost").pathname;
 try{
  const file=req.method==="GET"?staticFiles.get(path):null;
  if(file)return reply(res,200,readFileSync(resolve(dir,file[0]),"utf8"),file[1]);
  if(req.method==="GET"&&path==="/admin/api/workqueue"){
   const queue=await readOnlyWorkQueue(root);
   const infrastructure=infrastructureInventory(root,queue.inventory.chains);
   const bootstrap=queue.inventory.chains.map(chain=>bootstrapPlan(root,chain));
   return reply(res,200,{ok:true,...queue,infrastructure,bootstrap,workItems:buildWorkItems(queue.inventory,infrastructure,bootstrap)});
  }
  if(req.method==="GET"&&path==="/admin/api/balance"){
   const queue=await readOnlyWorkQueue(root);
   const url=new URL(req.url,"http://localhost");
   const name=url.searchParams.get("chain"),address=url.searchParams.get("address");
   if(!/^0x[a-fA-F0-9]{40}$/.test(address||""))throw Error("Invalid wallet address");
   const chain=queue.inventory.chains.find(c=>c.name===name);
   if(!chain)throw Error("Chain not approved in current main");
   const rpcUrl=chain.rpcUrls?.[0];
   if(!/^https:\/\//.test(rpcUrl||""))throw Error("Invalid approved RPC");
   const [chainId,balance]=await Promise.all([probe(rpcUrl,"eth_chainId",[]),probe(rpcUrl,"eth_getBalance",[address,"latest"])]);
   if(BigInt(chainId)!==BigInt(chain.chainId)||!/^(0x)[0-9a-f]+$/i.test(balance||""))throw Error("Invalid RPC identity or balance");
   return reply(res,200,{ok:true,chain:name,chainId:chain.chainId,address,balance});
  }
  if(req.method==="GET"&&path==="/admin/api/bootstrap"){
   const queue=await readOnlyWorkQueue(root);
   const infrastructure=infrastructureInventory(root,queue.inventory.chains);
   const bootstrap=queue.inventory.chains.map(chain=>bootstrapPlan(root,chain));
   const name=new URL(req.url,"http://localhost").searchParams.get("chain");
   if(name&&!queue.inventory.chains.some(c=>c.name===name))throw Error("Unknown main-approved chain");
   const requested=name?bootstrap.filter(c=>c.chain===name):bootstrap;
   const results=await Promise.all(requested.map(async plan=>{
    try{return await readLiveBootstrap(plan,infrastructure,queue.inventory.chains)}
    catch(e){return {...plan,verified:false,error:String(e.message).slice(0,160),missing:[...plan.missing,"On-chain bootstrap verification unavailable"]}}
   }));
   return reply(res,200,{ok:true,commit:queue.commit,bootstrap:results});
  }
  if(req.method==="GET"&&path==="/admin/api/infrastructure"){
   const queue=await readOnlyWorkQueue(root);
   const configured=infrastructureInventory(root,queue.inventory.chains);
   return reply(res,200,{ok:true,commit:queue.commit,chains:await verifyChainInfrastructure(configured)});
  }
  if(req.method==="GET"&&path==="/admin/api/chain-preflight"){
   const queue=await readOnlyWorkQueue(root);
   const name=new URL(req.url,"http://localhost").searchParams.get("chain");
   const chain=queue.inventory.chains.find(c=>c.name===name);
   if(!chain)throw Error("Chain is not in GitHub main");
   const observed=infrastructureInventory(root,[chain])[0];
   const bootstrap=bootstrapPlan(root,chain);
   const preflight=await inspectConfiguredChain({chain,core:observed.hyperlane,
    bootstrap});
   return reply(res,200,{ok:true,commit:queue.commit,preflight});
  }
  if(req.method==="GET"&&path==="/admin/api/deployment-readiness"){
   const queue=await readOnlyWorkQueue(root);
   const name=new URL(req.url,"http://localhost").searchParams.get("chain");
   const chain=queue.inventory.chains.find(c=>c.name===name);
   if(!chain)throw Error("Chain is not approved by GitHub main");
   const boot=bootstrapPlan(root,chain);
   const baseDir=process.env.XITA_PUBLIC_BOOTSTRAP_DIR||
     resolve(process.env.HOME||"/nonexistent","xita-bootstrap-public");
   const readiness=await readDeploymentReadiness({root,chain,inventory:queue.inventory,
    boot,baseDir,mainCurrent:queue.githubApproved});
   return reply(res,200,{ok:true,commit:queue.commit,readiness});
  }
  if(req.method==="GET"&&path==="/admin/api/first-deploy"){
   const queue=await readOnlyWorkQueue(root);
   const infrastructure=infrastructureInventory(root,queue.inventory.chains);
   const bootstrap=queue.inventory.chains.map(chain=>bootstrapPlan(root,chain));
   return reply(res,200,{ok:true,commit:queue.commit,readOnly:true,
    ...buildFirstChainDeploymentPlan(queue.inventory,infrastructure,bootstrap),
    journal:deploymentJournal({dir:resolve(dataDir,"deployments"),chains:queue.inventory.chains}).read()});
  }
  if(req.method==="GET"&&path==="/admin/api/plan"){
   const steps=buildPlan(inventory()).map(s=>({...s,command:renderStepCommand(s)}));
   return reply(res,200,{ok:true,steps,mode:"read-only",governance:"validator quorum only"});
  }
  if(req.method==="GET"&&path==="/admin/api/jobs")return reply(res,200,{ok:true,jobs:await getJobs()});
  if(req.method==="POST"&&path==="/admin/api/jobs/status"){
   await assertCurrentMain(root);
   const data=await bodyJSON(req);
   return reply(res,200,{ok:true,...await recordJobEvent(data.number,data.status,data.evidence)});
  }
  if(req.method==="GET"&&path==="/admin/api/progress")return reply(res,200,{ok:true,...present(readState())});
  if(req.method==="GET"&&path==="/admin/api/preflight")return reply(res,200,{ok:true,...await preflight(inventory())});
  if(req.method==="POST"&&path==="/admin/api/inspect"){
   await assertCurrentMain(root);
   const input=await bodyJSON(req);
   if(!/^(verifier_base|registry_xgr|registry_base|iln_xgr|iln_base|ism_xgr|ism_base|router_xgr|router_base|gateway_xgr|gateway_base)$/.test(input?.id||""))throw Error("Unknown component");
   const catalog=inventory(),steps=buildPlan(catalog),step=steps.find(s=>s.id===input.id);
   const state=readState();
   prereqs(steps,state,step.id);
   const known=Object.fromEntries(Object.entries(state.records).map(([id,v])=>[id,v.observation||{}]));
   const observation=await inspectContract({catalog,step,address:input.address,txHash:input.txHash||null,known});
   const status=observation.status==="onchain-observed"?"onchain-observed":"needs-review";
   const result=await mutate(s=>{
    s.records[step.id]={status,observation,updatedAt:new Date().toISOString()};
    s.history.push({at:new Date().toISOString(),id:step.id,action:"onchain-inspection",status});
    return observation;
   });
   return reply(res,200,{ok:true,observation:result});
  }
  if(req.method==="POST"&&path==="/admin/api/evidence"){
   await assertCurrentMain(root);
   const input=await bodyJSON(req),id=String(input.id||"");
   const steps=buildPlan(inventory());
   if(!evidenceKinds.has(id))throw Error("Unsupported evidence step");
   const s=readState();prereqs(steps,s,id);
   const reference=String(input.reference||"").trim();
   if(reference.length<15||reference.length>500||!/^https:\/\/[^\s]+$/.test(reference))throw Error("A valid evidence URL is required");
   const note=String(input.note||"").trim();
   if(note.length<20||note.length>1500)throw Error("A specific verification description (20–1500 characters) is required");
   const result=await mutate(state=>{
    const proof={kind:"operator-evidence",reference,note,recordedAt:new Date().toISOString(),verified:false};
    state.records[id]={status:"awaiting-independent-review",proof,updatedAt:proof.recordedAt};
    state.history.push({at:proof.recordedAt,id,action:"evidence-submitted",status:"awaiting-independent-review"});
    return proof;
   });
   return reply(res,200,{ok:true,proof:result});
  }
  return reply(res,404,{ok:false,error:"Not found"});
 }catch(e){
  console.error("Interchain admin:",e);
  return reply(res,e.message?.includes("Dependencies")?409:400,{ok:false,error:String(e.message||"Request failed").slice(0,260)});
 }
}).listen(port,host,()=>console.log("Interchain admin read-only at "+host+":"+port));
