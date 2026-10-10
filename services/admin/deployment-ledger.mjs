// Append-only, on-chain-verified deployment receipts to GitHub main.
// This module is for the future backend deployment executor ONLY. Never
// expose GitHub write credentials or this function to a browser-supplied
// receipt, address, bytecode hash, or unrestricted HTTP API.
import {keccak256} from "../../apps/web/keccak.mjs";
import {rpcCall} from "./inspector.mjs";
import {approvedWorkInventory,assertCurrentMain} from "./main-gate.mjs";

const SHA=/^[0-9a-f]{40}$/i, H32=/^0x[0-9a-f]{64}$/i;
const ADDR=/^0x[0-9a-f]{40}$/i;
const HEXCODE=/^0x(?:[0-9a-f]{2})+$/i;
const COMPONENTS=new Set([
 "blsVerifier","validatorRegistry","ism","factory","sourceRegistry",
 "nativeRouter","syntheticRouter","collateralRouter","gateway","feeVault"
]);
const EVENTS={
 "factory-router":{sig:"RouterDeployed(bytes32,address,address)",topicIndex:2},
 "factory-gateway":{sig:"RoutePrepared(bytes32,address,address)",topicIndex:3},
 "factory-feevault":{sig:"RoutePrepared(bytes32,address,address)",topicIndex:3},
 "factory-registry":{sig:"RegistryDeployed(address)",topicIndex:1}
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
 if(!event||!address(provenance.factory)||!equal(receipt.to,provenance.factory)||
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
 const [block,bytecode]=await Promise.all([
  rpc(url,"eth_getBlockByNumber",[blockTag,false]),
  rpc(url,"eth_getCode",[contractAddress.toLowerCase(),blockTag])
 ]);
 if(!block||!equal(block.hash,receipt.blockHash)||
    asUint(block.number,"block number")!==blockNumber)
  throw Error("Receipt block does not match canonical chain");
 if(typeof bytecode!=="string"||!HEXCODE.test(bytecode))
  throw Error("No contract code at the deployment block");
 const observedHash=keccak256(Uint8Array.from(Buffer.from(bytecode.slice(2),"hex")));
 if(!equal(observedHash,expectedRuntimeKeccak256))
  throw Error("Runtime code hash differs from the main-approved build");
 const origin=proveCreation(receipt,contractAddress,provenance);
 return {
  schemaVersion:1,kind:"xita-v315-deployment-receipt",network:"mainnet",
  approval:{ref:"main",sourceCommit:sourceCommit.toLowerCase()},
  chain,chainId:c.chainId,domainId:c.domainId,component,asset,assetId,routeName,
  address:contractAddress.toLowerCase(),runtimeCodeKeccak256:observedHash,
  transactionHash:txHash.toLowerCase(),blockNumber:Number(blockNumber),
  blockHash:receipt.blockHash.toLowerCase(),confirmations:Number(confirmations),
  deployer:expectedDeployer.toLowerCase(),provenance:origin,
  status:"onchain-deployment-verified",recordedAt:now()
 };
}
export function deploymentReceiptPath(record){
 if(record?.kind!=="xita-v315-deployment-receipt"||
    !/^[a-z][a-z0-9-]{1,50}$/.test(record.chain||"")||
    !h32(record.transactionHash)||!address(record.address))
  throw Error("Invalid immutable deployment receipt path");
 // A Factory transaction may create multiple contracts: include address.
 return "deployments/mainnet/receipts/"+
   record.chain+"/"+record.transactionHash.slice(2)+"-"+record.address.slice(2)+".json";
}
function encodeJSON(o){return JSON.stringify(o,null,2)+"\n";}

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
 // Each asset has exactly one git-tracked index of its deployment receipts.
 // This index is updated in the SAME Git commit as the immutable receipts.
 // The operator never needs to copy addresses or edit JSON manually.
 const byAsset=new Map();
 for(const receipt of receipts){
  if(receipt.asset===null)continue;
  const arr=byAsset.get(receipt.asset)||[];
  arr.push(deploymentReceiptPath(receipt));
  byAsset.set(receipt.asset,arr);
 }
 for(const [asset,added] of byAsset){
  const path="deployments/mainnet/assets/"+asset+".json";
  const existing=await request("/contents/"+path+"?ref=main");
  if(!existing.ok||typeof existing.json.content!=="string"||
     existing.json.encoding!=="base64")
    throw Error("Cannot read canonical deployment index for "+asset);
  const original=JSON.parse(Buffer.from(existing.json.content.replace(/\s/g,""),"base64").toString("utf8"));
  const local=JSON.parse((await import("node:fs")).readFileSync(
    (await import("node:path")).join(root,path),"utf8"));
  if(JSON.stringify(original)!==JSON.stringify(local))
    throw Error("Asset deployment index on GitHub differs from approved main checkout");
  if(original.schemaVersion!==2||original.asset!==asset||
     original.assetId!==approvedWorkInventory(root).assets[asset].assetId||
     !Array.isArray(original.receiptPaths))
    throw Error("Deployment index identity mismatch for "+asset);
  for(const file of added){
   if(original.receiptPaths.includes(file))throw Error("Already indexed deployment receipt "+file);
   original.receiptPaths.push(file);
  }
  original.receiptPaths.sort();
  entries.push({path,mode:"100644",type:"blob",content:encodeJSON(original)});
 }
 // Update the canonical per-chain infrastructure index in the SAME atomic
 // Git commit as its immutable on-chain verified receipts. This is not the
 // fee-quorum transaction journal (it has no deployed bytecode).
 const infraComponents=new Set(["blsVerifier","validatorRegistry","ism","factory","sourceRegistry"]);
 const byChain=new Map();
 for(const receipt of receipts){
  if(receipt.asset!==null||!infraComponents.has(receipt.component))continue;
  const arr=byChain.get(receipt.chain)||[];
  arr.push(receipt);byChain.set(receipt.chain,arr);
 }
 for(const [chain,records] of byChain){
  const path="deployments/mainnet/infrastructure/"+chain+".json";
  const existing=await request("/contents/"+path+"?ref=main");
  if(!existing.ok||typeof existing.json.content!=="string"||
     existing.json.encoding!=="base64")throw Error("Missing approved chain deployment index "+chain);
  const original=JSON.parse(Buffer.from(existing.json.content.replace(/\\s/g,""),"base64").toString("utf8"));
  const local=JSON.parse((await import("node:fs")).readFileSync(
    (await import("node:path")).join(root,path),"utf8"));
  if(JSON.stringify(original)!==JSON.stringify(local)||
     original.chain!==chain||original.kind!=="infrastructure-deployment"||
     original.xitaV315?.schemaVersion!==1||
     !Array.isArray(original.xitaV315.receiptPaths)||
     typeof original.xitaV315.components!=="object")
    throw Error("Chain infrastructure index differs from approved main");
  for(const receipt of records){
   if(original.xitaV315.components[receipt.component])
    throw Error("Existing chain infrastructure component cannot be silently replaced: "+receipt.component);
   const receiptPath=deploymentReceiptPath(receipt);
   if(original.xitaV315.receiptPaths.includes(receiptPath))
    throw Error("Already indexed chain infrastructure receipt");
   original.xitaV315.components[receipt.component]={
    address:receipt.address,runtimeCodeKeccak256:receipt.runtimeCodeKeccak256,
    receiptPath
   };
   original.xitaV315.receiptPaths.push(receiptPath);
  }
  original.xitaV315.receiptPaths.sort();
  entries.push({path,mode:"100644",type:"blob",content:encodeJSON(original)});
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
