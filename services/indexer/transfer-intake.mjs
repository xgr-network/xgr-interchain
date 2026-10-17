#!/usr/bin/env node
// Isolated UNTRUSTED source-hash intake: INSERT privilege on one staging table.
// Wallet assertions are not authenticated here. A separate on-chain observer
// validates tx.from, canonical Gateway receipts and finality BEFORE publication.
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {configuredGatewayRoutes} from "../../apps/web/wallet-transfers.js";
const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const ADDRESS=/^0x[0-9a-f]{40}$/i, HASH=/^0x[0-9a-f]{64}$/i;
const ROUTE="/api/xeta/v1/transfers/announce";
const lower=x=>x.toLowerCase();
export function validateAnnouncement(value,catalog){
 if(!value||typeof value!=="object"||Array.isArray(value)||
   Object.keys(value).sort().join(",")!=="account,sourceChain,txHash"||
   !ADDRESS.test(value.account||"")||/^0x0{40}$/i.test(value.account)||
   !HASH.test(value.txHash||"")||
   !/^[a-z0-9-]{1,40}$/.test(value.sourceChain||"")||
   !configuredGatewayRoutes(catalog).some(r=>r.sourceChain===value.sourceChain))
  throw Error("Invalid wallet source transaction announcement");
 return {account:lower(value.account),sourceChain:value.sourceChain,txHash:lower(value.txHash)};
}
// Bounded admission controls protect a public, unauthenticated, non-authoritative
// intake. They are not wallet authentication and must never grant delivery rights.
const rate=new Map();let globalWindow=0,globalCount=0;
export function admitRate({ip,account,now=Date.now(),state=rate}){
 const minute=Math.floor(now/60000);
 if(minute!==globalWindow){globalWindow=minute;globalCount=0;state.clear();}
 if(++globalCount>15)return false;
 const a="wallet:"+account,client="ip:"+ip;
 for(const [key,max] of [[a,3],[client,6]]){
  const next=(state.get(key)||0)+1;
  if(next>max)return false;
  state.set(key,next);
 }
 return true;
}
export async function createIntakePool(url=process.env.XITA_TRANSFER_INTAKE_DATABASE_URL){
 if(!url)throw Error("Restricted XITA transfer intake database URL missing");
 const {Pool}=await import("pg");
 return new Pool({connectionString:url,max:2,connectionTimeoutMillis:2000,
  idleTimeoutMillis:15000,statement_timeout:3000});
}
export async function storeAnnouncement(pool,announcement){
 await pool.query({text:`INSERT INTO xita_transfer_announcements(
    source_chain,source_tx_hash,account) VALUES ($1,$2,$3)
    ON CONFLICT(source_chain,source_tx_hash,account) DO NOTHING`,
  values:[announcement.sourceChain,announcement.txHash,announcement.account]});
 return {ok:true,status:"REPORTED_UNVERIFIED",verified:false};
}
export async function intakeHandler(req,res,{catalog,pool,now=Date.now}){
 const send=(status,obj)=>{
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(obj));
 };
 if(req.method==="GET"&&req.url==="/health")
  return send(200,{ok:true,service:"xita-transfer-intake",authority:"none"});
 if(req.method!=="POST"||req.url!==ROUTE)
  return send(404,{ok:false,error:"Not found"});
 if(req.headers.origin&&req.headers.origin!=="https://xita.xgr.network")
  return send(403,{ok:false,error:"Unexpected origin"});
 if(!/^application\/json(?:\s*;.*)?$/i.test(req.headers["content-type"]||""))
  return send(415,{ok:false,error:"JSON content type required"});
 try{
  let body="";
  for await(const chunk of req){
   body+=chunk.toString("utf8");
   if(body.length>360)throw Error("Invalid announcement size");
  }
  const message=validateAnnouncement(JSON.parse(body),catalog);
  const ip=String(req.headers["x-real-ip"]||req.socket.remoteAddress||"unknown").slice(0,80);
  if(!admitRate({ip,account:message.account,now:now()}))
   return send(429,{ok:false,error:"Announcement rate limited"});
  const saved=await storeAnnouncement(pool,message);
  return send(202,saved);
 }catch(error){
  if(/Invalid announcement|Unexpected token|JSON|size/.test(String(error?.message||"")))
   return send(400,{ok:false,error:"Invalid source TX announcement"});
  return send(503,{ok:false,error:"Transfer announcement store unavailable"});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.XITA_TRANSFER_INTAKE_PORT||4089);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error("Invalid intake port");
 const pool=await createIntakePool();
 const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
 createServer((req,res)=>{void intakeHandler(req,res,{catalog,pool})})
  .listen(port,"127.0.0.1",()=>console.log("XITA untrusted TX intake on loopback "+port));
}
