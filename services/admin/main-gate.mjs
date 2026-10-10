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
export async function assertCurrentMain(root,options={}){
 const local=checkedLocalMain(root,options);
 const remote=await currentMainCommit(options);
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
