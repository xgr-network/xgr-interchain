// XITA deployment eligibility: ONLY the current remote main commit.
// Pull requests, feature branches, cached manifests and GitHub Issues are
// NOT deployment authorization. Fail closed on missing GitHub reachability.
import {execFileSync} from "node:child_process";
import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {buildAssetState} from "./asset-state.mjs";

const SHA=/^[0-9a-f]{40}$/i;
const ADDR=/^0x[0-9a-f]{40}$/i;
export const HUB={chainId:1643,domainId:1643};
export function isHubHop(source,destination){
 const hub=c=>c?.chainId===HUB.chainId&&c?.domainId===HUB.domainId;
 return Boolean(source&&destination&&source.chainId!==destination.chainId&&
   (source.chainId===1643)===(source.domainId===1643)&&
   (destination.chainId===1643)===(destination.domainId===1643)&&
   hub(source)!==hub(destination));
}
export async function currentMainCommit({fetcher=fetch,repo="xgr-network/xgr-interchain",token=process.env.XITA_GITHUB_TOKEN}={}){
 const headers={"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
 if(token)headers.Authorization="Bearer "+token;
 const response=await fetcher("https://api.github.com/repos/"+repo+"/git/ref/heads/main",
   {headers,signal:AbortSignal.timeout(7000),cache:"no-store"});
 if(!response.ok)throw Error("GitHub main unavailable (HTTP "+response.status+")");
 const body=await response.json(),sha=body?.object?.sha;
 if(!SHA.test(sha||""))throw Error("GitHub returned invalid main SHA");
 return sha.toLowerCase();
}
export function checkedLocalMain(root,{git=(args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:3000}).trim()}={}){
 const branch=git(["symbolic-ref","--short","HEAD"]);
 if(branch!=="main")throw Error("Deployment console is NOT running on main");
 const sha=git(["rev-parse","HEAD"]).toLowerCase();
 if(!SHA.test(sha))throw Error("Invalid local commit");
 const dirty=git(["status","--porcelain","--untracked-files=no"]);
 if(dirty)throw Error("Tracked working tree differs from main commit");
 return sha;
}
// The git transport checks the SAME LIVE refs/heads/main when GitHub's REST
// API responds 403/429 or is unreachable. This is not an offline cache.
// Pin origin to the canonical GitHub repository before consulting ls-remote.
export function currentMainViaGit(root,{
 git=(args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",
   timeout:12000,maxBuffer:8192,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}}).trim()
}={}){
 const origin=git(["remote","get-url","origin"]).trim();
 const canonicalOrigins=new Set([
  "git@github.com:xgr-network/xgr-interchain.git",
  "git@github.com:xgr-network/xgr-interchain",
  "https://github.com/xgr-network/xgr-interchain.git",
  "https://github.com/xgr-network/xgr-interchain",
  "ssh://git@github.com/xgr-network/xgr-interchain.git",
  "ssh://git@github.com/xgr-network/xgr-interchain"
 ]);
 if(!canonicalOrigins.has(origin))
  throw Error("Git remote origin is not the pinned xgr-network/xgr-interchain repository");
 const output=git(["ls-remote","--exit-code","origin","refs/heads/main"]).trim();
 const match=output.split(" ");
 const valid=match.length===2&&/^[0-9a-f]{40}$/i.test(match[0])&&match[1]==="refs/heads/main";
 if(!valid)throw Error("Live Git remote main ref not independently verified");
 return match[1].toLowerCase();
}
export async function liveMainCommit(root,options={}){
 try{return await currentMainCommit(options)}
 catch(apiError){
  try{return currentMainViaGit(root,options)}
  catch(gitError){
   throw Error("Cannot verify live main over GitHub API or pinned Git remote ("+
    String(apiError.message||apiError)+"; "+
    String(gitError.message||gitError)+")");
  }
 }
}
export async function assertCurrentMain(root,options={}){
 const local=checkedLocalMain(root,options);
 const remote=await liveMainCommit(root,options);
 if(local!==remote)throw Error("Server commit is not the CURRENT GitHub main; update checkout before deploying");
 return remote;
}
function load(root,path){return JSON.parse(readFileSync(join(root,path),"utf8"));}
export function approvedWorkInventory(root){
 const chains={},assets={},routes=[];
 for(const file of readdirSync(join(root,"config/chains")).filter(n=>n.endsWith(".json"))){
   const name=file.slice(0,-5);
   const chain=load(root,"config/chains/"+file);
   if(name!==chain.name||!Number.isSafeInteger(chain.chainId)||!Number.isSafeInteger(chain.domainId))
     throw Error("Invalid main chain definition: "+name);
   if((chain.chainId===1643)!==(chain.domainId===1643))throw Error("Spoofed hub identity");
   chains[name]=chain;
 }
 if(chains.xgrchain?.chainId!==1643||chains.xgrchain?.domainId!==1643)
   throw Error("XGRChain 1643 missing from main");
 const state=buildAssetState(root,chains,isHubHop);
 Object.assign(assets,state.assets);
 routes.push(...state.routes);
 return {chains:Object.values(chains),assets,routes};
}
export async function deploymentQueue(root,options={}){
 const commit=await assertCurrentMain(root,options);
 return {commit,source:"github-main",githubApproved:true,inventory:approvedWorkInventory(root),
   note:"Main grants deployment eligibility only. Wallet transaction requires verified build, prerequisites and chain checks."};
}

// Read-only rendering may use a clean checked-out main snapshot even when
// remote main has advanced or GitHub is momentarily unavailable. This method
// NEVER authorizes deployment. Do not use its inventory to bypass
// assertCurrentMain() in executable or mutating server endpoints.
export async function readOnlyWorkQueue(root,options={}){
 const commit=checkedLocalMain(root,options);
 const inventory=approvedWorkInventory(root);
 let remoteCommit=null,syncStatus="unavailable",warning=null;
 try{
  remoteCommit=await liveMainCommit(root,options);
  syncStatus=remoteCommit===commit?"current":"outdated";
  if(syncStatus==="outdated")
   warning="Lokaler GitHub-main-Checkout ist veraltet. ./manage.sh update ausführen. Deployments sind gesperrt.";
 }catch(e){
  warning="Aktueller GitHub-main-Stand nicht prüfbar ("+String(e.message||e).slice(0,140)+"). Nur lokale Vorschau; Deployments sind gesperrt.";
 }
 return {
  commit,remoteCommit,syncStatus,githubApproved:syncStatus==="current",
  readOnly:syncStatus!=="current",source:syncStatus==="current"?"github-main":"local-main-snapshot",
  inventory,warning,
  note:"Only the latest confirmed GitHub main authorizes deployments. This endpoint is display-only."
 };
}
