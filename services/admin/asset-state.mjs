// One canonical asset identity -> one deployment index and zero or more
// immutable, independently verifiable contract receipts and route instances.
// The desired state lives exclusively under config/. Observations NEVER
// authorize a contract or turn an inactive route into an active one.
import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {keccak256} from "../../apps/web/keccak.mjs";

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const ASSET_ID=/^0x[0-9a-fA-F]{64}$/;
const SHA=/^[0-9a-fA-F]{40}$/;
const RECEIPT_PATH=/^deployments\/mainnet\/receipts\/([a-z][a-z0-9-]*)\/([a-f0-9]{64})-([a-f0-9]{40})\.json$/;
const ZERO="0x"+"00".repeat(20);
const equal=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const read=(root,p)=>JSON.parse(readFileSync(join(root,p),"utf8"));
const hexBytes=x=>Uint8Array.from(Buffer.from(x.replace(/^0x/,""),"hex"));
const word=n=>{
 const x=BigInt(n),a=new Uint8Array(32);
 if(x<0n||x>=(1n<<256n))throw Error("ABI integer out of range");
 for(let i=31,v=x;i>=0&&v;i--,v>>=8n)a[i]=Number(v&255n);
 return a;
};
const addrWord=x=>{
 if(!ADDRESS.test(x||""))throw Error("Invalid origin ERC20 address");
 const o=new Uint8Array(32);o.set(hexBytes(x),12);return o;
};
export function canonicalAssetId(asset,chains){
 const origin=chains[asset?.canonical?.chain];
 if(!origin)throw Error("Missing canonical chain for asset "+asset?.asset);
 const original=asset?.canonical?.representation;
 const native=original==="native";
 if(!native&&original!=="collateral"&&original!=="erc20")
  throw Error("Canonical token must be native or original ERC20");
 const token=native?ZERO:asset.canonical.tokenAddress;
 if(!native&&(!ADDRESS.test(token||"")||equal(token,ZERO)))
  throw Error("Original ERC20 address required in config for "+asset.asset);
 if(native&&asset.canonical.tokenAddress!==undefined&&asset.canonical.tokenAddress!==null)
  throw Error("Native token must not have an ERC20 address");
 const domain=hexBytes(keccak256("XITA_ASSET_V315"));
 const encoded=new Uint8Array(128);
 encoded.set(domain,0);
 encoded.set(word(origin.chainId),32);
 encoded.set(addrWord(token),64);
 encoded.set(word(native?0:1),96);
 return keccak256(encoded).toLowerCase();
}
const clean=s=>String(s||"").toLowerCase();
function verifyReceipts(root,deployed,key,assetId,chains,routeNames){
 const result=[];
 const seen=new Set();
 for(const path of deployed.receiptPaths){
  const match=RECEIPT_PATH.exec(path);
  if(!match)throw Error("Invalid deployment receipt path for "+key);
  if(seen.has(path))throw Error("Duplicate receipt reference for "+key);
  seen.add(path);
  const item=read(root,path);
  if(item.kind!=="xita-v315-deployment-receipt"||
     item.status!=="onchain-deployment-verified"||
     item.asset!==key||!equal(item.assetId,assetId)||
     !equal(item.address,"0x"+match[3])||
     !equal(item.transactionHash,"0x"+match[2])||
     item.chain!==match[1]||
     !chains[item.chain]||item.chainId!==chains[item.chain].chainId||
     item.domainId!==chains[item.chain].domainId||
     item.approval?.ref!=="main"||!SHA.test(item.approval.sourceCommit||""))
    throw Error("Receipt is not bound to canonical asset "+key+": "+path);
  if(item.routeName!==null&&!routeNames.has(item.routeName))
    throw Error("Receipt references removed or foreign route: "+item.routeName);
  result.push({...item,receiptPath:path});
 }
 return result;
}
function routeState(route,receipts){
 const records=receipts.filter(r=>r.routeName===route.name);
 const identifiers=[...new Set(records.map(r=>r.routeId||r.provenance?.routeId).filter(Boolean).map(clean))];
 // Routers belong to ONE asset representation on a chain, independent
 // of route direction. Gateways and FeeVaults remain route-specific.
 const routerComponents=new Set(["nativeRouter","syntheticRouter","collateralRouter"]);
 const addressFor=(component,chain)=>
  receipts.filter(r=>r.component===component&&r.chain===chain&&
   (routerComponents.has(component)?(r.routeName===null||r.routeName===route.name):
    r.routeName===route.name)).map(r=>r.address);
 const components={
  sourceRouters:[...new Set([...addressFor("nativeRouter",route.source),...addressFor("collateralRouter",route.source),...addressFor("syntheticRouter",route.source)])],
  destinationRouters:[...new Set([...addressFor("nativeRouter",route.destination),...addressFor("collateralRouter",route.destination),...addressFor("syntheticRouter",route.destination)])],
  gateways:addressFor("gateway",route.source),
  feeVaults:addressFor("feeVault",route.source)
 };
 // Recorded != active. Routes remain "deployed" at most until an actual
 // reciprocal BLS-verified activation record is separately verified.
 const ready=identifiers.length===1&&Object.values(components).every(a=>a.length===1);
 const status=records.length===0?"not-deployed":ready?"deployed":"partial";
 return {...route,routeIds:identifiers,components,receipts:records.map(r=>r.receiptPath),
  receiptCount:records.length,status,
  note:ready?"Contracts documented, activation still requires live BLS verification":
   records.length?"Incomplete or unpaired on-chain deployment evidence":"No verified deployments recorded"};
}
export function buildAssetState(root,chains,isHubHop){
 const assets={},routes=[],ids=new Map();
 const names=readdirSync(join(root,"config/assets"),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
 for(const key of names){
  const cfg=read(root,"config/assets/"+key+"/asset.json");
  const desired=read(root,"config/assets/"+key+"/routes.json");
  const pointer=read(root,"config/assets/"+key+"/mainnet.json");
  const depPath="deployments/mainnet/assets/"+key+".json";
  if(cfg.asset!==key||desired.asset!==key||pointer.asset!==key||
     pointer.deploymentManifest!==depPath||pointer.routeManifest!=="config/assets/"+key+"/routes.json")
    throw Error("Configuration/deployment link mismatch: "+key);
  const assetId=canonicalAssetId(cfg,chains);
  if(ids.has(assetId))throw Error("Duplicate canonical Asset ID: "+key+" and "+ids.get(assetId));
  ids.set(assetId,key);
  const deployed=read(root,depPath);
  if(deployed.kind!=="asset-deployment"||deployed.schemaVersion!==2||
     deployed.asset!==key||!equal(deployed.assetId,assetId)||
     deployed.sourceManifest!=="config/assets/"+key+"/asset.json"||
     !Array.isArray(deployed.receiptPaths))
    throw Error("Deployment manifest must point to EXACT canonical asset: "+key);
  const declared=desired.routes||[];
  if(desired.routingHub!=="xgrchain"||
     desired.protocol!=="XITA-v3.1.5"||!Array.isArray(declared))
    throw Error("Invalid XITA v3.1.5 route manifest: "+key);
  const routeNames=new Set();
  for(const r of declared){
   if(typeof r.name!=="string"||routeNames.has(r.name)||
      !Array.isArray(cfg.representations)||
      !cfg.representations.some(v=>v.chain===r.sourceChain)||
      !cfg.representations.some(v=>v.chain===r.destinationChain)||
      !isHubHop(chains[r.sourceChain],chains[r.destinationChain]))
    throw Error("Invalid/duplicate XGRChain-only route in "+key+": "+r.name);
   routeNames.add(r.name);
  }
  const receipts=verifyReceipts(root,deployed,key,assetId,chains,routeNames);
  const byChain=Object.fromEntries(cfg.representations.map(rep=>{
   if(!chains[rep.chain])throw Error("Unknown representation chain: "+rep.chain);
   const records=receipts.filter(r=>r.chain===rep.chain);
   return [rep.chain,{chain:rep.chain,role:rep.representation,symbol:rep.symbol,
    originalTokenAddress:rep.chain===cfg.canonical.chain?(cfg.canonical.tokenAddress||null):null,
    deployedContracts:records.map(r=>({component:r.component,address:r.address,routeName:r.routeName,receipt:r.receiptPath})),
    status:records.length?"documented":"not-deployed"}];
  }));
  const boundRoutes=declared.map(r=>routeState({
   asset:key,assetId,name:r.name,source:r.sourceChain,destination:r.destinationChain,
   sourceChainId:chains[r.sourceChain].chainId,destinationChainId:chains[r.destinationChain].chainId,
   routeId:null
  },receipts));
  const deployedRoutes=boundRoutes.filter(r=>r.status==="deployed").length;
  const withEvidence=boundRoutes.filter(r=>r.receiptCount>0).length;
  const status=receipts.length===0?"not-deployed":
    deployedRoutes===boundRoutes.length&&boundRoutes.length>0?"deployed":"partial";
  const record={key,assetId,name:cfg.name,symbol:cfg.symbol,decimals:cfg.decimals,
   canonicalChain:cfg.canonical.chain,canonicalToken:cfg.canonical.tokenAddress||null,
   status,routeCount:boundRoutes.length,deployedRoutes,withEvidence,
   receiptCount:receipts.length,representations:byChain,
   routes:boundRoutes,
   manifest:"config/assets/"+key+"/asset.json",deploymentManifest:depPath};
  assets[key]=record;
  routes.push(...boundRoutes);
 }
 return {assets,routes};
}
export const deploymentReceiptPattern=RECEIPT_PATH;
