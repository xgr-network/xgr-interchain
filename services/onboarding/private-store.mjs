// Private application contact store. Never place this directory under Git checkout.
// Atomic owner-only JSON files, no public HTTP address lookup, hashed confirmation tokens.
import {randomUUID,randomBytes,createHash,timingSafeEqual} from "node:crypto";
import {mkdirSync,writeFileSync,readFileSync,renameSync,unlinkSync,readdirSync,lstatSync,statSync} from "node:fs";
import {resolve,isAbsolute,join,sep} from "node:path";
import {fileURLToPath} from "node:url";
const REPO=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const ID=/^[0-9a-f-]{36}$/;
export function privateLocation(env=process.env){
  const configured=env.XITA_JOIN_PRIVATE_DIR;
  if(!configured||!isAbsolute(configured))throw Error("Private storage path must be configured as an absolute path");
  const dir=resolve(configured);
  if(dir===REPO||dir.startsWith(REPO+sep))throw Error("Private storage must be outside the Git checkout");
  return dir;
}
export function preparePrivateDir(dir){
  mkdirSync(dir,{recursive:true,mode:0o700});
  const stat=lstatSync(dir);
  if(!stat.isDirectory()||(stat.mode&0o077)!==0)throw Error("Private storage must be an owner-only directory (0700)");
  return dir;
}
function pathFor(dir,id){if(!ID.test(id||""))throw Error("Invalid private application ID");return join(dir,id+".json");}
export function confirmationHash(token){return createHash("sha256").update(token,"utf8").digest("hex");}
export function matchesToken(expected,token){
  if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token)||!/^([a-f0-9]{64})$/.test(expected||""))return false;
  return timingSafeEqual(Buffer.from(confirmationHash(token),"hex"),Buffer.from(expected,"hex"));
}
export function createPending(dir,input,assetId,{now=Date.now()}={}){
  preparePrivateDir(dir);
  const id=randomUUID(),token=randomBytes(32).toString("hex");
  const record={id,assetId,input,phase:"pending-email",tokenHash:confirmationHash(token),
    createdAt:new Date(now).toISOString(),confirmBefore:new Date(now+86400000).toISOString(),
    retainUntil:new Date(now+366*86400000).toISOString(),sent:[],pr:null};
  writeFileSync(pathFor(dir,id),JSON.stringify(record),{flag:"wx",mode:0o600});
  return {id,token,record};
}
export function readPrivate(dir,id){
  const p=pathFor(dir,id),stat=lstatSync(p);
  if(!stat.isFile()||(stat.mode&0o077)!==0)throw Error("Unsafe private record permissions");
  return JSON.parse(readFileSync(p,"utf8"));
}
export function savePrivate(dir,record){
  const p=pathFor(dir,record.id),temp=join(dir,"."+record.id+"-"+randomUUID()+".tmp");
  writeFileSync(temp,JSON.stringify(record),{flag:"wx",mode:0o600});
  renameSync(temp,p);
}
export async function lockedRecord(dir,id,operation){
  const p=pathFor(dir,id)+".lock";
  writeFileSync(p,String(process.pid),{flag:"wx",mode:0o600});
  try{return await operation(readPrivate(dir,id));}
  finally{unlinkSync(p);}
}
export function listPrivate(dir,{now=Date.now()}={}){
  preparePrivateDir(dir);
  const records=[];
  for(const name of readdirSync(dir)){
    if(!ID.test(name.slice(0,-5))||!name.endsWith(".json"))continue;
    const record=readPrivate(dir,name.slice(0,-5));
    if(Date.parse(record.retainUntil)<now){unlinkSync(pathFor(dir,record.id));continue;}
    if(record.phase==="pending-email"&&Date.parse(record.confirmBefore)<now){
      unlinkSync(pathFor(dir,record.id));continue;
    }
    records.push(record);
  }
  return records;
}
