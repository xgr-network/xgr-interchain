import http from "node:http";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildPlan,renderStepCommand} from "./plan.mjs";

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
 ["/admin/style.css",["style.css","text/css; charset=utf-8"]]
]);
http.createServer(async(req,res)=>{
 if(req.method!=="GET")return reply(res,405,{ok:false,error:"Read-only console"});
 const path=new URL(req.url,"http://localhost").pathname;
 try{
  const file=staticFiles.get(path);
  if(file)return reply(res,200,readFileSync(resolve(dir,file[0]),"utf8"),file[1]);
  if(path==="/admin/api/plan"){
   const steps=buildPlan(inventory()).map(s=>({...s,command:renderStepCommand(s)}));
   return reply(res,200,{ok:true,steps,mode:"read-only",governance:"validator quorum only"});
  }
  if(path==="/admin/api/preflight")return reply(res,200,{ok:true,...await preflight(inventory())});
  return reply(res,404,{ok:false,error:"Not found"});
 }catch(e){
  console.error("Interchain admin:",e);
  return reply(res,503,{ok:false,error:"Configuration or RPC unavailable"});
 }
}).listen(port,host,()=>console.log("Interchain admin read-only at "+host+":"+port));
