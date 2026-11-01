// Restricted one-shot creator canary: exercises the real email-verified
// registration path without changing the public Join service, running a
// signer, or creating an on-chain transaction.
import {readFileSync,statSync} from "node:fs";
import {resolve,sep} from "node:path";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {handleCreator,normalizeCreatorApplication} from "./creator-registration.mjs";
import {privateLocation} from "./private-store.mjs";
import {mailConfigured} from "./mail-gateway.mjs";

const usage="Usage: node services/onboarding/creator-canary.mjs /var/lib/xita/join/canary-request.json [--send-confirmation]";
const fail=message=>{throw Error(message)};
export function readCanaryInput(path,env=process.env){
 const base=privateLocation(env),full=resolve(path||"");
 if(!path||!full.startsWith(base+sep)||!full.endsWith(".json"))
  fail("Canary request must be a JSON file beneath the private Join directory");
 const info=statSync(full);
 if(!info.isFile()||(info.mode&0o077)!==0)fail("Canary JSON must be a private 0600 file");
 if(info.size>185000)fail("Canary request exceeds 180 KB");
 const data=JSON.parse(readFileSync(full,"utf8"));
 if(data.name!=="XITA Canary"||data.symbol!=="XITACAN")
  fail("Only the reviewed XITA Canary / XITACAN test identity is allowed");
 if(data.tokenType!=="burnable"||Number(data.decimals)!==18||
    String(data.initialSupply)!=="1000"||data.permit!==false)
  fail("XITA Canary must use Burnable, 18 decimals, 1000 initial tokens, no Permit");
 const result=normalizeCreatorApplication(data);
 return {input:data,record:result.record};
}
export async function submitCanary(input,{env=process.env,deliver}={}){
 if(env.XITA_CREATOR_PUBLIC_ENABLED==="true")
  fail("Public Creator is already enabled; internal canary path is only for prelaunch");
 if(!mailConfigured(env)&&!deliver)
  fail("Join email transport is not configured");
 // This is the sole scoped override. No public HTTP service, systemd unit,
 // fee-wallet environment, or privileged creator worker receives this flag.
 const isolated={...env,XITA_CREATOR_PUBLIC_ENABLED:"true"};
 const server=createServer((req,res)=>{
  Promise.resolve(handleCreator(req,res,{env:isolated,...(deliver?{deliver}:{})}))
   .catch(()=>{if(!res.headersSent){res.writeHead(500);res.end()}});
 });
 await new Promise((ok,no)=>{server.once("error",no);server.listen(0,"127.0.0.1",ok)});
 try{
  const url="http://127.0.0.1:"+server.address().port+"/api/xita/creator/register";
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(input),signal:AbortSignal.timeout(30000)});
  const body=await r.json();
  if(r.status!==202||body?.status!=="pending-email")
   fail("Canary registration rejected (HTTP "+r.status+"): "+String(body?.error||"unknown"));
  return {ok:true,status:body.status,notice:"Confirmation email submitted; token worker remains disabled"};
 }finally{
  await new Promise(done=>server.close(done));
 }
}
async function main(args){
 if(args.length<1||args.length>2||args.some(x=>x==="--help"||x==="-h"))
  fail(usage);
 const [path,option]=args;
 if(option&&option!=="--send-confirmation")fail(usage);
 const {input,record}=readCanaryInput(path);
 // Do not queue a canary while an active periodic signer could pick it up.
 try{
  execFileSync("systemctl",["is-active","--quiet","xita-creator-operator.timer"],
   {timeout:2500,stdio:"ignore"});
  fail("Creator timer is active; stop the signer before a canary registration");
 }catch(e){
  if(String(e.message||e).includes("Creator timer is active"))throw e;
 }
 if(process.env.XITA_CREATOR_ENABLED==="true")
  fail("Refusing to run internal canary while Creator signing is enabled");
 const preview={token:record.name,symbol:record.symbol,owner:record.ownerAddress,
  initialSupply:record.initialSupply,decimals:record.decimals,
  type:record.tokenType,status:"validated-offline"};
 if(!option){process.stdout.write(JSON.stringify(preview,null,2)+"\n");return}
 const done=await submitCanary(input);
 process.stdout.write(JSON.stringify({...preview,...done},null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main(process.argv.slice(2)).catch(e=>{
  console.error("Creator Canary:",String(e.message||e));
  process.exitCode=1;
 });
}
