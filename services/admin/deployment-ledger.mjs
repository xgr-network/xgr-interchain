// Append-only, on-chain-verified deployment receipts to GitHub main.
// This module is for the future backend deployment executor ONLY. Never
// expose GitHub write credentials or this function to a browser-supplied
// receipt, address, bytecode hash, or unrestricted HTTP API.
import {keccak256} from "../../apps/web/keccak.mjs";
import {isObservedWalletExecutor} from "./wallet-executor.mjs";
import {rpcCall} from "./inspector.mjs";
import {approvedWorkInventory,assertCurrentMain} from "./main-gate.mjs";
import {readFileSync,existsSync} from "node:fs";
import {assetDeploymentFolder,chainDeploymentPath,loadChainDeployment,loadAssetDeployment} from "../../tools/manifest-layout.mjs";
import {join} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {loadCatalog,validateCatalog} from "../../tools/validate-manifests.mjs";

const SHA=/^[0-9a-f]{40}$/i, H32=/^0x[0-9a-f]{64}$/i;
const ADDR=/^0x[0-9a-f]{40}$/i;
const HEXCODE=/^0x(?:[0-9a-f]{2})+$/i;
const COMPONENTS=new Set([
 "blsVerifier","validatorRegistry","ism","transportBundle","mailbox","merkleTreeHook","requiredHook","nativeRouterDeployer","syntheticRouterDeployer","collateralRouterDeployer","factory","sourceRegistry",
 "nativeRouter","syntheticRouter","collateralRouter","gateway","feeVault","executionGateway"
]);
const EVENTS={
 "factory-router":{sig:"RouterDeployed(bytes32,address,address)",topicIndex:2},
 "factory-gateway":{sig:"RouteRegistered(bytes32,address,address)",topicIndex:3},
 "factory-feevault":{sig:"RouteRegistered(bytes32,address,address)",topicIndex:3},
 "factory-registry":{sig:"RegistryDeployed(address)",topicIndex:1},
 "transport-mailbox":{sig:"TransportDeployed(address,address,address)",topicIndex:1},
 "transport-merkle-hook":{sig:"TransportDeployed(address,address,address)",topicIndex:2},
 "transport-required-hook":{sig:"TransportDeployed(address,address,address)",topicIndex:3}
};
const equal=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const address=x=>ADDR.test(x||"")&&!/^0x0{40}$/i.test(x);
const h32=x=>H32.test(x||"")&&!/^0x0{64}$/i.test(x);
const asUint=(v,label)=>{
 if(typeof v!=="string"||!/^0x[0-9a-f]+$/i.test(v))throw Error("Invalid "+label);
 return BigInt(v);
};
const topicAddress=a=>"0x"+"0".repeat(24)+a.slice(2).toLowerCase();

