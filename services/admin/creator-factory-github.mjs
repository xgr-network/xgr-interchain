// GitHub write boundary: exactly one reviewed config/creator/factory.json proposal.
// No browser-provided paths, contents, arbitrary PR titles or credentials.
const REPO="xgr-network/xgr-interchain",SHA=/^[a-f0-9]{40}$/i;
export async function publishCreatorFactoryPR({manifest,sourceCommit},{
 token=process.env.XITA_GITHUB_TOKEN,fetcher=fetch}={}){
 if(!token)throw Error("Admin GitHub writer credential missing");
 if(!SHA.test(sourceCommit||"")||manifest?.schemaVersion!==1||
    manifest?.kind!=="xita-creator-factory-v1"||manifest?.status!=="receipt-verified"||
    manifest?.chainId!==1643||!/^0x[a-f0-9]{40}$/i.test(manifest.address||"")||
    !/^0x[a-f0-9]{64}$/i.test(manifest.deploymentTxHash||"")||
    !/^0x[a-f0-9]{64}$/i.test(manifest.runtimeCodeKeccak256||""))
  throw Error("Cannot publish unverified factory manifest");
 const base="https://api.github.com/repos/"+REPO;
 const call=async(path,method="GET",body,{optional=false}={})=>{
  const result=await fetcher(base+path,{method,cache:"no-store",redirect:"error",
   signal:AbortSignal.timeout(15000),headers:{"Accept":"application/vnd.github+json",
    "Authorization":"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28",
    "Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(optional&&result.status===404)return null;
  if(!result.ok)throw Error("Factory GitHub API "+result.status);
  return result.json();
 };
 const ref=await call("/git/ref/heads/main");
 if(ref?.object?.sha!==sourceCommit)throw Error("GitHub main advanced; update and reverify Factory");
 const exists=await call("/contents/config/creator/factory.json?ref=main","GET",undefined,{optional:true});
 if(exists)throw Error("Creator Factory already documented in GitHub main");
 const baseCommit=await call("/git/commits/"+sourceCommit);
 const branch="creator-factory/deploy-"+manifest.deploymentTxHash.slice(2,18);
 const tree=await call("/git/trees","POST",{base_tree:baseCommit.tree.sha,
  tree:[{path:"config/creator/factory.json",mode:"100644",type:"blob",
   content:JSON.stringify(manifest,null,2)+"\n"}]});
 const found=await call("/git/ref/heads/"+branch,"GET",undefined,{optional:true});
 if(found){
  const previous=await call("/git/commits/"+found.object.sha);
  if(previous.tree.sha!==tree.sha||previous.parents?.length!==1||
     previous.parents[0]?.sha!==sourceCommit)
   throw Error("Existing Factory proposal branch differs from independently verified deployment");
 }else{
  const next=await call("/git/commits","POST",{
   message:"deploy(creator): attest XGRChain Creator Factory from verified on-chain receipt",
   tree:tree.sha,parents:[sourceCommit]});
  await call("/git/refs","POST",{ref:"refs/heads/"+branch,sha:next.sha});
 }
 const list=await call("/pulls?state=all&head="+encodeURIComponent("xgr-network:"+branch));
 if(!Array.isArray(list)||list.length>1)throw Error("Ambiguous Creator Factory GitHub proposal");
 const known=list[0];
 if(known){
  if(known.state!=="open"||known.base?.ref!=="main"||known.head?.ref!==branch)
   throw Error("Factory PR was closed or changed; operator review required");
  return {number:known.number,url:known.html_url,draft:known.draft};
 }
 const pr=await call("/pulls","POST",{
  title:"deploy(creator): verify and pin XGRChain ERC-20 Factory",
  head:branch,base:"main",draft:true,
  body:"One-time XITAStarterTokenCreator deployment on XGRChain (1643). "+
   "This is an **automatically generated, independently verified receipt proposal**. "+
   "Factory address, runtime bytecode hash and original wallet transaction were "+
   "confirmed against two approved XGR RPC endpoints. "+
   "Merge only after reviewer independently checks the contract code and on-chain transaction. "+
   "This proposal does not enable the Creator operator service.\n\n"+
   "TX: `"+manifest.deploymentTxHash+"`\nFactory: `"+manifest.address+"`"+
   "\nRuntime keccak256: `"+manifest.runtimeCodeKeccak256+"`"});
 return {number:pr.number,url:pr.html_url,draft:true};
}
