// Public discoverability is a deterministic projection of the publication
// policy and GitHub-receipted deployments. A configured but not yet deployed
// spoke never blocks a fully deployed asset on another spoke.
import {isDeployedChain,deployedRoutes} from "./route-availability.js";

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const RECEIPT=/^deployments\/receipts\/[a-z][a-z0-9-]*\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/;
const USD=/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/;
const match=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const bound=item=>ADDRESS.test(item?.address||"")&&HASH.test(item?.runtimeCodeKeccak256||"")&&
 RECEIPT.test(item?.receiptPath||"");
const componentFor=role=>({native:"nativeRouter",collateral:"collateralRouter",synthetic:"syntheticRouter"})[role]||null;

// USD thresholds use fixed-point integer comparisons, never binary floats.
export function usdUnits(value){
 const text=String(value??"");
 if(!USD.test(text))return null;
 const [integer,fraction=""]=text.split(".");
 return BigInt(integer)*100000000n+BigInt(fraction.padEnd(8,"0"));
}
export function validPublicationPolicy(policy){
 return policy?.schemaVersion===1&&policy?.kind==="xita-publication-policy"&&
  (policy.minimumLockedUsd===null||
   typeof policy.minimumLockedUsd==="number"&&Number.isFinite(policy.minimumLockedUsd)&&
    policy.minimumLockedUsd>=0&&usdUnits(policy.minimumLockedUsd)!==null)&&
  Number.isSafeInteger(policy.maxEvidenceAgeSeconds)&&
  policy.maxEvidenceAgeSeconds>=60&&policy.maxEvidenceAgeSeconds<=86400;
}

export function isDeployedAsset(entry,catalog=null){
 const asset=entry?.metadata,deployment=entry?.deployment,routes=entry?.routes?.routes;
 if(!asset||!deployment||deployment.present!==true||
   !HASH.test(asset.assetId||"")||!match(asset.assetId,deployment.assetId)||
   asset.asset!==deployment.asset||!Array.isArray(asset.representations)||
   !Array.isArray(routes)||!Array.isArray(deployment.representations)||
   !Array.isArray(deployment.routeDeployments)||!Array.isArray(deployment.receiptPaths))
   return false;
 const configured=new Map(),references=new Set(deployment.receiptPaths);
 for(const rep of asset.representations){
  if(!rep?.chain||configured.has(rep.chain)||!componentFor(rep.representation))return false;
  configured.set(rep.chain,componentFor(rep.representation));
 }
 // At least ONE complete, valid directed route. Additional planned spokes or
 // directions must NOT suppress an already deployed token from the directory.
 return routes.some(route=>{
  const src=route?.sourceChain,dst=route?.destinationChain;
  if(!route?.name||!configured.has(src)||!configured.has(dst)||src===dst||
   (src!=="xgrchain"&&dst!=="xgrchain"))return false;
  if(catalog?.chains&&catalog?.infrastructure&&
    (!isDeployedChain(catalog,src)||!isDeployedChain(catalog,dst)))return false;
  const routers=[src,dst].map(chain=>
   deployment.representations.filter(rep=>rep.chain===chain&&
    rep.component===configured.get(chain)&&bound(rep)&&references.has(rep.receiptPath)));
  if(routers.some(items=>items.length!==1))return false;
  // Publication and executable inventory must reject ambiguous route instances
  // by the same rule. Fee adapters remain deliberately irrelevant here.
  const instances=deployment.routeDeployments.filter(row=>
   row.routeName===route.name&&row.sourceChain===src&&row.destinationChain===dst);
  if(instances.length!==1)return false;
  const row=instances[0];
  return HASH.test(row.routeId||"")&&bound(row.components?.gateway)&&bound(row.components?.feeVault)&&
   references.has(row.components.gateway.receiptPath)&&references.has(row.components.feeVault.receiptPath);
 });
}

export function listingStatus(entry,visibilityRow,catalog=null){
 if(!isDeployedAsset(entry,catalog))return "prospect";
 if(catalog?.publication){
  if(!validPublicationPolicy(catalog.publication))return "unknown";
  if(catalog.publication.minimumLockedUsd===null)return "public";
 }
 if(visibilityRow?.status==="public")return "public";
 if(visibilityRow?.status==="accepted")return "accepted";
 return "unknown";
}

export function isPublicAsset(id,entry,visibility,catalog=null){
 if(!isDeployedAsset(entry,catalog))return false;
 const policy=catalog?.publication;
 if(policy){
  if(!validPublicationPolicy(policy))return false;
  if(policy.minimumLockedUsd===null)return true;
 }
 const row=visibility?.schemaVersion===1&&visibility?.kind==="xita-visibility-v1"?
  visibility.assets?.[id]:null;
 if(row?.status!=="public"||!match(row.assetId,entry.metadata.assetId))return false;
 if(policy){
  if(visibility.minimumLockedUsd!==policy.minimumLockedUsd)return false;
  const value=usdUnits(row.lockedUsd),minimum=usdUnits(policy.minimumLockedUsd);
  if(value===null||minimum===null||value<=minimum)return false;
 }
 return true;
}

// A planet requires exactly the same publication approval as the token list
// PLUS a documented representation on a complete chain-specific ILN route.
// Neither validator quorum readiness nor the optional commercial fee adapter
// controls public discovery.
export function isPublicRepresentation(id,chain,catalog,visibility=null){
 if(!isPublicAsset(id,catalog?.assets?.[id],visibility,catalog))return false;
 // Legacy standalone ranking catalogs have no infrastructure inventory.
 if(!catalog?.chains||!catalog?.infrastructure)return true;
 return deployedRoutes(catalog).some(r=>r.asset===id&&(r.source===chain||r.destination===chain));
}

export function publicDirectoryCatalog(catalog,visibility){
 // Project one common public asset selection onto tokens, rankings and 3D
 // systems. Configured-only future spokes must not acquire token planets.
 const chainsByAsset=new Map();
 if(catalog?.chains&&catalog?.infrastructure){
  for(const route of deployedRoutes(catalog)){
   if(!chainsByAsset.has(route.asset))chainsByAsset.set(route.asset,new Set());
   chainsByAsset.get(route.asset).add(route.source);
   chainsByAsset.get(route.asset).add(route.destination);
  }
 }
 const assets=Object.fromEntries(Object.entries(catalog?.assets||{})
  .filter(([id,entry])=>isPublicAsset(id,entry,visibility,catalog))
  .map(([id,entry])=>{
   if(!catalog?.chains||!catalog?.infrastructure)return [id,entry];
   const ready=chainsByAsset.get(id);
   return [id,{...entry,metadata:{...entry.metadata,
    representations:(entry.metadata?.representations||[]).filter(rep=>ready?.has(rep.chain))}}];
  }));
 return {...catalog,assets};
}