function checkRegisteredTarget(root,chain,asset,routeName,component){
 const inventory=approvedWorkInventory(root);
 const approvedChain=inventory.chains.find(c=>c.name===chain);
 if(!approvedChain)throw Error("Chain is not in GitHub main: "+chain);
 if(!COMPONENTS.has(component))throw Error("Unknown deployment component");
 if(asset!==null && !Object.hasOwn(inventory.assets,asset))
  throw Error("Asset is not in GitHub main");
 if(routeName!==null && !inventory.routes.some(r=>
   r.asset===asset && r.name===routeName && (r.source===chain||r.destination===chain)))
  throw Error("Route is not in GitHub main");
 return {approvedChain,assetId:asset===null?null:inventory.assets[asset].assetId};
}
function proveCreation(receipt,componentAddress,provenance){
 if(provenance.kind==="create"){
  if(!equal(receipt.contractAddress,componentAddress) || receipt.to)
   throw Error("Direct contract creation receipt does not match deployed address");
  return {kind:"create"};
 }
 const event=EVENTS[provenance.kind];
 const transport=provenance.kind.startsWith("transport-");
 // On Base the reviewed user wallet may execute a factory call via its
 // observed smart-wallet executor. The receipt must still contain an exact
 // Factory-originated deployment event for this target, and the caller must
 // match the signed user wallet (verified separately below).
 // A SourceRegistry is created exactly once by its approved Factory.
 // Its RegistryDeployed event in a successful canonical receipt also proves
 // execution via an outer smart-wallet transaction on ANY supported chain.
 // All other Factory provenance rules remain unchanged.
 const factoryCreatorLog=(receipt.logs||[]).some(log=>
   provenance.kind==="factory-router"&&equal(log.address,provenance.factory)&&
   equal(log.topics?.[0],keccak256(EVENTS["factory-router"].sig))&&
   equal(log.topics?.[3],topicAddress(receipt.from))&&
   equal(log.topics?.[2],topicAddress(componentAddress)));
 const delegatedExecutor=isObservedWalletExecutor(receipt._chainId,receipt.to);
 if(!event||!address(provenance.factory)||
    (transport?!equal(receipt.contractAddress,provenance.factory)||receipt.to!==null:
      !(provenance.kind==="factory-registry"||equal(receipt.to,provenance.factory)||delegatedExecutor||factoryCreatorLog))||
    (provenance.kind==="factory-feevault"&&!address(provenance.gateway)))
  throw Error("Missing verified factory execution provenance");
 const topic0=keccak256(event.sig);
 const logs=receipt.logs||[];
 const matched=logs.some(log=>Array.isArray(log.topics)&&
   equal(log.address,provenance.factory)&&equal(log.topics[0],topic0)&&
   equal(log.topics[event.topicIndex],topicAddress(provenance.kind==="factory-feevault"?provenance.gateway:componentAddress))&&
   (!provenance.routeId || equal(log.topics[1],provenance.routeId))&&
   (!provenance.assetId || equal(log.topics[1],provenance.assetId)));
 if(!matched)throw Error("Factory did not emit the expected deployment event");
 return {kind:provenance.kind,factory:provenance.factory.toLowerCase(),
   ...(provenance.routeId?{routeId:provenance.routeId.toLowerCase()}:{}),
   ...(provenance.assetId?{assetId:provenance.assetId.toLowerCase()}:{}),
   ...(provenance.kind==="factory-feevault"?{gateway:provenance.gateway.toLowerCase()}:{})};
}

/**
 * Verify a SINGLE contract against a FINALIZED RPC receipt and a runtime
 * bytecode fingerprint obtained from a commit-pinned trusted build planner.
 * No caller-supplied "already verified" flag is accepted.
 *
 * Unlike a GitHub Issue comment, this evidence cannot be manually promoted
 * to active route status; separate BLS route proof is still mandatory.
 */
