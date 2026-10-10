// XITA v3.1.5 canonical catalog deployment graph.
// Public Factories remain permissionless; this planner chooses at most one
// independently VERIFIED representation per configured asset and chain.
// A route direction is NOT a representation: both directions REUSE routers.
import {keccak256} from "../../apps/web/keccak.mjs";

const ADDR=/^0x[0-9a-fA-F]{40}$/;
const H32=/^0x[0-9a-fA-F]{64}$/;
const ZERO="0x"+"00".repeat(20);
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const encUint=n=>{
 const v=BigInt(n);
 if(v<0n||v>=(1n<<256n))throw Error("ABI integer out of range");
 return v.toString(16).padStart(64,"0");
};
const encAddr=a=>{
 if(!ADDR.test(a||""))throw Error("Invalid router address");
 return a.slice(2).toLowerCase().padStart(64,"0");
};
const encHash=a=>{
 if(!H32.test(a||""))throw Error("Invalid Asset ID");
 return a.slice(2).toLowerCase();
};
export function routeInstanceIdV315(assetId,source,destination,sourceRouter,destinationRouter){
 if(!source||!destination||source.chainId===destination.chainId||
    (source.chainId===1643)!==(source.domainId===1643)||
    (destination.chainId===1643)!==(destination.domainId===1643)||
    (source.chainId!==1643&&destination.chainId!==1643))
  throw Error("XGRChain hub must be exactly one endpoint");
 const hex=encHash(keccak256("XITA_ROUTE_INSTANCE_V315"))+
  encHash(assetId)+encUint(source.chainId)+encUint(source.domainId)+
  encUint(destination.chainId)+encUint(destination.domainId)+
  encAddr(sourceRouter)+encAddr(destinationRouter);
 return keccak256(Uint8Array.from(Buffer.from(hex,"hex")));
}
function expectedKind(asset,chain,rep){
 const role=rep?.role;
 if(role==="native"){
  if(chain.chainId!==1643||asset.canonicalChain!==chain.name)
   throw Error("Only canonical hub XGR has a native router");
  return {component:"nativeRouter",method:"deployNativeXGRRouter",token:ZERO};
 }
 if(role==="synthetic"){
  return {component:"syntheticRouter",method:
   asset.canonicalChain==="xgrchain"&&asset.canonicalToken===null?
    "deployWrappedXGRRouter":"deploySyntheticRouter",token:null};
 }
 if(role==="erc20"||role==="collateral"){
  if(asset.canonicalChain!==chain.name||!ADDR.test(asset.canonicalToken||""))
   throw Error("Collateral representation must hold canonical ERC20");
  return {component:"collateralRouter",method:"deployCollateralRouter",token:asset.canonicalToken};
 }
 throw Error("Unsupported asset representation "+String(role));
}
export function planAssetRoutes(asset,chains,infrastructure){
 if(!asset||!H32.test(asset.assetId||"")||!Array.isArray(asset.routes)||
    !asset.representations||!Array.isArray(chains))
  throw Error("Invalid canonical asset inventory");
 const chainMap=new Map(chains.map(c=>[c.name,c]));
 const infraMap=new Map(infrastructure.map(c=>[c.name,c]));
 const representations=[];
 const existingByChain=new Map();
 for(const [chainName,rep] of Object.entries(asset.representations)){
  const chain=chainMap.get(chainName),infra=infraMap.get(chainName);
  if(!chain||!infra||chain.chainId!==infra.chainId)throw Error("Missing matching chain infrastructure");
  const model=expectedKind(asset,chain,rep);
  const seen=rep.deployedContracts.filter(x=>
   ["nativeRouter","syntheticRouter","collateralRouter"].includes(x.component));
  const distinct=[...new Set(seen.filter(x=>x.component===model.component).map(x=>x.address.toLowerCase()))];
  if(seen.some(x=>x.component!==model.component)||distinct.length>1)
   throw Error("Ambiguous or wrong verified router for "+asset.key+" on "+chain.name);
  const router=distinct[0]||null;
  existingByChain.set(chainName,router);
  representations.push({
   id:asset.key+":"+chainName+":representation",asset:asset.key,assetId:asset.assetId,
   chain:chainName,chainId:chain.chainId,domainId:chain.domainId,
   component:model.component,deployMethod:model.method,originalToken:model.token,
   router,action:router?"reuse-verified":"deploy-once",
   status:router?"documented":"needs-deployment",
   dependsOn:[chainName+":sourceRegistry"]
  });
 }
 const byDirection=new Map();
 for(const r of asset.routes){
  const source=chainMap.get(r.source),destination=chainMap.get(r.destination);
  if(!source||!destination||!asset.representations[r.source]||!asset.representations[r.destination])
   throw Error("Route has unknown representation");
  if(source.chainId!==1643&&destination.chainId!==1643)
   throw Error("Spoke-to-spoke single hop forbidden");
  const key=r.source+"->"+r.destination;
  if(byDirection.has(key))throw Error("Ambiguous directed catalog route");
  byDirection.set(key,r);
 }
 const operations=[];
 const pairs=[],done=new Set();
 for(const r of asset.routes){
  const id=[r.source,r.destination].sort().join("<->");
  if(done.has(id))continue;
  done.add(id);
  const reverse=byDirection.get(r.destination+"->"+r.source);
  if(!reverse)throw Error("Reciprocal hub route is required for safe activation: "+r.name);
  const a=chainMap.get(r.source),b=chainMap.get(r.destination);
  const ra=existingByChain.get(a.name),rb=existingByChain.get(b.name);
  // The route identity is unknowable until BOTH verified router addresses
  // exist. Never derive it from an untrusted token symbol or a future address.
  const directions=[r,reverse].map(d=>{
   const x=chainMap.get(d.source),y=chainMap.get(d.destination);
   const local=existingByChain.get(x.name),remote=existingByChain.get(y.name);
   const routeId=local&&remote?routeInstanceIdV315(asset.assetId,x,y,local,remote):null;
   const gatewayRecords=d.receipts||[];
   const verifiedGateways=d.components?.gateways||[];
   if(verifiedGateways.length>1)throw Error("Ambiguous source Gateway: "+d.name);
   const gateway=verifiedGateways[0]||null;
   if(gateway&&(!routeId||!gatewayRecords.length))
    throw Error("Gateway present without proven router pair");
   if(routeId&&d.routeIds?.length&&
      (d.routeIds.length!==1||!same(d.routeIds[0],routeId)))
    throw Error("Recorded Route ID does not match router pair: "+d.name);
   const base={
    asset:asset.key,assetId:asset.assetId,name:d.name,source:x.name,destination:y.name,
    chainId:x.chainId,domainId:x.domainId,destinationChainId:y.chainId,
    destinationDomain:y.domainId,router:local,remoteRouter:remote,
    routeId,gateway,representationKey:asset.key+":"+x.name+":representation",
    remoteRepresentationKey:asset.key+":"+y.name+":representation"
   };
   const prepared={...base,id:asset.key+":"+d.name+":prepare",
    kind:"route-prepare",status:gateway?"documented":"blocked",
    action:gateway?"reuse-prepared":"prepare-route",
    dependsOn:[base.representationKey,base.remoteRepresentationKey,
      x.name+":sourceRegistry",y.name+":sourceRegistry"]};
   const safety={...base,id:asset.key+":"+d.name+":activate",kind:"route-activate",
    status:"requires-live-bls-attestation",action:"attest-and-activate",
    dependsOn:[asset.key+":"+d.name+":prepare",
      asset.key+":"+ (d===r?reverse.name:r.name)+":prepare"]};
   operations.push(prepared,safety);
   return {name:d.name,routeId,gateway,localRouter:local,remoteRouter:remote,
    prepared:Boolean(gateway),active:"unknown-requires-live-rpc"};
  });
  pairs.push({id:asset.key+":"+id,asset:asset.key,chains:[a.name,b.name],
   directions,readyForAttestation:directions.every(x=>x.prepared)});
 }
 return {asset:asset.key,assetId:asset.assetId,canonicalChain:asset.canonicalChain,
  canonicalToken:asset.canonicalToken,metadata:{name:asset.name,symbol:asset.symbol,decimals:asset.decimals},representations,
  routes:operations,pairs,
  disclaimer:"On-chain current code, ownership, reciprocal registrations, BLS signatures and receipt finality must be revalidated before each transaction."};
}
export function planCatalogRoutes(inventory,infrastructure){
 const assets=Object.values(inventory.assets).map(asset=>
  planAssetRoutes(asset,inventory.chains,infrastructure));
 return {schemaVersion:1,mode:"main-driven-protocol-plan",assets,
  actionOrder:["deploy-chain-trust","deploy-router-once","prepare-forward",
   "prepare-reverse","verify-remote-facts","activate-with-bls","e2e-both-directions"]};
}
