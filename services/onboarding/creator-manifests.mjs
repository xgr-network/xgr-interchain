// Draft XITA Join manifests created ONLY after on-chain XGRChain ERC-20
// creation has been verified against the reviewed factory and both XGR RPCs.
// This registers the verified XGRChain original in the public token catalog.
// No Interchain routes or wrapped representations are proposed.
import {canonicalAssetId} from "../admin/asset-state.mjs";
import {suggestedTokenSlug} from "../../apps/web/token-slug.js";
import {assetConfigFolder} from "../../tools/manifest-layout.mjs";
import {validateCatalog} from "../../tools/validate-manifests.mjs";
import {creatorSettings} from "../../apps/web/creator-token-config.js";
import {normalizeJoinDescription} from "../../apps/web/join-description.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i;
const valid=s=>typeof s==="string"&&s.length>0&&!/[<>\x00-\x1f]/.test(s);
export function buildCreatorProfileBundle(record,proof,catalog){
 const a=record?.input;
 const cfg=creatorSettings(a||{});
 if(record?.kind!=="token-creator"||!["deployed","pr-published"].includes(record.phase)||
    !a||!proof||!catalog?.chains?.xgrchain||catalog.chains.xgrchain.chainId!==1643)
  throw Error("Verified XGR token creation is required before Join");
 const token=String(proof.tokenAddress||"").toLowerCase(),owner=String(a.ownerAddress||"").toLowerCase();
 if(!ADDRESS.test(token)||/^0x0{40}$/.test(token)||!ADDRESS.test(owner)||
    /^0x0{40}$/.test(owner)||!TX.test(proof.txHash||"")||!TX.test(proof.tokenCodeHash||"")||
    String(proof.ownerAddress||"").toLowerCase()!==owner||
    String(proof.name)!==a.name||String(proof.symbol)!==a.symbol||
    String(proof.initialSupplyBaseUnits)!==cfg.initialSupplyBaseUnits||
    proof.tokenType!==cfg.tokenTypeId||proof.decimals!==cfg.decimals||
    proof.maxSupplyBaseUnits!==cfg.maxSupplyBaseUnits||
    proof.permit!==cfg.permit||
    String(proof.minterAddress||"").toLowerCase()!==cfg.minterAddress||
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
 const metadata={schemaVersion:1,kind:"asset-config",asset:symbol,name:a.name,symbol,decimals:cfg.decimals,
  canonical:{chain:"xgrchain",representation:"collateral",symbol,tokenAddress:token},
  representations:[{chain:"xgrchain",representation:"collateral",symbol,assetAddress:token}],
  bridgeModel:"lock-mint-burn-unlock",assetId,
  creation:{kind:"xgrchain-creator-v1",factory:proof.factory.toLowerCase(),operator:proof.operator.toLowerCase(),
   ownerAddress:owner,transactionHash:proof.txHash.toLowerCase(),blockNumber:proof.blockNumber,
   tokenRuntimeCodeHash:proof.tokenCodeHash,
   tokenType:cfg.tokenType,decimals:cfg.decimals,maxSupplyBaseUnits:cfg.maxSupplyBaseUnits,
   minterAddress:cfg.minterAddress,permit:cfg.permit},
  notes:"Verified XGRChain original token. No XITA Interchain routes are configured or approved."};
 const links=Object.fromEntries(["explorer","github","docs","whitepaper","x","linkedin","telegram","discord"].map(x=>[x,a.links?.[x]||null]));
 const profile={schemaVersion:1,kind:"xeta-token-profile",asset:symbol,slug,name:a.name,
  shortDescription:a.shortDescription,description:a.description,
  categories:a.categories,tags:a.tags||[],branding:{logoUrl:record.logoUrl,bannerUrl:null},
  links:{website:a.website,...links},market:{coingeckoId:null,coinmarketcapId:null,priceSource:"none"},
  supply:{circulating:null,total:proof.initialSupplyBaseUnits,max:cfg.maxSupplyBaseUnits},
  verification:{status:"project-maintained",proof:proof.txHash}};
 const routes={schemaVersion:1,kind:"asset-routes",asset:symbol,network:"mainnet",
  protocol:"XITA-v3.1.5",routingHub:"xgrchain",
  routes:[]};
 const deployment={schemaVersion:3,kind:"asset-deployment",network:"mainnet",asset:symbol,assetId,
  sourceManifest:folder+"/asset.json",receiptPaths:[],representations:[],routeDeployments:[],present:false};
 const candidate={chains:catalog.chains,assets:{...catalog.assets,[symbol]:{metadata,profile,routes,deployment}},
  infrastructure:catalog.infrastructure,publication:catalog.publication};
 const noContacts=JSON.stringify({metadata,profile,routes});
 if(/contactEmail|privateEmail|applicantEmail|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(noContacts))
  throw Error("Personal contact information must never enter public GitHub");
 // The public creator registration explicitly permits paragraph breaks.
 // Apply the SAME canonical description rules here; the earlier generic
 // control-character ban incorrectly rejected legitimate multi-line text
 // only AFTER the immutable on-chain token deployment had succeeded.
 if(!valid(a.name)||
    normalizeJoinDescription(a.shortDescription,15,280)!==a.shortDescription||
    normalizeJoinDescription(a.description,40,5000)!==a.description)
  throw Error("Invalid public profile fields");
 const errors=validateCatalog(candidate);
 if(errors.length)throw Error("Invalid creator Join bundle: "+errors.join("; "));
 const json=x=>JSON.stringify(x,null,2)+"\n";
 return {key:symbol,assetId,kind:"xgrchain-profile",
  files:{[folder+"/asset.json"]:json(metadata),[folder+"/metadata.json"]:json(profile),
    [folder+"/routes.json"]:json(routes),["apps/web/catalog.json"]:json({schemaVersion:1,...candidate})},
  summary:{name:a.name,symbol,canonicalChain:"xgrchain",chains:["xgrchain"],
   routeCount:0,applicantRole:a.applicantRole,verified:true}};
}
