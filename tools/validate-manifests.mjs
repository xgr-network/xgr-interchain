#!/usr/bin/env node
import {readdirSync,readFileSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {chainConfigPath,loadChainDeployment,listAssetFolders,loadAssetDeployment,assetConfigFolder,chainDeploymentPath} from "./manifest-layout.mjs";
import {canonicalAssetId} from "../services/admin/asset-state.mjs";
import {fileURLToPath} from "node:url";
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const address=x=>typeof x==="string"&&/^0x[0-9a-f]{40}$/i.test(x)&&!/^0x0{40}$/.test(x);
const hash=x=>typeof x==="string"&&/^0x[0-9a-f]{64}$/i.test(x)&&!/^0x0{64}$/.test(x);
const RECEIPT=/^deployments\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/;
const read=(root,path)=>JSON.parse(readFileSync(join(root,path),"utf8"));
export function loadCatalog(root=ROOT){
 const chains={},assets={},infrastructure={};
 for(const dir of readdirSync(join(root,"config/chains"),{withFileTypes:true}).filter(x=>x.isDirectory())){
  const chain=read(root,chainConfigPath(dir.name));
  if(chain.name!==dir.name)throw Error("Chain folder/identity mismatch: "+dir.name);
  chains[dir.name]=chain;
  infrastructure[dir.name]=loadChainDeployment(root,chain);
 }
 for(const item of listAssetFolders(root)){
  const {key,path,asset,assetId}=item;
  assets[key]={metadata:asset,profile:read(root,path+"/metadata.json"),routes:read(root,path+"/routes.json"),deployment:loadAssetDeployment(root,key,assetId)};
 }
 return {chains,assets,infrastructure,publication:read(root,"config/publication.json")};
}
export function validateCatalog({chains,assets,infrastructure,publication}){
 const errors=[];const check=(condition,detail)=>{if(!condition)errors.push(detail)};
 const ids=new Set(),domains=new Set(),routeKeys=new Set();
 check(publication?.schemaVersion===1&&publication?.kind==="xita-publication-policy"&&
   (publication.minimumLockedUsd===null||(typeof publication.minimumLockedUsd==="number"&&
   Number.isFinite(publication.minimumLockedUsd)&&publication.minimumLockedUsd>=0&&
   /^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,8})?$/.test(String(publication.minimumLockedUsd))))&&
   Number.isSafeInteger(publication.maxEvidenceAgeSeconds)&&publication.maxEvidenceAgeSeconds>=60&&
   publication.maxEvidenceAgeSeconds<=86400,
   "config/publication.json: invalid publication policy");
 check(chains.xgrchain?.chainId===1643&&chains.xgrchain?.domainId===1643,"XGRChain must remain canonical hub 1643");
 check(Object.keys(chains).length>=2,"missing spoke chains");
 for(const [name,c] of Object.entries(chains)){
  const p="config/chains/"+name;
  check(c.kind==="chain-config"&&c.schemaVersion===1&&c.name===name&&c.environment==="mainnet",p+": invalid identity");
  check(Number.isSafeInteger(c.chainId)&&c.chainId>0&&Number.isSafeInteger(c.domainId)&&c.domainId>0,p+": invalid chain/domain");
  check(c.displayName===undefined||(typeof c.displayName==="string"&&c.displayName.length>=2&&c.displayName.length<=60&&c.displayName.trim()===c.displayName),p+": invalid chain display name");
  check(!ids.has(c.chainId)&&!domains.has(c.domainId),p+": duplicate chainId or domainId");ids.add(c.chainId);domains.add(c.domainId);
  check(Array.isArray(c.rpcUrls)&&c.rpcUrls.length>0&&c.rpcUrls.every(x=>typeof x==="string"&&x.startsWith("https://")),p+": invalid RPC");
  check(Number.isSafeInteger(c.confirmations)&&c.confirmations>=1,p+": invalid confirmations");
  check(["compressed","eip2537"].includes(c.blsVerifierFormat),p+": invalid verifier");
  check(c.observedInfrastructure===chainDeploymentPath(name),p+": wrong inventory path");
  const inf=infrastructure[name];check(!!inf,p+": infrastructure missing");if(!inf)continue;
  check(inf.kind==="infrastructure-deployment"&&inf.chain===name&&inf.chainId===c.chainId&&inf.domainId===c.domainId,p+": mismatched infrastructure");
  check(!Object.hasOwn(inf,"ilnV314"),p+": legacy infrastructure block forbidden");
  check(Object.keys(inf).every(k=>["schemaVersion","kind","network","chain","chainId","domainId","xitaV315","present"].includes(k)),
    p+": legacy infrastructure address fields forbidden");
  const v315=inf.xitaV315;
  check(v315?.schemaVersion===1&&Array.isArray(v315?.receiptPaths)&&
    typeof v315?.components==="object"&&v315.components!==null&&!Array.isArray(v315.components)&&
    Object.keys(v315).every(k=>["schemaVersion","components","receiptPaths"].includes(k)),p+": invalid XITA v3.1.5 deployment index");
  if(v315?.components&&typeof v315.components==="object"){
   const allowed=new Set(["blsVerifier","validatorRegistry","ism","transportBundle","mailbox","dispatchHook","requiredHook","nativeRouterDeployer","syntheticRouterDeployer","collateralRouterDeployer","factory","sourceRegistry","executionGateway"]);
   for(const [component,item] of Object.entries(v315.components)){
    check(allowed.has(component)&&address(item?.address)&&
      hash(item?.runtimeCodeKeccak256)&&
      typeof item?.receiptPath==="string"&&
      /^deployments\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/.test(item.receiptPath)&&
      v315.receiptPaths.includes(item.receiptPath),p+": invalid component deployment binding "+component);
   }
  }
  // Alias is a reference to exactly the same verified deployment receipt.
  if(v315?.components?.requiredHook){
   const hook=v315.components.dispatchHook,alias=v315.components.requiredHook;
   check(!!hook&&hook.address?.toLowerCase()===alias.address?.toLowerCase()&&
    hook.runtimeCodeKeccak256?.toLowerCase()===alias.runtimeCodeKeccak256?.toLowerCase()&&
    hook.receiptPath===alias.receiptPath,
    p+": requiredHook must alias dispatchHook using the same receipt");
  }
  // No pre-XITA Mailbox, Hook, ISM or ValidatorAnnounce address is a
  // deployment proof. Fresh transport must be introduced explicitly
  // and independently verified before any Factory deployment.
 }
 check(Object.keys(assets).length>=1,"no assets defined");
 for(const [name,a] of Object.entries(assets)){
  const {metadata:m,profile:pub,routes:r,deployment:d}=a;
  const p=assetConfigFolder(name,m.assetId);
  // Publication is derived from verified deployments and the indexer database,
  // NEVER from a manually edited listing.json or an unverified transaction hash.
  check(!Object.hasOwn(a,"listing"),p+": legacy listing state forbidden");
  check(m.kind==="asset-config"&&m.schemaVersion===1&&m.asset===name&&Number.isInteger(m.decimals)&&m.decimals>=0&&m.decimals<=36,p+": invalid asset metadata");
  
  const publicName=x=>typeof x==="string"&&x.length>=1&&x.length<=120&&x.trim()===x;
  const url=x=>x===null||(typeof x==="string"&&x.length<=512&&/^https:\/\/[^/@\s?#]+(?:[/?#][^\s]*)?$/i.test(x));
  const refId=x=>x===null||(typeof x==="string"&&/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(x));
  check(pub?.kind==="xeta-token-profile"&&pub.schemaVersion===1&&pub.asset===name&&
    /^[a-z0-9-]{1,80}$/.test(pub.slug||"")&&publicName(pub.name)&&
    typeof pub.shortDescription==="string"&&pub.shortDescription.length>=15&&pub.shortDescription.length<=280&&
    typeof pub.description==="string"&&pub.description.length>=40&&pub.description.length<=5000,
    p+": invalid public token profile");
  check(Array.isArray(pub?.categories)&&pub.categories.length>=1&&pub.categories.length<=8&&
    pub.categories.every(publicName)&&new Set(pub.categories).size===pub.categories.length,
    p+": invalid profile categories");
  check(Array.isArray(pub?.tags)&&pub.tags.length<=16&&pub.tags.every(publicName),
    p+": invalid profile tags");
  check(pub?.branding&&typeof pub.branding.logoUrl==="string"&&url(pub.branding.logoUrl)&&url(pub.branding.bannerUrl),
    p+": invalid profile branding");
  check(pub?.links&&typeof pub.links.website==="string"&&url(pub.links.website)&&
    ["explorer","github","docs","whitepaper","x","linkedin","telegram","discord"].every(k=>url(pub.links[k])),
    p+": invalid profile links");
  check(pub?.market&&["none","explorer-xgr-price","coingecko"].includes(pub.market.priceSource)&&
    (pub.market.priceSource!=="explorer-xgr-price"||name==="XGR")&&refId(pub.market.coingeckoId)&&refId(pub.market.coinmarketcapId),
    p+": invalid profile market config");
  check(pub?.supply&&["circulating","total","max"].every(k=>
    pub.supply[k]===null||(typeof pub.supply[k]==="string"&&/^\d+$/.test(pub.supply[k]))),
    p+": invalid profile supply figures");
  check(["project-maintained","independently-reviewed"].includes(pub?.verification?.status),
    p+": invalid profile verification");

  check(chains[m.canonical?.chain]!==undefined,p+": unknown canonical chain");
  check(Array.isArray(m.representations)&&m.representations.length>=2,p+": missing representations");
  const reps=new Map();
  for(const rep of m.representations||[]){
   check(chains[rep.chain]!==undefined&&!reps.has(rep.chain),p+": invalid representation chain");
   check(["native","collateral","synthetic"].includes(rep.representation),p+": invalid representation");
   check(rep.assetAddress===null||address(rep.assetAddress),p+": invalid ERC20 address");
   if(rep.representation==="native")check(rep.assetAddress===null,p+": native address must be null");
   if(rep.representation==="collateral")
    check(address(rep.assetAddress),p+": collateral original ERC20 token address missing or invalid");
   reps.set(rep.chain,rep);
  }
  check(reps.get(m.canonical?.chain)?.representation===m.canonical?.representation,p+": canonical representation differs");
  check(r.kind==="asset-routes"&&r.asset===name&&r.protocol==="XITA-v3.1.5"&&r.routingHub==="xgrchain",p+": invalid routing manifest");
  const names=new Set(),pairs=new Set();
  for(const rt of r.routes||[]){
    check(!names.has(rt.name),p+": duplicate route name");names.add(rt.name);
    check(chains[rt.sourceChain]&&chains[rt.destinationChain]&&rt.sourceChain!==rt.destinationChain&&reps.has(rt.sourceChain)&&reps.has(rt.destinationChain),p+": invalid route endpoints");
    check(rt.sourceChain==="xgrchain"||rt.destinationChain==="xgrchain",p+": direct external-to-external route prohibited");
    check(!Object.hasOwn(rt,"validatorFeeWei")&&!Object.hasOwn(rt,"activation"),p+": deployment state must not be in config routes");
    pairs.add(rt.sourceChain+":"+rt.destinationChain);
  }
  for(const rt of r.routes||[])check(pairs.has(rt.destinationChain+":"+rt.sourceChain),p+": missing reverse route "+rt.name);
  check(!Object.hasOwn(a,"mainnet"),p+": redundant legacy mainnet manifest forbidden");

  let computedId=null;
  try{computedId=canonicalAssetId(m,chains)}
  catch(error){check(false,p+": canonical identity invalid: "+error.message)}
  check(computedId!==null&&String(m.assetId).toLowerCase()===computedId,p+": canonical asset ID mismatch");
  check(computedId!==null&&String(d.assetId).toLowerCase()===computedId,p+": canonical asset ID mismatch in deployment");
  check(d.kind==="asset-deployment"&&d.asset===name&&d.schemaVersion===3&&
    d.network==="mainnet"&&String(d.assetId).toLowerCase()===String(m.assetId).toLowerCase()&&
    d.sourceManifest===p+"/asset.json"&&Array.isArray(d.receiptPaths)&&
    Array.isArray(d.representations)&&Array.isArray(d.routeDeployments),p+": invalid asset deployment binding");
  check(d.receiptPaths.every(x=>typeof x==="string"&&RECEIPT.test(x)),p+": invalid deployment receipt reference");
  const deployedRouters=new Set();
  for(const repr of d.representations||[]){
   check(chains[repr.chain]&&["nativeRouter","syntheticRouter","collateralRouter"].includes(repr.component)&&
     address(repr.address)&&hash(repr.runtimeCodeKeccak256)&&RECEIPT.test(repr.receiptPath)&&
     d.receiptPaths.includes(repr.receiptPath),p+": invalid representation deployment");
   const id=repr.chain+":"+repr.address?.toLowerCase();
   check(!deployedRouters.has(id),p+": duplicate representation deployment");
   deployedRouters.add(id);
  }
  const routed=new Set();
  for(const route of d.routeDeployments||[]){
   check(hash(route.routeId)&&!routed.has(route.routeId),p+": invalid or duplicate route ID");
   routed.add(route.routeId);
   check(route.kind==="asset-route-deployment"&&route.asset===name&&
     String(route.assetId).toLowerCase()===String(m.assetId).toLowerCase()&&
     typeof route.routeName==="string"&&names.has(route.routeName)&&
     r.routes.some(v=>v.name===route.routeName&&v.sourceChain===route.sourceChain&&v.destinationChain===route.destinationChain),
     p+": route deployment not bound to declared endpoints");
   const components=route.components||{};
   check(Object.keys(components).length>0&&Object.keys(components).every(k=>["gateway","feeVault"].includes(k)),
     p+": invalid route deployment components");
   for(const item of Object.values(components)){
    check(address(item?.address)&&hash(item?.runtimeCodeKeccak256)&&RECEIPT.test(item.receiptPath)&&
      d.receiptPaths.includes(item.receiptPath),p+": invalid route component receipt");
   }
   check(Array.isArray(route.receiptPaths)&&
     Object.values(components).every(c=>route.receiptPaths.includes(c.receiptPath)),p+": route receipt index mismatch");
  }

 }
 return errors;
}
export function validateRepository(root=ROOT){return validateCatalog(loadCatalog(root))}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const problems=validateRepository();if(problems.length){for(const x of problems)console.error("INVALID: "+x);process.exitCode=1}else console.log("PASS: XITA v3.1.5 chain, asset, hub and deployment manifests")}
 catch(err){console.error("INVALID: "+err.message);process.exitCode=1}
}
