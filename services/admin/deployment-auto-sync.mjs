// The admin writes ONLY a signal after a verified receipt was committed to
// GitHub. A separate unprivileged systemd service synchronizes the checkout.
// No HTTP endpoint can trigger a git operation.
import {existsSync,lstatSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {readSealedArtifacts,deploymentSourceFingerprint} from "./sealed-artifacts.mjs";

export const SYNC_REQUEST="deployment-sync.request";
export const SYNC_PROCESSING="deployment-sync.processing";
export const SYNC_STATUS="deployment-sync.status.json";
const SHA=/^[a-f0-9]{40}$/;
const ORIGINS=new Set([
 "git@github.com:xgr-network/xgr-interchain.git",
 "git@github.com:xgr-network/xgr-interchain",
 "https://github.com/xgr-network/xgr-interchain.git",
 "https://github.com/xgr-network/xgr-interchain",
 "ssh://git@github.com/xgr-network/xgr-interchain.git",
 "ssh://git@github.com/xgr-network/xgr-interchain"
]);
const RECEIPT=/^deployments\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/;
const INFRA=/^deployments\/chains\/[a-z][a-z0-9-]*\.json$/;
const ASSET=/^deployments\/assets\/[a-f0-9]{2}\/[A-Z][A-Z0-9]{0,15}\.json$/;
function atomicJson(path,record){
 const tmp=path+"."+randomUUID()+".tmp";
 writeFileSync(tmp,JSON.stringify(record)+"\n",{mode:0o600,flag:"wx"});
 renameSync(tmp,path);
}
export function queueDeploymentSync(stateDir,commit){
 if(!SHA.test(commit||""))throw Error("Verified deployment commit SHA required");
 mkdirSync(stateDir,{recursive:true,mode:0o700});
 if(existsSync(join(stateDir,SYNC_PROCESSING)))throw Error("Prior deployment sync still running or needs recovery");
 const path=join(stateDir,SYNC_REQUEST);
 if(existsSync(path)){
  const previous=readFileSync(path,"utf8");
  if(JSON.parse(previous).commit===commit)return {queued:true,commit};
  throw Error("Previous deployment sync request is still pending");
 }
 atomicJson(path,{schemaVersion:1,kind:"xita-verified-deployment-sync",commit});
 return {queued:true,commit};
}

// The remote commit is permitted ONLY if the ENTIRE intervening diff is
// an append-only verified-deployment publication. Never pull application,
// Solidity, configuration, secrets, or a deletion into a running process.
export function validateDeploymentDiff(diff){
 if(typeof diff!=="string"||!diff.trim())throw Error("No deployment receipt changes found");
 let receipts=0,paths=0;
 for(const line of diff.trimEnd().split("\n")){
  const parts=line.split("\t");
  if(parts.length!==2)throw Error("Unexpected git diff format");
  const [status,path]=parts;
  if(status==="A"&&RECEIPT.test(path)){receipts++;paths++;continue}
  if((status==="M"||status==="A")&&(INFRA.test(path)||ASSET.test(path))){paths++;continue}
  if(status==="M"&&path==="apps/web/catalog.json"){paths++;continue}
  throw Error("Auto-sync refuses non-receipt GitHub change: "+path);
 }
 if(receipts===0)throw Error("Auto-sync requires an added immutable deployment receipt");
 return {receipts,paths};
}

export function syncDeploymentCheckout(root,expectedCommit,{
 git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:60000,
  maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}}).trim(),
 verifyArtifacts=commit=>readSealedArtifacts(root,commit),
 sourceFingerprint=()=>deploymentSourceFingerprint(root),
 validate=()=>{
  execFileSync(process.execPath,["tools/validate-manifests.mjs"],{cwd:root,timeout:30000,stdio:"pipe"});
  execFileSync(process.execPath,["tools/build-xeta-web-catalog.mjs","--check"],{cwd:root,timeout:30000,stdio:"pipe"});
 }
}={}){
 if(!SHA.test(expectedCommit||""))throw Error("Untrusted auto-sync commit");
 if(git(["symbolic-ref","--short","HEAD"])!=="main")throw Error("Deployment sync requires main checkout");
 if(git(["status","--porcelain","--untracked-files=no"])!=="")throw Error("Dirty tracked checkout; do not auto-sync");
 if(!ORIGINS.has(git(["remote","get-url","origin"])))throw Error("Unapproved Git origin");
 const local=git(["rev-parse","HEAD"]).toLowerCase();
 if(!SHA.test(local))throw Error("Invalid local Git SHA");
 if(local===expectedCommit)return {updated:false,commit:local};
 // The seal is keyed by Solidity source, not by Git commit: receipt-only
 // publication MUST NOT cause a rebuild or reseal.
 const fingerprint=sourceFingerprint();
 verifyArtifacts(local);
 git(["fetch","--no-tags","origin","main"]);
 const remote=git(["rev-parse","FETCH_HEAD"]).toLowerCase();
 if(remote!==expectedCommit)
  throw Error("GitHub main advanced beyond the verified deployment commit; run full update");
 git(["merge-base","--is-ancestor",local,remote]);
 const changes=validateDeploymentDiff(git(["diff","--name-status","--no-renames",local,remote]));
 git(["merge","--ff-only",remote]);
 if(git(["rev-parse","HEAD"]).toLowerCase()!==remote)
  throw Error("Fast-forward did not reach verified deployment commit");
 if(sourceFingerprint()!==fingerprint)
  throw Error("Solidity fingerprint changed during receipt-only sync");
 verifyArtifacts(remote);
 validate();
 return {updated:true,commit:remote,...changes};
}
export function consumeDeploymentSync(stateDir,root){
 const requested=join(stateDir,SYNC_REQUEST),processing=join(stateDir,SYNC_PROCESSING);
 if(existsSync(requested)&&existsSync(processing))
  throw Error("Competing deployment sync requests require manual inspection");
 if(existsSync(requested))renameSync(requested,processing);
 if(!existsSync(processing))return {status:"idle"};
 const stat=lstatSync(processing);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2048)
  throw Error("Malformed or symlinked deployment sync request");
 let record;
 try{record=JSON.parse(readFileSync(processing,"utf8"))}
 catch{throw Error("Invalid deployment sync request JSON")}
 if(record?.schemaVersion!==1||record.kind!=="xita-verified-deployment-sync"||
    !SHA.test(record.commit||"")||Object.keys(record).sort().join(",")!=="commit,kind,schemaVersion")
  throw Error("Untrusted deployment sync request format");
 try{
  const outcome=syncDeploymentCheckout(root,record.commit);
  atomicJson(join(stateDir,SYNC_STATUS),{status:"completed",...outcome});
  unlinkSync(processing);
  return {status:"completed",...outcome};
 }catch(e){
  // Do not spin a PathExists-triggered systemd unit on repeated failure.
  // Retain .processing for an explicit recovery and never reset Git state.
  atomicJson(join(stateDir,SYNC_STATUS),{
   status:"failed",commit:record.commit,error:String(e.message||e).slice(0,350)
  });
  throw e;
 }
}
