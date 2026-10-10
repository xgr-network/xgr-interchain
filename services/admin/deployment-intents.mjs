// XITA v3.1.5 durable WRITE-AHEAD wallet intent.
// Persist before asking EIP-1193 wallet to broadcast. A crash, failed wallet
// callback or GitHub outage may never generate a second tx for the same step.
import {readFileSync,writeFileSync,renameSync,mkdirSync,openSync,closeSync,fsyncSync,unlinkSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
const ID=/^[a-z][a-z0-9-]*:(?:blsVerifier|validatorRegistry|ism|factory|sourceRegistry)$/;
const SHA=/^[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
const HEX=/^0x(?:[0-9a-f]{2})*$/i;
const H256=/^[0-9a-f]{64}$/i;
const PHASES=new Set(["prepared","submitted","confirmed","documented"]);
const validHex=s=>typeof s==="string"&&/^0x[0-9a-f]+$/i.test(s);
function validate(e){
 if(!ID.test(e?.id||"")||!SHA.test(e?.sourceCommit||"")||
    !ADDR.test(e?.wallet||"")||!Number.isSafeInteger(e?.chainId)||
    e.chainId<1||!PHASES.has(e?.stage)||
    !H256.test(e?.buildHash||"")||!H256.test(e?.artifactHash||""))
   throw Error("Malformed deployment intent identity");
 const t=e.transaction;
 if(!t||!ADDR.test(t.from||"")||!HEX.test(t.data||"")||
    t.data.length<10||t.data.length>400000||
    (t.to!==null&&!ADDR.test(t.to||""))||
    !validHex(t.value)||!validHex(t.gas)||!validHex(t.nonce))
   throw Error("Malformed deployment transaction");
 if(t.from.toLowerCase()!==e.wallet.toLowerCase())
  throw Error("Wallet and transaction sender differ");
 if(e.stage!=="prepared"&&!TX.test(e.txHash||""))
  throw Error("Transaction hash missing after submission");
 if(e.txHash!==null&&e.txHash!==undefined&&!TX.test(e.txHash))
  throw Error("Invalid transaction hash");
 if(e.stage==="documented"&&typeof e.receiptPath!=="string")
  throw Error("Documented deployment missing canonical receipt");
}
export function deploymentIntents({directory,chains}){
 if(typeof directory!=="string"||!directory.startsWith("/")||!Array.isArray(chains))
  throw Error("Persistent deployment intent directory and approved chains required");
 const approved=new Map(chains.map(c=>[c.name,c.chainId]));
 const dir=directory,file=join(dir,"intents.json"),lock=join(dir,"intents.lock");
 const approve=e=>{
  validate(e);
  if(approved.get(e.id.split(":")[0])!==e.chainId)
   throw Error("Intent chain no longer approved by configured main inventory");
 };
 const read=()=>{
  try{
   const s=JSON.parse(readFileSync(file,"utf8"));
   if(s.version!==1||!s.entries||Array.isArray(s.entries))
    throw Error("Deployment intent journal schema mismatch");
   for(const [id,e] of Object.entries(s.entries)){
    if(id!==e.id)throw Error("Deployment journal identity changed");
    approve(e);
   }
   return s;
  }catch(e){if(e.code==="ENOENT")return {version:1,entries:{}};throw e}
 };
 const mutate=fn=>{
  mkdirSync(dir,{recursive:true,mode:0o700});
  let fd;
  try{
   fd=openSync(lock,"wx",0o600);
   const s=read(),out=fn(s);
   const tmp=join(dir,"."+randomUUID()+".tmp");
   writeFileSync(tmp,JSON.stringify(s,null,2)+"\n",{mode:0o600,flag:"wx"});
   const fileHandle=openSync(tmp,"r");
   try{fsyncSync(fileHandle)}finally{closeSync(fileHandle)}
   renameSync(tmp,file);
   const dirHandle=openSync(dir,"r");
   try{fsyncSync(dirHandle)}finally{closeSync(dirHandle)}
   return out;
  }finally{
   if(fd!==undefined){closeSync(fd);unlinkSync(lock);}
  }
 };
 return {
  read,
  prepare(e){
   const entry={...e,stage:"prepared",txHash:null,createdAt:new Date().toISOString()};
   approve(entry);
   return mutate(s=>{
    if(s.entries[entry.id])
     throw Error("Existing deployment intent must be reconciled; never re-broadcast");
    s.entries[entry.id]=entry;
    return entry;
   });
  },
  attachHash(id,hash){
   if(!ID.test(id||"")||!TX.test(hash||""))throw Error("Invalid signed wallet transaction hash");
   return mutate(s=>{
    const e=s.entries[id];
    if(!e)throw Error("Unknown prepared wallet intent");
    if(e.stage!=="prepared"&&
       !(e.stage==="submitted"&&e.txHash?.toLowerCase()===hash.toLowerCase()))
      throw Error("Cannot replace a deployment transaction hash");
    e.txHash=hash.toLowerCase();e.stage="submitted";
    e.updatedAt=new Date().toISOString();return e;
   });
  },
  confirm(id,hash,proof){
   if(!ID.test(id||"")||!TX.test(hash||"")||!proof||
      typeof proof.contractAddress!=="string"||!ADDR.test(proof.contractAddress)||
      !/^0x[0-9a-f]{64}$/i.test(proof.runtimeKeccak||""))
    throw Error("Missing independently verified deployment proof");
   return mutate(s=>{
    const e=s.entries[id];
    if(!e||e.stage!=="submitted"||e.txHash!==hash.toLowerCase())
     throw Error("Transaction was not journaled before verification");
    e.stage="confirmed";e.verifiedProof=proof;
    e.updatedAt=new Date().toISOString();return e;
   });
  },
  document(id,path){
   if(!ID.test(id||"")||typeof path!=="string"||
      !/^deployments\/mainnet\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/.test(path))
    throw Error("Invalid canonical verified receipt path");
   return mutate(s=>{
    const e=s.entries[id];
    if(!e||e.stage!=="confirmed")throw Error("Only verified transactions can be documented");
    e.stage="documented";e.receiptPath=path;
    e.updatedAt=new Date().toISOString();return e;
   });
  }
 };
}
