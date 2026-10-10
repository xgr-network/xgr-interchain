// Durable fail-closed transaction journal. The server records observed
// wallet hashes, never signs or retransmits an EVM transaction.
// A new transaction for the same component is blocked until its previous
// hash has been conclusively reconciled. Directory must be persistent.
import {readFileSync,writeFileSync,mkdirSync,renameSync,openSync,closeSync,unlinkSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
const H40=/^[a-f0-9]{40}$/i,TX=/^0x[a-f0-9]{64}$/i,ADDR=/^0x[a-f0-9]{40}$/i;
const STAGES=new Set(["submitted","confirmed","failed","documented"]);
function safeId(s){if(typeof s!=="string"||!/^(base|xgrchain):[a-zA-Z][a-zA-Z0-9]{2,45}$/.test(s))throw Error("Unapproved deployment step ID");return s}
function validate(entry){
 safeId(entry.id);
 if(!TX.test(entry.txHash||"")||!H40.test(entry.sourceCommit||"")||!ADDR.test(entry.wallet||""))
  throw Error("Invalid transaction journal identity");
 if(!Number.isSafeInteger(entry.chainId)||![8453,1643].includes(entry.chainId)||!STAGES.has(entry.stage))
  throw Error("Invalid journal chain or state");
}
export function deploymentJournal({dir}){
 if(typeof dir!=="string"||!dir.startsWith("/"))throw Error("Persistent absolute journal directory required");
 const path=join(dir,"transactions.json"),lock=join(dir,"transactions.lock");
 const read=()=>{try{
  const value=JSON.parse(readFileSync(path,"utf8"));
  if(value.version!==1||typeof value.entries!=="object"||Array.isArray(value.entries))throw Error("Journal schema mismatch");
  Object.values(value.entries).forEach(validate);
  return value;
 }catch(e){if(e.code==="ENOENT")return {version:1,entries:{}};throw e}};
 const write=value=>{
  mkdirSync(dir,{recursive:true,mode:0o700});
  const tmp=join(dir,"."+randomUUID()+".tmp");
  writeFileSync(tmp,JSON.stringify(value,null,2)+"\n",{mode:0o600,flag:"wx"});
  renameSync(tmp,path);
 };
 function mutate(fn){
  mkdirSync(dir,{recursive:true,mode:0o700});
  let handle;
  try{
   handle=openSync(lock,"wx",0o600);
   const state=read(),result=fn(state);
   write(state);
   return result;
  }finally{if(handle!==undefined){
   closeSync(handle);
   // Remove our lock file only. Stale lock requires manual operator review.
   unlinkSync(lock);
  }}
 }
 return {
  read,
  record(entry){
   validate({...entry,stage:"submitted"});
   return mutate(s=>{
    const id=safeId(entry.id);
    if(s.entries[id])throw Error("Deployment step already journaled; reconcile before any new transaction");
    const item={id,txHash:entry.txHash.toLowerCase(),wallet:entry.wallet.toLowerCase(),
     chainId:entry.chainId,sourceCommit:entry.sourceCommit.toLowerCase(),
     stage:"submitted",submittedAt:new Date().toISOString()};
    s.entries[id]=item;return item;
   });
  },
  reconcile({id,txHash,stage,evidence=null}){
   return mutate(s=>{
    const item=s.entries[safeId(id)];
    if(!item||!TX.test(txHash||"")||item.txHash!==txHash.toLowerCase())throw Error("Unknown or mismatched journal transaction");
    const transitions={submitted:["confirmed","failed"],confirmed:["documented"],failed:[],documented:[]};
    if(!transitions[item.stage].includes(stage))throw Error("Invalid journal transition");
    if(stage==="documented"&&(!evidence||typeof evidence.path!=="string"||!evidence.path.startsWith("deployments/mainnet/receipts/")))
     throw Error("Verified GitHub receipt reference required");
    item.stage=stage;item.updatedAt=new Date().toISOString();
    if(evidence)item.evidence=evidence;return item;
   });
  }
 };
}