export async function verifyDeploymentReceipt(root,input,{rpc=rpcCall,now=()=>new Date().toISOString()}={}){
 const {
  sourceCommit,chain,asset=null,routeName=null,component,contractAddress,
  txHash,expectedRuntimeKeccak256,expectedDeployer,provenance={kind:"create"}
 }=input||{};
 if(!SHA.test(sourceCommit||"")||!address(contractAddress)||
    !h32(txHash)||!h32(expectedRuntimeKeccak256)||!address(expectedDeployer))
  throw Error("Missing deployment artifact, wallet, transaction or source commit");
 if(provenance.routeId&&!h32(provenance.routeId))throw Error("Invalid Route ID");
 if(provenance.assetId&&!h32(provenance.assetId))throw Error("Invalid Asset ID");
 const {approvedChain:c,assetId}=checkRegisteredTarget(root,chain,asset,routeName,component);
 const url=c.rpcUrls?.[0];
 if(typeof url!=="string"||!url.startsWith("https://"))throw Error("No HTTPS chain RPC");
 const [chainID,receipt,head]=await Promise.all([
  rpc(url,"eth_chainId",[]),
  rpc(url,"eth_getTransactionReceipt",[txHash.toLowerCase()]),
  rpc(url,"eth_blockNumber",[])
 ]);
 if(asUint(chainID,"RPC chain ID")!==BigInt(c.chainId))throw Error("RPC network does not match main");
 if(!receipt||asUint(receipt.status,"transaction status")!==1n||
    !equal(receipt.transactionHash,txHash)||
    !equal(receipt.from,expectedDeployer))
  throw Error("Transaction not successful or not signed by expected deployer");
 const blockNumber=asUint(receipt.blockNumber,"receipt block");
 const currentHead=asUint(head,"head");
 const confirmations=currentHead>=blockNumber?currentHead-blockNumber+1n:0n;
 if(confirmations<BigInt(c.confirmations))throw Error("Deployment not sufficiently confirmed");
 if(!h32(receipt.blockHash))throw Error("No canonical receipt block hash");
 const blockTag="0x"+blockNumber.toString(16);
 // Always authenticate the canonical creation block AND its Factory event (or
 // direct-create address) before accepting any code snapshot.
 const block=await rpc(url,"eth_getBlockByNumber",[blockTag,false]);
 if(!block||!equal(block.hash,receipt.blockHash)||
    asUint(block.number,"block number")!==blockNumber)
  throw Error("Receipt block does not match canonical chain");
 const origin=proveCreation({...receipt,_chainId:c.chainId},contractAddress,provenance);
 let bytecode,codeObservedAt=blockTag;
 try{
  bytecode=await rpc(url,"eth_getCode",[contractAddress.toLowerCase(),blockTag]);
 }catch(error){
  // Public Arbitrum RPCs retain canonical receipts/blocks but may prune old
  // contract state. For these FINALIZED, authenticated creations only, code
  // observable at latest is independently required to match the exact
  // pinned artifact/runtime hash. Never override bad code, failed receipts,
  // wrong-chain responses, or non-archive RPC errors.
  const reason=String(error?.message||error);
  const pruned=/\\bhistorical state\\b.*\\b(?:not available|missing|pruned)\\b|\\bmissing trie node\\b|\\bstate\\b.*\\bis not available\\b/i.test(reason);
  if(c.chainId!==42161||!pruned)throw error;
  bytecode=await rpc(url,"eth_getCode",[contractAddress.toLowerCase(),"latest"]);
  codeObservedAt="latest";
 }
 if(typeof bytecode!=="string"||!HEXCODE.test(bytecode))
  throw Error("No contract bytecode at authenticated deployment or current Arbitrum state");
 const observedHash=keccak256(Uint8Array.from(Buffer.from(bytecode.slice(2),"hex")));
 if(!equal(observedHash,expectedRuntimeKeccak256))
  throw Error("Runtime code hash differs from the main-approved build");
 return {
  schemaVersion:1,kind:"xita-v315-deployment-receipt",network:"mainnet",
  approval:{ref:"main",sourceCommit:sourceCommit.toLowerCase()},
  chain,chainId:c.chainId,domainId:c.domainId,component,asset,assetId,routeName,
  address:contractAddress.toLowerCase(),runtimeCodeKeccak256:observedHash,
  transactionHash:txHash.toLowerCase(),blockNumber:Number(blockNumber),
  blockHash:receipt.blockHash.toLowerCase(),confirmations:Number(confirmations),
  deployer:expectedDeployer.toLowerCase(),provenance:origin,
  ...(codeObservedAt==="latest"?{runtimeCodeObservation:{
    blockTag:"latest",reason:"arbitrum-pruned-historical-state",
    creationBlock: Number(blockNumber)
  }}:{}),
  status:"onchain-deployment-verified",recordedAt:now()
 };
}
export function deploymentReceiptPath(record){
 if(record?.kind!=="xita-v315-deployment-receipt"||
    !/^[a-z][a-z0-9-]{1,50}$/.test(record.chain||"")||
    !h32(record.transactionHash)||!address(record.address))
  throw Error("Invalid immutable deployment receipt path");
 // A Factory transaction may create multiple contracts: include address.
 return "deployments/receipts/"+
   record.chain+"/"+record.transactionHash.slice(2)+"-"+record.address.slice(2)+".json";
}
function encodeJSON(o){return JSON.stringify(o,null,2)+"\n";}

/** Rebuild the website snapshot from the exact main-approved source manifests
 * and this batch's verified deployment indexes. The website is NEVER a
 * source of contract truth and must be pinned to the same atomic Git commit.
 * Fail closed when the checked-out main already has a stale generated catalog.
 */
