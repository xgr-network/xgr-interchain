// XITA v3.1.5 TEMPORARY wallet write-ahead log, not a deployment index.
// Before wallet broadcast persist an unresolved transaction. GitHub main is
// the ONLY authority for completed deployments; finalized intents are deleted.
// Never silently drop prepared, submitted or confirmed-but-unpublished intents.
import {readFileSync,writeFileSync,renameSync,mkdirSync,openSync,closeSync,fsyncSync,unlinkSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {deploymentParameters} from "./deployment-parameters.mjs";
const ID=/^(?:[a-z][a-z0-9-]*:(?:blsVerifier|validatorRegistry|ism|transportBundle|nativeRouterDeployer|syntheticRouterDeployer|collateralRouterDeployer|factory|sourceRegistry)|[a-z][a-z0-9-]*:[A-Za-z0-9_-]+:(?:nativeRouter|syntheticRouter|collateralRouter|gateway):[A-Za-z0-9_-]+)$/;
const SHA=/^[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
const HEX=/^0x(?:[0-9a-f]{2})*$/i;
const H256=/^[0-9a-f]{64}$/i;
// "documented" exists solely to recognize and purge earlier on-disk records.
const PHASES=new Set(["prepared","submitted","confirmed","documented"]);
const validHex=s=>typeof s==="string"&&/^0x[0-9a-f]+$/i.test(s);
// Historical Registry transactions funded 3 * minimumWei before the separate
// perValidatorWei parameter was introduced. Recover that metadata ONLY when
// it matches the original signed transaction value; never mutate tx bytes.
function normalizeLegacyRegistry(e){
 if(!/^[a-z][a-z0-9-]*:validatorRegistry$/.test(e?.id||"")||
    e.stage==="documented"||!e.parameters||
    Object.hasOwn(e.parameters,"perValidatorWei")||
    Object.keys(e.parameters).sort().join(",")!=="maxExecutorReimbursementWei,minimumWei")
  return;
 try{
  const p=deploymentParameters("validatorRegistry",{
   ...e.parameters,perValidatorWei:e.parameters.minimumWei});
  if(BigInt(e.transaction?.value)!==3n*BigInt(p.perValidatorWei))return;
  e.parameters=p;
 }catch{ /* Bad historical data is still rejected by normal validation. */ }
}
function validate(e){
 if(e?.stage==="documented"){
  // Already published immutable receipt: obsolete constructor schema is not
  // allowed to block the status endpoint or later unrelated deployments.
  const chain=String(e.id||"").split(":")[0];
  if(!ID.test(e.id||"")||!TX.test(e.txHash||"")||
     !Number.isSafeInteger(e.chainId)||e.chainId<1||
     !new RegExp("^deployments/receipts/"+chain+
      "/[a-f0-9]{64}-[a-f0-9]{40}\\.json$","i").test(e.receiptPath||""))
   throw Error("Malformed completed deployment record");
  return;
 }
 normalizeLegacyRegistry(e);
 if(!ID.test(e?.id||"")||!SHA.test(e?.sourceCommit||"")||
    !ADDR.test(e?.wallet||"")||!Number.isSafeInteger(e?.chainId)||
    e.chainId<1||!PHASES.has(e?.stage)||
    !H256.test(e?.buildHash||"")||!H256.test(e?.artifactHash||""))
   throw Error("Malformed deployment intent identity");
 const component=e.id.split(":").length===2?e.id.split(":")[1]:e.id.split(":")[2];
 const parameters=deploymentParameters(component,e.parameters||{});
 if(JSON.stringify(parameters)!==JSON.stringify(e.parameters||{}))throw Error("Noncanonical constructor parameters");
 if(e.id.split(":").length===4 && (!e.asset||!e.factory||!ADDR.test(e.factory)|| !["nativeRouter","syntheticRouter","collateralRouter","gateway"].includes(component)))
  throw Error("Invalid asset route journal identity");
 if(component==="validatorRegistry" && (!e.validatorSnapshot||!Array.isArray(e.validatorSnapshot.validators)||e.validatorSnapshot.validators.length<3||e.validatorSnapshot.validators.length>128))
  throw Error("Approved public validator proofs must be journaled with Registry constructor");
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
 const readRaw=()=>{
  try{
   const s=JSON.parse(readFileSync(file,"utf8"));
   if(s.version!==1||!s.entries||Array.isArray(s.entries)||
      Object.keys(s).length!==2||Object.keys(s).some(k=>k!=="version"&&k!=="entries"))
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
   const s=readRaw();
   // Atomic normalization on every write, including preparing a redeploy.
   for(const [id,e] of Object.entries(s.entries))
    if(e.stage==="documented")delete s.entries[id];
   const out=fn(s);
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
 // One-time cleanup in the *actual* Admin state directory, whether the
 // service uses the default path or XGR_ADMIN_STATE_DIR. Old documented
 // rows cannot block a new deployment after deletion from GitHub.
 // The write-ahead safety lock for in-flight transactions remains intact.
 const read=()=>{
  const state=readRaw();
  if(Object.values(state.entries).some(e=>e.stage==="documented")){
   mutate(s=>null);
   return readRaw();
  }
  return state;
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
  cancelPrepared(id,createdAt){
   if(!ID.test(id||"")||!createdAt)throw Error("Invalid draft identity");
   return mutate(s=>{
    const e=s.entries[id];
    if(!e||e.stage!=="prepared"||e.txHash!=null||e.createdAt!==createdAt)
     throw Error("Only the exact unsent draft can be discarded");
    delete s.entries[id];return {discarded:true};
   });
  },
  retireForFreshWalletAttempt({id,createdAt,reason}){
   const permitted=new Set(["wallet-nonce-unused","failed-onchain",
    "nonce-replaced","pending-nonce-replaced","pending-nonce-untraceable",
    "old-nonce-consumed-untraceable","source-registry-unrelated-saved-hash","source-registry-factory-empty"]);
   if(!ID.test(id||"")||typeof createdAt!=="string"||
      !permitted.has(reason))
    throw Error("Invalid automated retry evidence");
   return mutate(s=>{
    const e=s.entries[id];
    if(!e||e.createdAt!==createdAt||
       !["prepared","submitted"].includes(e.stage))
     throw Error("Interrupted deployment changed while checking nonce; retry status refresh");
    // Keep immutable local audit evidence. This file is NOT a deployment
    // index, and cannot be used to claim an on-chain contract exists.
    const archive=join(dir,"retired-"+randomUUID()+".json");
    writeFileSync(archive,JSON.stringify({
     reason,retiredAt:new Date().toISOString(),entry:e
    },null,2)+"\n",{mode:0o600,flag:"wx"});
    delete s.entries[id];
    return {stage:"ready",retryReason:reason,previousTxHash:e.txHash||null};
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
  adoptObservedHash(id,createdAt,hash){
   if(!ID.test(id||"")||!createdAt||!TX.test(hash||""))
    throw Error("Invalid mined wallet replacement identity");
   return mutate(s=>{
    const e=s.entries[id];
    if(!e||e.createdAt!==createdAt||e.stage!=="submitted")
     throw Error("Observed wallet nonce is no longer recoverable");
    // This method is used only after fetching the signed transaction
    // from a block and matching FROM, nonce, calldata, value and chain.
    // Preserve the previous hash as auditable metadata.
    e.replacedTxHash=e.txHash;
    e.txHash=hash.toLowerCase();
    e.updatedAt=new Date().toISOString();
    return e;
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
      !/^deployments\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/.test(path))
    throw Error("Invalid canonical verified receipt path");
   return mutate(s=>{
    const e=s.entries[id];
    if(!e||e.stage!=="confirmed")throw Error("Only verified transactions can be documented");
    // Caller has published the receipt and verified the new local GitHub
    // main commit. The local journal has no role after successful completion.
    delete s.entries[id];
    return {stage:"documented",receiptPath:path};
   });
  }
 };
}
