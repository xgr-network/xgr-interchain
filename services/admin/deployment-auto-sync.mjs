// The admin writes ONLY a signal after a verified receipt was committed to
// GitHub. A separate unprivileged systemd service synchronizes the checkout.
// No HTTP endpoint can trigger a git operation.
import {existsSync,lstatSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {join,dirname,basename} from "node:path";
import {readSealedArtifacts,deploymentSourceFingerprint} from "./sealed-artifacts.mjs";

export const SYNC_REQUEST="deployment-sync.request";
export const SYNC_PROCESSING="deployment-sync.processing";
export const SYNC_STATUS="deployment-sync.status.json";
export const LIVE_CATALOG="/var/www/xita/data/catalog.json";
const SHA=/^[a-f0-9]{40}$/;
const PUBLIC_GIT_MAIN="https://github.com/xgr-network/xgr-interchain.git";
const gitForRoot=root=>args=>execFileSync("git",args,{cwd:root,encoding:"utf8",
 timeout:60000,maxBuffer:1024*1024,
 env:{...process.env,GIT_TERMINAL_PROMPT:"0"}}).trim();
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
const REPRESENTATIONS=/^deployments\/assets\/[a-f0-9]{2}\/[A-Z][A-Z0-9]{0,15}\/representations\.json$/;
const ROUTE_INDEX=/^deployments\/assets\/[a-f0-9]{2}\/[A-Z][A-Z0-9]{0,15}\/routes\/[a-f0-9]{64}\.json$/;
// Live main is obtained from a pinned public HTTPS transport, independent
// of the interactive shell's SSH agent. The repository's origin URL must
// still be exactly the approved GitHub repository.
export function verifiedRemoteMain(root,{git=gitForRoot(root)}={}){
 if(!ORIGINS.has(git(["remote","get-url","origin"])))
  throw Error("Unapproved Git origin for automatic deployment sync");
 const output=git(["ls-remote","--exit-code",PUBLIC_GIT_MAIN,"refs/heads/main"]);
 const match=/^([a-f0-9]{40})\s+refs\/heads\/main$/i.exec(output);
 if(!match)throw Error("Cannot verify current receipt-only GitHub main");
 return match[1].toLowerCase();
}
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
  if((status==="M"||status==="A")&&(INFRA.test(path)||REPRESENTATIONS.test(path)||ROUTE_INDEX.test(path))){paths++;continue}
  if(status==="M"&&path==="apps/web/catalog.json"){paths++;continue}
  throw Error("Auto-sync refuses non-receipt GitHub change: "+path);
 }
 if(receipts===0)throw Error("Auto-sync requires an added immutable deployment receipt");
 return {receipts,paths};
}