export function updatedDeploymentWebCatalog(root,{
  assets=new Map(),infrastructure=new Map()
}={}){
 const canonical=loadCatalog(root);
 const baseline={schemaVersion:1,...canonical};
 const published=JSON.parse(readFileSync(join(root,"apps/web/catalog.json"),"utf8"));
 if(!isDeepStrictEqual(published,baseline))
  throw Error("Web catalog differs from approved main; regenerate and commit before recording deployments");
 for(const [asset,index] of assets){
  if(!Object.hasOwn(canonical.assets,asset))throw Error("Unknown deployment asset "+asset);
  canonical.assets[asset].deployment=index;
 }
 for(const [chain,index] of infrastructure){
  if(!Object.hasOwn(canonical.infrastructure,chain))throw Error("Unknown deployment chain "+chain);
  canonical.infrastructure[chain]=index;
 }
 const errors=validateCatalog(canonical);
 if(errors.length)throw Error("Deployment-generated web catalog invalid: "+errors.join("; "));
 return encodeJSON({schemaVersion:1,...canonical});
}

/** Single GitHub fast-forward commit for all receipts produced by one Deploy
 * run. On any GitHub conflict/failure, the local journal MUST retain proof for
 * retry: no blockchain transaction can ever be rolled back by a GitHub error.
 */
