// Separate creator enrollment: verify email and publish a normalized logo,
// without invoking external-CoinGecko Join or any wallet/sponsor transaction.
import {createHash,timingSafeEqual} from "node:crypto";
import {readFileSync,writeFileSync,unlinkSync,existsSync,readdirSync} from "node:fs";
import {join} from "node:path";
import {privateLocation,preparePrivateDir,createPending,readPrivate,
 lockedRecord,savePrivate,removePrivate,matchesToken,listPrivate} from "./private-store.mjs";
import {normalizeLogoPng} from "./creator-logo-png.mjs";
import {applicationMail} from "./mail-template.mjs";
import {sendMail,mailConfigured} from "./mail-gateway.mjs";
import {normalizeJoinDescription} from "../../apps/web/join-description.js";

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[0-9a-f-]{36}$/;
const EMAIL=/^[^\s@<>\r\n]{1,64}@[^\s@<>\r\n]{1,189}\.[^\s@<>\r\n]{2,}$/;
const NAME=/^[\p{L}\p{N}][\p{L}\p{N} ._()'-]{1,79}$/u;
const SYMBOL=/^[A-Z][A-Z0-9]{1,10}$/;
const SUPPLY=/^[1-9][0-9]{0,18}$/;
const ROLES=new Set(["founder","core-team","authorized-representative"]);
const LINKS=["explorer","github","docs","whitepaper","x","linkedin","telegram","discord"];
const response=(res,status,value)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));};
function safeUrl(value){
 if(!value)return null;
 if(typeof value!=="string"||value.length>512)throw Error("Invalid project URL");
 const u=new URL(value);
 if(u.protocol!=="https:"||u.username||u.password||!u.hostname.includes(".")||
   u.hostname==="localhost"||u.hostname.endsWith(".local")||
   u.hostname.endsWith(".internal")||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))
  throw Error("Invalid HTTPS project URL");
 return u.href;
}
export function normalizeCreatorApplication(data){
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid creator application");
 const name=String(data.name||"").trim(),symbol=String(data.symbol||"").trim(),
  initialSupply=String(data.initialSupply||"").trim(),contactEmail=String(data.contactEmail||"").trim().toLowerCase();
 if(!NAME.test(name)||!SYMBOL.test(symbol)||!SUPPLY.test(initialSupply)||
   BigInt(SUPPLY.test(initialSupply)?initialSupply:"0")>10n**18n)
  throw Error("Invalid token name, symbol or fixed supply");
 if(!EMAIL.test(contactEmail)||contactEmail.length>254)throw Error("Valid contact email required");
 if(!ROLES.has(data.applicantRole))throw Error("Authorized project relationship required");
 const shortDescription=normalizeJoinDescription(data.shortDescription,15,280),
  description=normalizeJoinDescription(data.description,40,5000);
 if(!shortDescription||!description)throw Error("Project descriptions must meet Join requirements");
 const website=safeUrl(data.website);
 if(!website)throw Error("Project website must be HTTPS");
 if(data.confirmed!==true)throw Error("Applicant acknowledgement required");
 const categories=data.categories;
 if(!Array.isArray(categories)||categories.length<1||categories.length>8||
  categories.some(c=>typeof c!=="string"||!/^[-\p{L}\p{N} &.]{1,60}$/u.test(c))||
  new Set(categories).size!==categories.length)throw Error("Choose valid project categories");
 const tags=Array.isArray(data.tags)?data.tags:[];
 if(tags.length>16||new Set(tags).size!==tags.length||
  tags.some(t=>typeof t!=="string"||!/^[-\p{L}\p{N} &.]{1,60}$/u.test(t)))
  throw Error("Invalid project tags");
 const links={};
 for(const key of LINKS)links[key]=safeUrl(data.links?.[key]||"");
 const logo=normalizeLogoPng(data.logoPngBase64);
 const record={name,symbol,initialSupply,contactEmail,applicantRole:data.applicantRole,
  shortDescription,description,website,categories,tags,links,confirmed:true};
 return {record,logo};
}
export function creatorLogoPublicUrl(hash){
 if(!SHA.test(hash||""))throw Error("Invalid logo identity");
 return "https://xita.xgr.network/token-logos/"+hash+".png";
}
export function creatorConfirmUrl(id,token,env){
 if(!ID.test(id||"")||!SHA.test(token||""))throw Error("Invalid confirmation details");
 const u=new URL(env.XITA_JOIN_PUBLIC_URL||"https://xita.xgr.network");
 if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)
  throw Error("Invalid public confirmation origin");
 return u.origin+"/createtoken/confirm#"+id+"."+token;
}
function locations(env){
 const base=preparePrivateDir(privateLocation(env));
 return {base,pending:preparePrivateDir(join(base,"creator-logos-pending")),
   publicDir:preparePrivateDir(join(base,"creator-logos-public"))};
}
function logoPath(dir,hash){if(!SHA.test(hash||""))throw Error("Invalid logo hash");return join(dir,hash+".png");}
function pendingPath(dir,id){if(!ID.test(id||""))throw Error("Invalid creator record");return join(dir,id+".png");}
function removeOptional(path){try{unlinkSync(path)}catch(e){if(e.code!=="ENOENT")throw e}}
function provisionPublicLogo(pending,publicDir,hash){
 const bytes=readFileSync(pending);
 if(createHash("sha256").update(bytes).digest("hex")!==hash||bytes.length>128*1024)
  throw Error("Logo integrity verification failed");
 const dest=logoPath(publicDir,hash);
 if(!existsSync(dest)){
  try{writeFileSync(dest,bytes,{flag:"wx",mode:0o600})}
  catch(e){if(e.code!=="EEXIST")throw e}
 }
 const stored=readFileSync(dest);
 if(stored.length!==bytes.length||!timingSafeEqual(stored,bytes))throw Error("Logo storage hash collision");
 removeOptional(pending);
 return creatorLogoPublicUrl(hash);
}
export async function readCreatorBody(req,max=185000){
 if(!String(req.headers["content-type"]||"").toLowerCase().startsWith("application/json"))
  throw Error("JSON required");
 let size=0,parts=[];
 for await(const buf of req){
  size+=buf.length;
  if(size>max)throw Error("Creator upload exceeds 180 KB");
  parts.push(buf);
 }
 return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
const attempts=new Map();
function rateEmail(email,now){
 const key=createHash("sha256").update(email).digest("hex");
 for(const [k,v] of attempts)if(now-v.start>3600000)attempts.delete(k);
 const old=attempts.get(key);
 if(old&&old.start+3600000>now){
  if(old.count>=3)return false;
  old.count++;return true;
 }
 attempts.set(key,{start:now,count:1});return true;
}
export async function handleCreator(req,res,{env=process.env,clock=Date.now,
 deliver=sendMail,readBody=readCreatorBody}={}){
 const path=new URL(req.url,"http://localhost").pathname;
 const logoMatch=/^\/token-logos\/([a-f0-9]{64})\.png$/.exec(path);
 if(req.method==="GET"&&logoMatch){
  try{
   const {publicDir}=locations(env),file=logoPath(publicDir,logoMatch[1]);
   const data=readFileSync(file);
   if(data.length>128*1024+256)return response(res,404,{ok:false});
   res.writeHead(200,{"Content-Type":"image/png","Cache-Control":"public, max-age=31536000, immutable",
    "X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'",
    "Cross-Origin-Resource-Policy":"cross-origin"});
   return res.end(data);
  }catch{return response(res,404,{ok:false})}
 }
 if(req.method==="GET"&&path.startsWith("/token-logos/"))return response(res,404,{ok:false});
 if(req.method!=="POST"||!["/api/xita/creator/register","/api/xita/creator/confirm"].includes(path))
  return response(res,404,{ok:false});
 try{
  if(!mailConfigured(env))return response(res,503,{ok:false,error:"Email verification unavailable"});
  if(path.endsWith("/confirm")){
   const input=await readBody(req,1024);
   if(!ID.test(input?.id||"")||!SHA.test(input?.token||""))
    return response(res,422,{ok:false,error:"Invalid confirmation"});
   const loc=locations(env);
   const result=await lockedRecord(loc.base,input.id,async record=>{
    if(record.kind!=="token-creator")throw Error("Not a creator application");
    if(record.phase==="email-verified"&&matchesToken(record.receiptHash,input.token))
     return {ok:true,status:"email-verified",logoUrl:creatorLogoPublicUrl(record.logoHash)};
    if(record.phase!=="pending-email"||!matchesToken(record.tokenHash,input.token)||
      Date.parse(record.confirmBefore)<clock())throw Error("Expired or invalid confirmation");
    const logoUrl=provisionPublicLogo(pendingPath(loc.pending,input.id),loc.publicDir,record.logoHash);
    record.phase="email-verified";record.receiptHash=record.tokenHash;
    record.tokenHash=null;record.logoUrl=logoUrl;record.verifiedAt=new Date(clock()).toISOString();
    savePrivate(loc.base,record);
    return {ok:true,status:"email-verified",logoUrl};
   });
   return response(res,200,result);
  }
  const input=await readBody(req),{record,logo}=normalizeCreatorApplication(input),
   now=clock();
  if(!rateEmail(record.contactEmail,now))
   return response(res,429,{ok:false,error:"Registration rate limit exceeded"});
  const loc=locations(env),records=listPrivate(loc.base,{now});
  // Expired pending records are pruned by listPrivate. Remove their private
  // image blobs too; never retain unverified user uploads indefinitely.
  const pendingIds=new Set(records.filter(x=>x.kind==="token-creator"&&
   x.phase==="pending-email").map(x=>x.id));
  for(const file of readdirSync(loc.pending)){
   const match=/^([0-9a-f-]{36})\\.png$/.exec(file);
   if(match&&!pendingIds.has(match[1]))removeOptional(join(loc.pending,file));
  }
  if(records.some(x=>x.kind==="token-creator"&&x.phase==="pending-email"&&
      x.input.contactEmail===record.contactEmail&&x.input.symbol===record.symbol))
   return response(res,409,{ok:false,error:"Email confirmation already pending"});
  const {id,token}=createPending(loc.base,record,"creator:"+logo.hash,{now});
  const saved=readPrivate(loc.base,id);saved.kind="token-creator";saved.logoHash=logo.hash;
  const logoFile=pendingPath(loc.pending,id);
  try{
   writeFileSync(logoFile,logo.bytes,{flag:"wx",mode:0o600});
   savePrivate(loc.base,saved);
   await deliver({to:record.contactEmail,subject:"Verify your XITA Token Launchpad email",
    ...applicationMail({title:"Verify your email",subtitle:"Confirm your token launch application",
     paragraphs:["Confirm your email to continue your XITA token launch application.",
      "No token has been created and no starter gas or Interchain deployment has been granted yet."],
     action:{label:"Confirm your email",url:creatorConfirmUrl(id,token,env)}}),
    idempotencyKey:id+":creator-confirm"},{env});
  }catch(err){removeOptional(logoFile);removePrivate(loc.base,id);throw err}
  return response(res,202,{ok:true,status:"pending-email",
   note:"Confirmation email sent. No token or route has been deployed."});
 }catch(err){
  const msg=String(err.message||err).replace(/[^\x20-\x7e]/g," ").slice(0,180);
  return response(res,/(storage|unavailable|SMTP|email delivery|invalid public confirmation origin)/i.test(msg)?503:422,
   {ok:false,error:msg});
 }
}