// The public website release symlinks only its catalog to this data file.
// No JS/HTML/CSS is modified by the receipt synchronizer. Atomic replacement
// prevents nginx from ever reading half-written JSON.
export function publishLiveCatalog(root,target=LIVE_CATALOG){
 if(basename(target)!=="catalog.json")throw Error("Unexpected public catalog destination");
 const dir=dirname(target),stat=lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink())
  throw Error("Public catalog directory must be a real directory");
 if(existsSync(target)){
  const old=lstatSync(target);
  if(!old.isFile()||old.isSymbolicLink())
   throw Error("Public catalog target must be a regular file");
 }
 const bytes=readFileSync(join(root,"apps/web/catalog.json"));
 if(!bytes.length||bytes.length>5_000_000)throw Error("Invalid generated catalog size");
 const decoded=JSON.parse(bytes.toString("utf8"));
 if(decoded?.schemaVersion!==1||!decoded.assets||!decoded.chains||!decoded.infrastructure)
  throw Error("Invalid generated public catalog");
 const temp=join(dir,".catalog-"+randomUUID()+".tmp");
 try{
  writeFileSync(temp,bytes,{mode:0o644,flag:"wx"});
  renameSync(temp,target);
 }catch(error){try{unlinkSync(temp)}catch{}throw error}
 return {catalogPublished:true,bytes:bytes.length};
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
 // Fixed, public HTTPS endpoint: the systemd worker must not depend on
 // an interactive SSH_AUTH_SOCK or shell-only authentication.
 git(["fetch","--no-tags",PUBLIC_GIT_MAIN,"main"]);
 const remote=git(["rev-parse","FETCH_HEAD"]).toLowerCase();
 // The requested verified receipt commit must remain an ancestor of main.
 // Check EACH intervening commit, not just the net diff; a code change
 // subsequently reverted must never sneak into a live checkout.
 git(["merge-base","--is-ancestor",local,expectedCommit]);
 git(["merge-base","--is-ancestor",expectedCommit,remote]);
 git(["merge-base","--is-ancestor",local,remote]);
 const commits=git(["rev-list","--reverse",local+".."+remote]).split(/\s+/).filter(Boolean);
 if(!commits.length||commits.length>32)throw Error("Unexpected receipt sync history length");
 for(const commit of commits){
  if(!SHA.test(commit))throw Error("Invalid intervening commit SHA");
  const parents=git(["rev-list","--parents","-n","1",commit]).split(/\s+/);
  if(parents.length!==2||parents[0]!==commit)
   throw Error("No merge commits permitted in automatic receipt sync");
  validateDeploymentDiff(git(["diff-tree","--no-commit-id","--name-status","-r","--no-renames",commit]));
 }
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
// The .path unit remains the immediate fast path. This independent poll is
// the recovery path when systemd.path misses the signal, a one-shot service
// exits before the request is consumed, or an SSH agent is unavailable.
// It NEVER bypasses syncDeploymentCheckout's per-commit receipt-only gate.
export function pollVerifiedDeploymentSync(stateDir,root,{
 git=gitForRoot(root),
 consume=()=>consumeDeploymentSync(stateDir,root),
 sync=commit=>syncDeploymentCheckout(root,commit),
 publish=()=>publishLiveCatalog(root,process.env.XITA_LIVE_CATALOG||LIVE_CATALOG)
}={}){
 let pendingFailure=null;
 if(existsSync(join(stateDir,SYNC_REQUEST))||existsSync(join(stateDir,SYNC_PROCESSING))){
  try{
   const result=consume();
   if(result.status==="completed")return result;
  }catch(error){pendingFailure=String(error.message||error).slice(0,240)}
 }
 let remote=null;
 try{
  remote=verifiedRemoteMain(root,{git});
  const local=git(["rev-parse","HEAD"]).toLowerCase();
  if(!SHA.test(local))throw Error("Invalid local Git revision");
  if(local===remote){
   // A previous receipt job may have merged successfully but failed while
   // publishing the website catalog. Retry that atomic publication.
   if(pendingFailure){
    const publication=publish();
    atomicJson(join(stateDir,SYNC_STATUS),{
     status:"current",commit:local,...publication,
     warning:"A previous receipt-sync request is still blocked: "+pendingFailure
    });
   }
   return {status:"current",commit:local,...(pendingFailure?{pendingFailure}:{})};
  }
  const outcome=sync(remote);
  const publication=publish();
  atomicJson(join(stateDir,SYNC_STATUS),{
   status:"completed",...outcome,...publication,
   ...(pendingFailure?{warning:"Previous sync request needs cleanup: "+pendingFailure}:{})
  });
  return {status:"completed",...outcome,...publication,...(pendingFailure?{pendingFailure}:{})};
 }catch(error){
  const reason=String(error.message||error);
  atomicJson(join(stateDir,SYNC_STATUS),{
   status:"failed",...(remote?{remoteCommit:remote}:{}),
   error:reason.slice(0,340),
   ...(pendingFailure?{priorRequestError:pendingFailure}:{})
  });
  throw error;
 }
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
  const published=publishLiveCatalog(root,process.env.XITA_LIVE_CATALOG||LIVE_CATALOG);
  atomicJson(join(stateDir,SYNC_STATUS),{status:"completed",...outcome,...published});
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
