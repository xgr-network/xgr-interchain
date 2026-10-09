#!/usr/bin/env node
import {readFileSync,readdirSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const address=x=>typeof x==="string"&&/^0x[0-9a-f]{40}$/i.test(x)&&!/^0x0{40}$/.test(x);
const hash=x=>typeof x==="string"&&/^0x[0-9a-f]{64}$/i.test(x)&&!/^0x0{64}$/.test(x);
const fee=x=>typeof x==="string"&&/^[1-9][0-9]*$/.test(x);
function json(root,path){return JSON.parse(readFileSync(join(root,path),"utf8"))}
function files(root,rel){return readdirSync(join(root,rel),{withFileTypes:true}).filter(x=>x.isFile()&&x.name.endsWith(".json")).map(x=>x.name)}
export function loadCatalog(root=ROOT){
 const chains={},assets={},infrastructure={};
 for(const file of files(root,"config/chains")){const n=file.slice(0,-5);chains[n]=json(root,"config/chains/"+file)}
 for(const chain of Object.keys(chains))infrastructure[chain]=json(root,"deployments/mainnet/infrastructure/"+chain+".json");
 for(const dir of readdirSync(join(root,"config/assets"),{withFileTypes:true}).filter(x=>x.isDirectory())){
  const n=dir.name;assets[n]={metadata:json(root,`config/assets/${n}/asset.json`),profile:json(root,`config/assets/${n}/metadata.json`),routes:json(root,`config/assets/${n}/routes.json`),mainnet:json(root,`config/assets/${n}/mainnet.json`),deployment:json(root,`deployments/mainnet/assets/${n}.json`)};
 }
 return {chains,assets,infrastructure};
}
export function validateCatalog({chains,assets,infrastructure}){
 const errors=[];const check=(condition,detail)=>{if(!condition)errors.push(detail)};
 const ids=new Set(),domains=new Set(),routeKeys=new Set();
 check(chains.xgrchain?.chainId===1643&&chains.xgrchain?.domainId===1643,"XGRChain must remain canonical hub 1643");
 check(Object.keys(chains).length>=2,"missing spoke chains");
 for(const [name,c] of Object.entries(chains)){
  const p="config/chains/"+name;
  check(c.kind==="chain-config"&&c.schemaVersion===1&&c.name===name&&c.environment==="mainnet",p+": invalid identity");
  check(Number.isSafeInteger(c.chainId)&&c.chainId>0&&Number.isSafeInteger(c.domainId)&&c.domainId>0,p+": invalid chain/domain");
  check(!ids.has(c.chainId)&&!domains.has(c.domainId),p+": duplicate chainId or domainId");ids.add(c.chainId);domains.add(c.domainId);
  check(Array.isArray(c.rpcUrls)&&c.rpcUrls.length>0&&c.rpcUrls.every(x=>typeof x==="string"&&x.startsWith("https://")),p+": invalid RPC");
  check(Number.isSafeInteger(c.confirmations)&&c.confirmations>=1,p+": invalid confirmations");
  check(["compressed","eip2537"].includes(c.blsVerifierFormat),p+": invalid verifier");
  check(c.observedInfrastructure===`deployments/mainnet/infrastructure/${name}.json`,p+": wrong inventory path");
  const inf=infrastructure[name];check(!!inf,p+": infrastructure missing");if(!inf)continue;
  check(inf.kind==="infrastructure-deployment"&&inf.chain===name&&inf.chainId===c.chainId&&inf.domainId===c.domainId,p+": mismatched infrastructure");
  check(inf.ilnV314&&["unverified-not-activated","verified-deployed"].includes(inf.ilnV314.status),p+": invalid infrastructure state");
  if(inf.ilnV314?.status==="unverified-not-activated")check(["sourceRegistry","destinationRegistryV2","destinationIsmV2","blsVerifier"].every(k=>inf.ilnV314[k]===null),p+": pending infrastructure contains deployed security addresses");
  else {
   check(Number.isSafeInteger(inf.ilnV314.verifiedAtBlock)&&inf.ilnV314.verifiedAtBlock>0,p+": missing verifiedAtBlock");
   check(["sourceRegistry","destinationRegistryV2","destinationIsmV2","blsVerifier"].every(k=>inf.ilnV314[k]===null||address(inf.ilnV314[k])),p+": invalid contract address");
  }
  const core=inf.hyperlaneCore;
  check(!!core&&((core.mailbox===null&&core.merkleTreeHook===null)||(address(core.mailbox)&&address(core.merkleTreeHook))),p+": inconsistent Mailbox/Hook");
 }
 check(Object.keys(assets).length>=1,"no assets defined");
 for(const [name,a] of Object.entries(assets)){
  const p="config/assets/"+name,{metadata:m,profile:pub,routes:r,mainnet:mn,deployment:d}=a;
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
  check(pub?.market&&["none","explorer-xgr-price"].includes(pub.market.priceSource)&&
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
   reps.set(rep.chain,rep);
  }
  check(reps.get(m.canonical?.chain)?.representation===m.canonical?.representation,p+": canonical representation differs");
  check(r.kind==="asset-routes"&&r.asset===name&&r.protocol==="ILN-v3.1.4"&&r.routingHub==="xgrchain",p+": invalid routing manifest");
  const names=new Set(),pairs=new Set();
  for(const rt of r.routes||[]){
   check(!names.has(rt.name),p+": duplicate route name");names.add(rt.name);
   check(chains[rt.sourceChain]&&chains[rt.destinationChain]&&rt.sourceChain!==rt.destinationChain&&reps.has(rt.sourceChain)&&reps.has(rt.destinationChain),p+": invalid route endpoints");
   check(rt.sourceChain==="xgrchain"||rt.destinationChain==="xgrchain",p+": direct external-to-external route prohibited");
   check(["pending-governance","quorum-activated"].includes(rt.activation),p+": invalid activation");
   if(rt.activation==="pending-governance")check((rt.routeId===null&&rt.validatorFeeWei===null)||(hash(rt.routeId)&&fee(rt.validatorFeeWei)),p+": unapproved route requires null fields or complete route ID and fee");
   else check(hash(rt.routeId)&&fee(rt.validatorFeeWei),p+": activated route requires route ID/fee");
   if(hash(rt.routeId)){const key=rt.sourceChain+rt.destinationChain+rt.routeId.toLowerCase();check(!routeKeys.has(key),p+": duplicate canonical ILN route ID");routeKeys.add(key)}
   pairs.add(rt.sourceChain+":"+rt.destinationChain);
  }
  for(const rt of r.routes||[])check(pairs.has(rt.destinationChain+":"+rt.sourceChain),p+": missing reverse route "+rt.name);
  check(mn.routeManifest===p+"/routes.json"&&mn.deploymentManifest===`deployments/mainnet/assets/${name}.json`,p+": invalid manifest linkage");
  check(d.kind==="asset-deployment"&&d.asset===name&&d.network==="mainnet",p+": missing deployment shell");
  const observed=d.ilnV314?.routes||[];
  check(observed.length===(r.routes||[]).length,p+": routes differ from observed deployment");
  for(const rt of r.routes||[]){
   const obs=observed.find(x=>x.name===rt.name&&x.sourceChain===rt.sourceChain&&x.destinationChain===rt.destinationChain);
   check(!!obs,p+": missing observed route "+rt.name);if(!obs)continue;
   if(rt.routeId===null)check(["routeId","gateway","feeVault","warpRouter","validatorFeeWei","governanceTx"].every(k=>obs[k]===null),p+": pending route contains fictitious deployment");
   else check(obs.routeId?.toLowerCase()===rt.routeId?.toLowerCase()&&address(obs.gateway)&&address(obs.feeVault)&&address(obs.warpRouter)&&obs.validatorFeeWei===rt.validatorFeeWei,p+": deployed route missing corroboration");
   if(rt.activation==="quorum-activated")check(hash(obs.governanceTx)&&infrastructure[rt.sourceChain]?.ilnV314?.status==="verified-deployed"&&infrastructure[rt.destinationChain]?.ilnV314?.status==="verified-deployed",p+": activated route missing governance/infrastructure");
   else check(obs.governanceTx===null,p+": pending route contains governanceTx");
  }
  const active=(r.routes||[]).some(rt=>rt.activation==="quorum-activated");
  check(mn.ilnV314Activation===(active?"governance-confirmed":"not-authorized"),p+": incorrect activation summary");
  check(d.ilnV314?.status===(active?"active":(r.routes||[]).every(rt=>rt.routeId===null)?"unverified-not-activated":"deployed-pending-governance"),p+": incorrect deployment summary");
 }
 return errors;
}
export function validateRepository(root=ROOT){return validateCatalog(loadCatalog(root))}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const problems=validateRepository();if(problems.length){for(const x of problems)console.error("INVALID: "+x);process.exitCode=1}else console.log("PASS: XETA v3.1.4 chain, asset, hub and deployment manifests")}
 catch(err){console.error("INVALID: "+err.message);process.exitCode=1}
}
