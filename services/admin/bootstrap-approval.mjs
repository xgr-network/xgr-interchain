// User-approved public bootstrap and economic constructor values.
// Independent proof verification precedes ANY GitHub main write.
// Publishes both manifests in ONE optimistic fast-forward commit.
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {assertCurrentMain,approvedWorkInventory,checkedLocalMain} from "./main-gate.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
import {readDeploymentReadiness} from "./deployment-readiness.mjs";

const uint=v=>typeof v==="string"&&/^[1-9][0-9]*$/.test(v)&&
 BigInt(v)<(1n<<256n);
const gasValue=v=>Number.isSafeInteger(v)&&v>=21000&&v<=10000000;
const SHA=/^[0-9a-f]{40}$/i;
const load=(root,p)=>JSON.parse(readFileSync(join(root,p),"utf8"));
const encode=x=>JSON.stringify(x,null,2)+"\n";

export function approvedBootstrapDocuments({
 root,chain,candidate,values
}){
 const current=load(root,"config/bootstrap/"+chain.name+".json");
 const existing=load(root,"config/chains/"+chain.name+".json");
 if(current.chain!==chain.name||current.chainId!==chain.chainId||
    existing.chainId!==chain.chainId||existing.domainId!==chain.domainId||
    candidate?.chain!==chain.name||candidate?.chainId!==chain.chainId||
    candidate?.destinationDomain!==chain.domainId||
    candidate?.validatorSnapshot?.validators?.length!==3)
  throw Error("Public candidate identity or pinned validator set is invalid");
 if(!values||!uint(values.minimumWei)||!uint(values.maxExecutorReimbursementWei)||
    !uint(values.perValidatorWei)||!uint(values.sourceFeeWei)||
    !gasValue(values.defaultDestinationGasLimit))
  throw Error("Invalid positive fee/reserve/gas parameters");
 if(BigInt(values.minimumWei)<BigInt(values.maxExecutorReimbursementWei)||
    BigInt(values.perValidatorWei)<BigInt(values.minimumWei))
  throw Error("Per-validator reserve must exceed minimum; minimum must exceed executor ceiling");
 const bootstrap=structuredClone(current);
 bootstrap.validatorSnapshot=structuredClone(candidate.validatorSnapshot);
 bootstrap.reserve={...current.reserve,
  minimumWei:values.minimumWei,
  maxExecutorReimbursementWei:values.maxExecutorReimbursementWei,
  perValidatorWei:values.perValidatorWei};
 bootstrap.sourceFee={...current.sourceFee,targetWei:values.sourceFeeWei};
 bootstrap.initialValidatorsManifest=current.initialValidatorsManifest;
 bootstrap.verifierAddress=current.verifierAddress;
 bootstrap.validatorSnapshot.notes="Public domain-specific BLS proofs independently verified against finalized origin PoS snapshot";
 const approvedChain={...existing,
  defaultDestinationGasLimit:values.defaultDestinationGasLimit};
 if(bootstrap.verifierFormat!==chain.blsVerifierFormat ||
    bootstrap.membershipOriginChainId!==1643||
    bootstrap.sourceFee.initialization!=="factory-constructor-no-quorum")
  throw Error("Bootstrap governance and verifier format must remain unchanged");
 return {bootstrap,chain:approvedChain,
  paths:{
   ["config/bootstrap/"+chain.name+".json"]:encode(bootstrap),
   ["config/chains/"+chain.name+".json"]:encode(approvedChain)
  }};
}
export async function approveBootstrapToMain({
 root,chainName,values,evidenceDir,token=process.env.XITA_GITHUB_TOKEN,
 fetcher=fetch,verify=readDeploymentReadiness,
 mainCheck=assertCurrentMain,repo="xgr-network/xgr-interchain",
 sync=(commit)=>{
  checkedLocalMain(root);
  execFileSync("git",["pull","--ff-only","origin","main"],
   {cwd:root,timeout:30000,encoding:"utf8",maxBuffer:524288});
  if(checkedLocalMain(root)!==commit.toLowerCase())throw Error("Post-approval main checkout mismatch");
 }
}={}){
 if(!token)throw Error("GitHub main writer credential not installed on server");
 const commit=await mainCheck(root);
 const inventory=approvedWorkInventory(root);
 const chain=inventory.chains.find(c=>c.name===chainName);
 if(!chain)throw Error("Requested chain is not in GitHub main");
 const readiness=await verify({
  root,chain,inventory,boot:bootstrapPlan(root,chain),
  baseDir:evidenceDir,mainCurrent:true
 });
 if(readiness.evidenceVerified!==true||
    readiness.verifiedValidatorCount!==3)
  throw Error("Three independently verified public PoS/BLS validator proofs required");
 const path=resolve(evidenceDir,chain.name,"bootstrap-candidate.json");
 const candidate=JSON.parse(readFileSync(path,"utf8"));
 const documents=approvedBootstrapDocuments({root,chain,candidate,values});
 const headers={
  "Accept":"application/vnd.github+json",
  "Authorization":"Bearer "+token,
  "X-GitHub-Api-Version":"2022-11-28",
  "Content-Type":"application/json"
 };
 const api="https://api.github.com/repos/"+repo;
 async function req(endpoint,method="GET",body){
  const response=await fetcher(api+endpoint,{
   method,headers,cache:"no-store",signal:AbortSignal.timeout(12000),
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(!response.ok)throw Error("GitHub bootstrap commit failed HTTP "+response.status);
  return response.json();
 }
 const gitCommit=await req("/git/commits/"+commit);
 if(!SHA.test(gitCommit.tree?.sha||""))throw Error("GitHub base commit has invalid tree");
 const tree=await req("/git/trees","POST",{
  base_tree:gitCommit.tree.sha,
  tree:Object.entries(documents.paths).map(([path,content])=>({
   path,mode:"100644",type:"blob",content
  }))
 });
 if(!SHA.test(tree.sha||""))throw Error("Failed to create immutable bootstrap tree");
 const proposed=await req("/git/commits","POST",{
  message:"approve(bootstrap): independently verified "+chain.name+" chain deployment",
  tree:tree.sha,parents:[commit]
 });
 if(!SHA.test(proposed.sha||""))throw Error("GitHub refused bootstrap commit");
 const update=await req("/git/refs/heads/main","PATCH",{
  sha:proposed.sha,force:false
 });
 if(update.object?.sha?.toLowerCase()!==proposed.sha.toLowerCase())
  throw Error("Main changed during atomic bootstrap approval");
 sync(proposed.sha);
 return {approved:true,chain:chain.name,commit:proposed.sha,
  initialValidatorCount:3,values,paths:Object.keys(documents.paths)};
}
