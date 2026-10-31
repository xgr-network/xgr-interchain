// Draft XITA Join manifests created ONLY after on-chain XGRChain ERC-20
// creation has been verified against the reviewed factory and both XGR RPCs.
// This creates desired routes, never deploys gateways or lists a token.
import {canonicalAssetId} from "../admin/asset-state.mjs";
import {isDeployedChain} from "../../apps/web/route-availability.js";
import {suggestedTokenSlug} from "../../apps/web/token-slug.js";
import {assetConfigFolder} from "../../tools/manifest-layout.mjs";
import {validateCatalog} from "../../tools/validate-manifests.mjs";
const ADDRESS=/^0x[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i;
const valid=s=>typeof s==="string"&&s.length>0&&!/[<>\x00-\x1f]/.test(s);
export function buildCreatorJoinBundle(record,proof,catalog){
 const a=record?.input;
 if(record?.kind!=="token-creator"||!["deployed","pr-published"].includes(record.phase)||
    !a||!proof||!catalog?.chains?.xgrchain||catalog.chains.xgrchain.chainId!==1643)
  throw Error("Verified XGR token creation is required before Join");
 const token=String(proof.tokenAddress||"").toLowerCase(),owner=String(a.ownerAddress||"").toLowerCase();
 if(!ADDRESS.test(token)||/^0x0{40}$/.test(token)||!ADDRESS.test(owner)||
    /^0x0{40}$/.test(owner)||!TX.test(proof.txHash||"")||
    String(proof.ownerAddress||"").toLowerCase()!==owner||
    String(proof.name)!==a.name||String(proof.symbol)!==a.symbol||
    String(proof.initialSupplyBaseUnits)!==(BigInt(a.initialSupply)*10n**18n).toString()||
    proof.chainId!==1643||!ADDRESS.test(proof.factory||"")||
    !ADDRESS.test(proof.operator||"")||!Number.isSafeInteger(proof.blockNumber)||proof.blockNumber<=0)
  throw Error("Creator proof is not bound to the email-confirmed immutable project");
 const symbol=a.symbol;
 if(!/^[A-Z][A-Z0-9]{1,10}$/.test(symbol)||Object.hasOwn(catalog.assets||{},symbol))
  throw Error("Duplicate or invalid XGR token symbol");
 if(Object.values(catalog.assets||{}).some(x=>x.metadata?.canonical?.chain==="xgrchain"&&
    x.metadata?.canonical?.tokenAddress?.toLowerCase()===token))
  throw Error("Token already in XITA inventory");
 const slug=suggestedTokenSlug({name:a.name,symbol},catalog.assets);
 if(!slug)throw Error("Invalid token profile identity");
 const asset={asset:symbol,canonical:{chain:"xgrchain",representation:"collateral",tokenAddress:token}};
 const assetId=canonicalAssetId(asset,catalog.chains),folder=assetConfigFolder(symbol,assetId);
 const spokes=Object.keys(catalog.chains).filter(ch=>ch!=="xgrchain"&&isDeployedChain(catalog,ch)).sort();
 if(!spokes.length)throw Error("No deployed XITA spoke routes are available");
 const metadata={schemaVersion:1,kind:"asset-config",asset:symbol,name:a.name,symbol,decimals:18,
  canonical:{chain:"xgrchain",representation:"collateral",symbol,tokenAddress:token},
  representations:[{chain:"xgrchain",representation:"collateral",symbol,assetAddress:token},
   ...spokes.map(chain=>({chain,representation:"synthetic",symbol:"w"+symbol,assetAddress:null}))],
  bridgeModel:"lock-mint-burn-unlock",assetId,
  creation:{kind:"xgrchain-creator-v1",factory:proof.factory.toLowerCase(),operator:proof.operator.toLowerCase(),
   ownerAddress:owner,transactionHash:proof.txHash.toLowerCase(),blockNumber:proof.blockNumber},
  notes:"Verified factory-created XGRChain original; Join requires independent PR review and route deployments."};
 const links=Object.fromEntries(["explorer","github","docs","whitepaper","x","linkedin","telegram","discord"].map(x=>[x,a.links?.[x]||null]));
 const profile={schemaVersion:1,kind:"xeta-token-profile",asset:symbol,slug,name:a.name,
  shortDescription:a.shortDescription,description:a.description,
  categories:a.categories,tags:a.tags||[],branding:{logoUrl:record.logoUrl,bannerUrl:null},
  links:{website:a.website,...links},market:{coingeckoId:null,coinmarketcapId:null,priceSource:"none"},
  supply:{circulating:null,total:proof.initialSupplyBaseUnits,max:proof.initialSupplyBaseUnits},
  verification:{status:"project-maintained",proof:proof.txHash}};
 const routes={schemaVersion:1,kind:"asset-routes",asset:symbol,network:"mainnet",
  protocol:"XITA-v3.1.5",routingHub:"xgrchain",
  routes:spokes.flatMap(chain=>[
   {name:"xgr_to_"+chain,sourceChain:"xgrchain",destinationChain:chain},
   {name:chain+"_to_xgr",sourceChain:chain,destinationChain:"xgrchain"}])};
 const deployment={schemaVersion:3,kind:"asset-deployment",network:"mainnet",asset:symbol,assetId,
  sourceManifest:folder+"/asset.json",receiptPaths:[],representations:[],routeDeployments:[],present:false};
 const candidate={chains:catalog.chains,assets:{...catalog.assets,[symbol]:{metadata,profile,routes,deployment}},
  infrastructure:catalog.infrastructure,publication:catalog.publication};
 const noContacts=JSON.stringify({metadata,profile,routes});
 if(/contactEmail|privateEmail|applicantEmail|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(noContacts))
  throw Error("Personal contact information must never enter public GitHub");
 if(!valid(a.name)||!valid(a.shortDescription)||!valid(a.description))
  throw Error("Invalid public profile fields");
 const errors=validateCatalog(candidate);
 if(errors.length)throw Error("Invalid creator Join bundle: "+errors.join("; "));
 const json=x=>JSON.stringify(x,null,2)+"\n";
 return {key:symbol,assetId,kind:"origin-xgrchain",
  files:{[folder+"/asset.json"]:json(metadata),[folder+"/metadata.json"]:json(profile),
    [folder+"/routes.json"]:json(routes),["apps/web/catalog.json"]:json({schemaVersion:1,...candidate})},
  summary:{name:a.name,symbol,canonicalChain:"xgrchain",chains:["xgrchain",...spokes],
   routeCount:routes.routes.length,applicantRole:a.applicantRole,verified:true}};
}
