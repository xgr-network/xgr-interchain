// Generic v3.1.5 factory calls. These drafts are NOT signing authority.
// Both directions share ONE router on each chain; gateways are directional.
import {encodeFunctionCall} from "./abi-encoder.mjs";
import {selector,keccak256} from "../../apps/web/keccak.mjs";
import {planCatalogRoutes} from "./route-lifecycle.mjs";

const ADDR=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const ZERO="0x"+"0".repeat(40);
const valid=a=>ADDR.test(a||"")&&a.toLowerCase()!==ZERO;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
function call(factory,sig,types,args){
 if(!valid(factory))throw Error("Verified Factory missing");
 return {to:factory,data:encodeFunctionCall(sig,types,args,selector),value:"0x0"};
}
export function routeSalt(assetId,chainId,kind){
 if(!HASH.test(assetId||"")||!Number.isSafeInteger(chainId)||chainId<1||
    !["nativeRouter","syntheticRouter","collateralRouter"].includes(kind))
  throw Error("Invalid deterministic XITA router salt");
 return keccak256("XITA_V315_CANONICAL_CATALOG:"+assetId.toLowerCase()+":"+chainId+":"+kind);
}
export function factoryRouteDraft({asset,source,destination,sourceInfrastructure,
 destinationInfrastructure,representation,route,action}){
 if(!asset||!source||!destination||source.chainId===destination.chainId||
    (source.chainId!==1643&&destination.chainId!==1643))
  throw Error("Only XGRChain hub-directed routes supported");
 const factory=sourceInfrastructure?.components?.find(c=>c.key==="factory")?.address;
 const registry=sourceInfrastructure?.components?.find(c=>c.key==="sourceRegistry")?.address;
 const remoteRegistry=destinationInfrastructure?.components?.find(c=>c.key==="sourceRegistry")?.address;
 if(!valid(factory)||!valid(registry))throw Error("Chain Factory and SourceRegistry required first");
 if(action==="deploy-router"){
  if(representation?.chain!==source.name||representation?.router)
   throw Error("Existing router must be reused; cannot deploy duplicate");
  const salt=routeSalt(asset.assetId,source.chainId,representation.component);
  if(representation.component==="nativeRouter"){
   if(source.chainId!==1643)throw Error("Native XGR router only on hub");
   return {component:"nativeRouter",asset:asset.asset,chain:source.name,
    id:asset.asset+":"+source.name+":nativeRouter",
    salt,expectedEvent:"RouterDeployed(bytes32,address,address)",
    transaction:call(factory,"deployNativeXGRRouter(bytes32)",["bytes32"],[salt])};
  }
  if(representation.component==="syntheticRouter"){
   if(asset.canonicalChain==="xgrchain"&&asset.canonicalToken===null){
    return {component:"syntheticRouter",asset:asset.asset,chain:source.name,
     id:asset.asset+":"+source.name+":syntheticRouter",salt,
     expectedEvent:"RouterDeployed(bytes32,address,address)",
     transaction:call(factory,"deployWrappedXGRRouter(bytes32)",["bytes32"],[salt])};
   }
   const original=asset.canonicalToken;
   if(!valid(original))throw Error("Canonical ERC20 origin address required");
   const canonicalChain=asset.canonicalChain;
   const orig=source.name===canonicalChain?source:destination.name===canonicalChain?destination:null;
   if(!orig)throw Error("Canonical source chain for synthetic creation unavailable");
   const metadata=asset.metadata;
   if(!metadata||!Number.isInteger(metadata.decimals)||metadata.decimals>18||
      !metadata.name||!metadata.symbol)
    throw Error("Verified canonical ERC20 metadata required");
   return {component:"syntheticRouter",asset:asset.asset,chain:source.name,
    id:asset.asset+":"+source.name+":syntheticRouter",salt,
    expectedEvent:"RouterDeployed(bytes32,address,address)",
    transaction:call(factory,"deploySyntheticRouter(uint64,address,uint8,string,string,bytes32)",
     ["uint64","address","uint8","string","string","bytes32"],
     [orig.chainId,original,metadata.decimals,metadata.name,metadata.symbol,salt])};
  }
  if(representation.component==="collateralRouter"){
   if(!valid(representation.originalToken)||source.name!==asset.canonicalChain)
    throw Error("Collateral requires native canonical ERC20 and independently verified token address");
   return {component:"collateralRouter",asset:asset.asset,chain:source.name,
    id:asset.asset+":"+source.name+":collateralRouter",salt,
    expectedEvent:"RouterDeployed(bytes32,address,address)",
    transaction:call(factory,"deployCollateralRouter(address,bytes32)",
     ["address","bytes32"],[representation.originalToken,salt])};
  }
  throw Error("Unsupported representation");
 }
 if(action==="prepare-route"){
  if(!route||route.source!==source.name||route.destination!==destination.name||
     !valid(route.router)||!valid(route.remoteRouter)||
     !HASH.test(route.routeId||"")||route.gateway)
   throw Error("Both verified routers and an unprepared directed route required");
  if(!valid(remoteRegistry))throw Error("Counterparty chain registry required");
  const local=sourceInfrastructure.components.find(c=>c.key==="factory")?.address;
  if(!eq(local,factory))throw Error("Factory identity mismatch");
  // Asset's source representation is the authoritative token type; router
  // token() is checked on-chain before this is signable.
  const destToken=route.destinationToken;
  if(!ADDR.test(destToken||""))throw Error("Verified destination router token() missing");
  return {component:"gateway",asset:asset.asset,routeName:route.name,
   chain:source.name,id:asset.asset+":"+route.name+":prepare",
   routeId:route.routeId,expectedEvent:"RoutePrepared(bytes32,address,address)",
   transaction:call(factory,"prepareRoute(address,uint64,uint32,address,address)",
    ["address","uint64","uint32","address","address"],
    [route.router,destination.chainId,destination.domainId,route.remoteRouter,destToken])};
 }
 throw Error("Unsupported route factory action");
}
export function nextAssetRouteTasks(inventory,infrastructure){
 const graph=planCatalogRoutes(inventory,infrastructure);
 const chains=new Map(inventory.chains.map(c=>[c.name,c]));
 const infra=new Map(infrastructure.map(c=>[c.name,c]));
 const items=[];
 for(const asset of graph.assets){
  for(const rep of asset.representations){
   const chain=chains.get(rep.chain);
   const deps=["factory","sourceRegistry"].filter(k=>
    !valid(infra.get(chain.name)?.components.find(c=>c.key===k)?.address));
   if(rep.action==="deploy-once")items.push({id:rep.id,asset:asset.asset,chain:chain.name,
    kind:"router",action:rep.deployMethod,blockers:deps,status:deps.length?"waiting-infrastructure":"ready-for-independent-validation"});
  }
  for(const pair of asset.pairs){
   if(pair.readyForAttestation){
    for(const d of pair.directions){
     const sourceRoute=asset.routes.find(x=>x.name===d.name&&x.kind==="route-activate");
     if(sourceRoute)items.push({
      id:asset.asset+":"+d.name+":activate",asset:asset.asset,chain:sourceRoute.source,
      kind:"activation",action:"validator-quorum-confirmation",routeId:d.routeId,
      destinationDomain:sourceRoute.destinationDomain,
      blockers:["Independently verified reciprocal route safety BLS quorum"],
      status:"requires-validator-quorum"
     });
    }
   }
   for(const d of pair.directions){
    if(d.prepared)continue;
    const blockers=[];
    if(!valid(d.localRouter)||!valid(d.remoteRouter))blockers.push("Router-Paar");
    for(const name of pair.chains){
     for(const component of ["factory","sourceRegistry"])
      if(!valid(infra.get(name)?.components.find(c=>c.key===component)?.address))
       blockers.push(name+":"+component);
    }
    items.push({id:asset.asset+":"+d.name+":prepare",asset:asset.asset,
     chain:asset.routes.find(r=>r.kind==="route-prepare"&&r.name===d.name)?.source,kind:"gateway",action:"prepareRoute",
     blockers,status:blockers.length?"waiting-dependencies":"ready-for-independent-validation"});
   }
  }
 }
 return {graph,tasks:items};
}