export async function publishDeploymentBatch(root,inputs,{
  fetcher=fetch,git,token=process.env.XITA_GITHUB_TOKEN,
  rpc=rpcCall,repo="xgr-network/xgr-interchain",now
}={}){
 if(!token)throw Error("GitHub deployment-record writer token not configured");
 if(!Array.isArray(inputs)||!inputs.length||inputs.length>128)
  throw Error("Invalid deployment receipt batch");
 // Authorization is the most recent MAIN at the beginning of this publish.
 const opts={repo,fetcher,token,...(git?{git}:{})};
 const main=await assertCurrentMain(root,opts);
 for(const item of inputs){
  if(!equal(item?.sourceCommit,main))throw Error("Receipt was not authorized by this main commit");
 }
 const receipts=[];
 for(const item of inputs)receipts.push(await verifyDeploymentReceipt(root,item,{rpc,now}));
 const paths=new Set(),entries=[];
 for(const receipt of receipts){
  const path=deploymentReceiptPath(receipt);
  if(paths.has(path))throw Error("Duplicate deployment receipt in batch");
  paths.add(path);
  entries.push({path,mode:"100644",type:"blob",content:encodeJSON(receipt)});
 }
 const api="https://api.github.com/repos/"+repo;
 const headers={
  "Accept":"application/vnd.github+json",
  "Authorization":"Bearer "+token,
  "X-GitHub-Api-Version":"2022-11-28",
  "Content-Type":"application/json"
 };
 async function request(path,method="GET",body){
  const result=await fetcher(api+path,{
   method,headers,cache:"no-store",signal:AbortSignal.timeout(8000),
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(!result.ok)return {ok:false,status:result.status};
  return {ok:true,json:await result.json()};
 }
 // Refuse conflicting records; never change or overwrite observations.
 for(const entry of entries){
  const r=await request("/contents/"+entry.path+"?ref=main");
  if(r.ok)throw Error("Deployment receipt already exists: "+entry.path);
  if(r.status!==404)throw Error("Cannot confirm append-only GitHub receipt path");
 }
 // Each index is created only when its first verified receipt exists.
 async function optionalIndex(path){
  const r=await request("/contents/"+path+"?ref=main"),localPath=join(root,path);
  if(!r.ok){
   if(r.status!==404||existsSync(localPath))throw Error("Unresolved deployment index: "+path);
   return null;
  }
  if(!existsSync(localPath)||typeof r.json?.content!=="string"||r.json.encoding!=="base64")
   throw Error("Deployment index not present in approved checkout: "+path);
  const remote=JSON.parse(Buffer.from(r.json.content.replace(/\s/g,""),"base64").toString("utf8"));
  const local=JSON.parse(readFileSync(localPath,"utf8"));
  if(JSON.stringify(remote)!==JSON.stringify(local))
   throw Error("Deployment index differs from approved main checkout: "+path);
  return remote;
 }
 const inventory=approvedWorkInventory(root);
 const routers=new Set(["nativeRouter","syntheticRouter","collateralRouter"]);
 const byAsset=new Map(),updatedAssets=new Map();
 for(const r of receipts)if(r.asset!==null){
  const arr=byAsset.get(r.asset)||[];arr.push(r);byAsset.set(r.asset,arr);
 }
 for(const [asset,records] of byAsset){
  const info=inventory.assets[asset];
  if(!info)throw Error("Unknown verified asset: "+asset);
  const base=assetDeploymentFolder(asset,info.assetId);
  const representationPath=base+"/representations.json";
  let reps=await optionalIndex(representationPath);
  if(reps&&(reps.kind!=="asset-representations"||reps.schemaVersion!==1||
    reps.asset!==asset||!equal(reps.assetId,info.assetId)||!Array.isArray(reps.representations)))
   throw Error("Representation index binding mismatch: "+asset);
  const normalized=structuredClone(loadAssetDeployment(root,asset,info.assetId));
  const routeIndexes=new Map();
  let reprUpdated=false;
  for(const receipt of records){
   const path=deploymentReceiptPath(receipt);
   if(routers.has(receipt.component)){
    if(!reps)reps={schemaVersion:1,kind:"asset-representations",asset,assetId:info.assetId,representations:[]};
    const item={chain:receipt.chain,component:receipt.component,
      address:receipt.address,runtimeCodeKeccak256:receipt.runtimeCodeKeccak256,receiptPath:path};
    if(reps.representations.some(v=>v.receiptPath===path||
      (v.chain===item.chain&&equal(v.address,item.address))))
     throw Error("Duplicate asset representation: "+path);
    reps.representations.push(item);
    normalized.representations.push(item);
    normalized.receiptPaths.push(path);
    reprUpdated=true;
    continue;
   }
   if(!["gateway","feeVault"].includes(receipt.component))
    throw Error("Unknown asset deployment component: "+receipt.component);
   const routeId=receipt.provenance?.routeId?.toLowerCase();
   const planned=info.routes.find(r=>r.name===receipt.routeName);
   if(!h32(routeId)||!planned||planned.source!==receipt.chain)
    throw Error("Missing bound routeId or wrong directed source for "+receipt.component);
   const routePath=base+"/routes/"+routeId.slice(2)+".json";
   let route=routeIndexes.get(routePath);
   if(!route){
    route=await optionalIndex(routePath);
    if(!route)route={schemaVersion:1,kind:"asset-route-deployment",asset,assetId:info.assetId,
      routeId,routeName:planned.name,sourceChain:planned.source,
      destinationChain:planned.destination,components:{},receiptPaths:[]};
    if(route.kind!=="asset-route-deployment"||route.schemaVersion!==1||
       route.asset!==asset||!equal(route.assetId,info.assetId)||
       !equal(route.routeId,routeId)||route.routeName!==planned.name||
       route.sourceChain!==planned.source||route.destinationChain!==planned.destination)
     throw Error("Route instance binding mismatch: "+routePath);
    route=structuredClone(route);routeIndexes.set(routePath,route);
   }
   if(route.components[receipt.component]||route.receiptPaths.includes(path))
    throw Error("Route component already indexed: "+receipt.component);
   route.components[receipt.component]={
     address:receipt.address,runtimeCodeKeccak256:receipt.runtimeCodeKeccak256,receiptPath:path
   };
   route.receiptPaths.push(path);
   normalized.receiptPaths.push(path);
  }
  if(reprUpdated){
   reps.representations.sort((a,b)=>a.chain.localeCompare(b.chain)||a.address.localeCompare(b.address));
   normalized.representations.sort((a,b)=>a.chain.localeCompare(b.chain)||a.address.localeCompare(b.address));
   entries.push({path:representationPath,mode:"100644",type:"blob",content:encodeJSON(reps)});
  }
  for(const [path,route] of routeIndexes){
   route.receiptPaths.sort();
   entries.push({path,mode:"100644",type:"blob",content:encodeJSON(route)});
   const index=normalized.routeDeployments.findIndex(x=>equal(x.routeId,route.routeId));
   if(index<0)normalized.routeDeployments.push(structuredClone(route));
   else normalized.routeDeployments[index]=structuredClone(route);
  }
  normalized.receiptPaths.sort();normalized.present=true;
  normalized.routeDeployments.sort((a,b)=>a.routeId.localeCompare(b.routeId));
  updatedAssets.set(asset,normalized);
 }
 // Non-XGR chains get their first deployment file ONLY on the first receipt.
 const infraParts=new Set(["blsVerifier","validatorRegistry","ism","transportBundle","mailbox","merkleTreeHook","requiredHook","nativeRouterDeployer",
   "syntheticRouterDeployer","collateralRouterDeployer","factory","sourceRegistry",
   "executionGateway"]);
 const byChain=new Map(),updatedInfrastructure=new Map();
 for(const r of receipts)if(r.asset===null&&infraParts.has(r.component)){
  const arr=byChain.get(r.chain)||[];arr.push(r);byChain.set(r.chain,arr);
 }
 for(const [chain,records] of byChain){
  const chainInfo=inventory.chains.find(x=>x.name===chain);
  if(!chainInfo)throw Error("Unapproved chain: "+chain);
  const path=chainDeploymentPath(chain);
  const remote=await optionalIndex(path);
  const value=remote?structuredClone(remote):loadChainDeployment(root,chainInfo);
  if(value.kind!=="infrastructure-deployment"||value.chain!==chain||
     value.chainId!==chainInfo.chainId||value.domainId!==chainInfo.domainId||
     value.xitaV315?.schemaVersion!==1||
     !Array.isArray(value.xitaV315.receiptPaths)||
     typeof value.xitaV315.components!=="object")
   throw Error("Chain infrastructure index identity mismatch: "+chain);
  delete value.present;
  for(const r of records){
   if(value.xitaV315.components[r.component])
    throw Error("Cannot overwrite deployed chain component: "+r.component);
   const receiptPath=deploymentReceiptPath(r);
   value.xitaV315.components[r.component]={
    address:r.address,runtimeCodeKeccak256:r.runtimeCodeKeccak256,receiptPath
   };
   value.xitaV315.receiptPaths.push(receiptPath);
  }
  value.xitaV315.receiptPaths.sort();
  entries.push({path,mode:"100644",type:"blob",content:encodeJSON(value)});
  updatedInfrastructure.set(chain,{...value,present:true});
 }
 // Same immutable receipt commit must include the rebuilt public snapshot.
 // Otherwise the next ./manage.sh update fails --check, blocking UI publication.
 if(updatedAssets.size||updatedInfrastructure.size){
  entries.push({
   path:"apps/web/catalog.json",mode:"100644",type:"blob",
   content:updatedDeploymentWebCatalog(root,{
    assets:updatedAssets,infrastructure:updatedInfrastructure
   })
  });
 }
 const commitInfo=await request("/git/commits/"+main);
 if(!commitInfo.ok||!SHA.test(commitInfo.json?.tree?.sha||""))
  throw Error("Cannot verify main Git tree");
 const tree=await request("/git/trees","POST",{
  base_tree:commitInfo.json.tree.sha,tree:entries
 });
 if(!tree.ok||!SHA.test(tree.json?.sha||""))throw Error("GitHub refused receipt tree");
 const commit=await request("/git/commits","POST",{
  message:"record(deploy): verified v3.1.5 chain receipts ["+receipts.length+"]",
  tree:tree.json.sha,parents:[main]
 });
 if(!commit.ok||!SHA.test(commit.json?.sha||""))throw Error("GitHub refused deployment record commit");
 // force:false is a CAS-style fast-forward check: if main moved, this new
 // commit is not a descendant of its current tip and GitHub rejects it.
 const update=await request("/git/refs/heads/main","PATCH",{
  sha:commit.json.sha,force:false
 });
 if(!update.ok||!equal(update.json?.object?.sha,commit.json.sha))
  throw Error("GitHub main changed or branch policy blocked automatic recording; retain receipts locally");
 return {published:true,commit:commit.json.sha,sourceCommit:main,paths:[...paths],
  records:receipts.length,repository:repo};
}
