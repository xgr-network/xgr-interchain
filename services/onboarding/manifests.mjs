// XITA permissionless Alliance directory PR generator.
// Deterministic JSON derived exclusively from validated public inputs + main inventory.
// This only prepares directory manifests; it NEVER creates a contract or activates a route.
import {canonicalAssetId} from "../admin/asset-state.mjs";
import {suggestedTokenSlug} from "../../apps/web/token-slug.js";
import {normalizeJoinDescription} from "../../apps/web/join-description.js";
import {isDeployedChain} from "../../apps/web/route-availability.js";
import {validateCatalog} from "../../tools/validate-manifests.mjs";
import {assetConfigFolder} from "../../tools/manifest-layout.mjs";

const HEX=/^0x[0-9a-f]{40}$/i;
const ZERO=/^0x0{40}$/i;
const LINKS=["explorer","github","docs","whitepaper","x","linkedin","telegram","discord"];
const ROLES=new Set(["founder","core-team","authorized-representative","holder","community","other"]);
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/;
const validText=(s,min,max)=>typeof s==="string"&&s.trim()===s&&s.length>=min&&s.length<=max&&
 !/[\u0000-\u001f\u007f<>]/.test(s);
const safeUrl=(value)=>{
 if(typeof value!=="string"||value.length>512)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||!u.hostname.includes(".")||
     u.hostname==="localhost"||u.hostname.endsWith(".local")||u.hostname.endsWith(".internal")||
     /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
};
const note=(s)=>{throw new Error(s);};
function normalizeLinks(value){
 if(value===null||value===undefined)value={};
 if(typeof value!=="object"||Array.isArray(value))note("Invalid project links");
 const result={};
 for(const key of LINKS){
  if(value[key]===undefined||value[key]===null||value[key]==="")result[key]=null;
  else result[key]=safeUrl(value[key])||note("Invalid HTTPS "+key+" link");
 }
 return result;
}
export function normalizeApplication(raw,inventory){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))note("Invalid application");
 if(!inventory?.chains?.xgrchain||inventory.chains.xgrchain.chainId!==1643||inventory.chains.xgrchain.domainId!==1643)
  note("Canonical XGRChain inventory unavailable");
 const symbol=String(raw.symbol||"").toUpperCase();
 if(!/^[A-Z][A-Z0-9]{1,11}$/.test(symbol)||symbol==="XGR"||Object.hasOwn(inventory.assets||{},symbol))
  note("Invalid or already listed symbol");
 const name=raw.name;
 if(!validText(name,2,80))note("Invalid project name");
 const slug=suggestedTokenSlug(raw,inventory.assets);
 if(!slug)note("Cannot derive a token profile URL from name or symbol");
 if(Object.values(inventory.assets||{}).some(a=>a.metadata?.canonical?.tokenAddress?.toLowerCase()===String(raw.canonicalAddress||"").toLowerCase()&&
    a.metadata?.canonical?.chain===raw.canonicalChain))
  note("Existing token slug or canonical contract");
 const shortDescription=normalizeJoinDescription(raw.shortDescription,15,280);
 const description=normalizeJoinDescription(raw.description,40,5000);
 if(!shortDescription||!description)
  note("Project descriptions do not meet length/format requirements");
 const website=safeUrl(raw.website);
 if(!website)note("Project website must use HTTPS");
 const canonicalChain=raw.canonicalChain;
 if(!Object.hasOwn(inventory.chains,canonicalChain))note("Unknown canonical chain");
 if(canonicalChain==="xgrchain"||!isDeployedChain(inventory,canonicalChain)||
    !inventory.chains[canonicalChain]?.coingeckoAssetPlatform)
  note("Original blockchain is not yet deployed or CoinGecko-verifiable");
 const address=String(raw.canonicalAddress||"").toLowerCase();
 if(!HEX.test(address)||ZERO.test(address))note("Original ERC-20 contract address required");
 if(!Number.isInteger(raw.decimals)||raw.decimals<0||raw.decimals>36)
  note("Invalid token decimals");
 // Applicants choose only the canonical token identity. XITA always proposes
 // the complete current inventory, including XGRChain as the mandatory hub.
 // Ignore any legacy or forged browser "targets" field: it must never reduce
 // or expand the GitHub-approved route graph.
 const chosen=Object.keys(inventory.chains).filter(key=>
  key!==canonicalChain&&key!=="xgrchain"&&isDeployedChain(inventory,key)).sort();
 const categories=raw.categories;
 if(!Array.isArray(categories)||categories.length<1||categories.length>8||
    new Set(categories).size!==categories.length||
    !categories.every(s=>validText(s,1,60)))note("Choose valid project categories");
 const tags=raw.tags||[];
 if(!Array.isArray(tags)||tags.length>16||!tags.every(s=>validText(s,1,60))||
   new Set(tags).size!==tags.length)note("Invalid project tags");
 if(raw.logoPngBase64!==undefined)note("Logo uploads are not accepted; use a HTTPS URL");
 const logoUrl=safeUrl(raw.logoUrl);
 if(!logoUrl)note("Provide a valid HTTPS logo URL");
 if(raw.confirmed!==true)note("Applicant acknowledgement required");
 if(!EMAIL.test(String(raw.contactEmail||""))||String(raw.contactEmail).length>254)note("Valid private contact email required");
 if(!ROLES.has(raw.applicantRole))note("Applicant relationship required");
 const representations=[canonicalChain,"xgrchain",...chosen].filter((key,i,arr)=>arr.indexOf(key)===i);
 if(representations.length<2)note("An XGRChain spoke is required");
 if(raw.priceSource!=="coingecko")note("CoinGecko listing is required");
 const priceSource="coingecko";
 const coingeckoId=String(raw.coingeckoId||"").toLowerCase();
 if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(coingeckoId||""))note("Invalid CoinGecko ID");
 const linkMap=normalizeLinks(raw.links);
 const normalized={name,symbol,slug,shortDescription,description,website,
  canonicalChain,canonicalAddress:address,decimals:raw.decimals,
  targets:[...chosen].sort(),categories,tags,
  logoUrl,links:linkMap,priceSource,coingeckoId,confirmed:true};
 return {normalized};
}
export function buildManifestBundle(raw,catalog){
 const {normalized:a}=normalizeApplication(raw,catalog);
 const key=a.symbol;
 const candidate={asset:key,canonical:{chain:a.canonicalChain,representation:"collateral",tokenAddress:a.canonicalAddress}};
 const assetId=canonicalAssetId(candidate,catalog.chains);
 const base=assetConfigFolder(key,assetId);
 if(Object.values(catalog.assets||{}).some(asset=>asset.metadata?.assetId===assetId))
  note("An asset with this original token already exists");
 const chains=[a.canonicalChain,"xgrchain",...a.targets].filter((key,i,arr)=>arr.indexOf(key)===i);
 const representations=chains.map(chain=>({
  chain,representation:chain===a.canonicalChain?"collateral":"synthetic",
  symbol:chain===a.canonicalChain?a.symbol:"w"+a.symbol,
  assetAddress:chain===a.canonicalChain?a.canonicalAddress:null
 }));
 const spokes=chains.filter(chain=>chain!=="xgrchain").sort();
 const routes=spokes.flatMap(chain=>{
  const short=chain.replace(/-/g,"_");
  return [
   {name:short+"_to_xgr",sourceChain:chain,destinationChain:"xgrchain"},
   {name:"xgr_to_"+short,sourceChain:"xgrchain",destinationChain:chain}
  ];
 });
 const metadata={schemaVersion:1,kind:"asset-config",asset:key,name:a.name,symbol:key,
  decimals:a.decimals,canonical:{chain:a.canonicalChain,representation:"collateral",
   symbol:key,tokenAddress:a.canonicalAddress},representations,
  bridgeModel:"lock-mint-burn-unlock",assetId,
  notes:"Public directory application; no route or deployment is active without independent safety verification."};
 const profile={schemaVersion:1,kind:"xeta-token-profile",asset:key,slug:a.slug,name:a.name,
  shortDescription:a.shortDescription,description:a.description,
  categories:a.categories,tags:a.tags,branding:{logoUrl:a.logoUrl,bannerUrl:null},
  links:{website:a.website,...a.links},
  market:{coingeckoId:a.coingeckoId,coinmarketcapId:null,priceSource:a.priceSource},
  supply:{circulating:null,total:null,max:null},
  verification:{status:"project-maintained",proof:null}};
 const routeConfig={schemaVersion:1,kind:"asset-routes",asset:key,network:"mainnet",
  protocol:"XITA-v3.1.5",routingHub:"xgrchain",routes};
 const deployment={schemaVersion:3,kind:"asset-deployment",network:"mainnet",asset:key,assetId,
  sourceManifest:base+"/asset.json",receiptPaths:[],representations:[],routeDeployments:[],present:false};
 // Keep the canonical published catalog key order. Changing the position of
 // infrastructure and assets would make a one-token proposal appear to rewrite
 // hundreds of unrelated deployment lines in the GitHub review.
 const proposedCatalog={
  chains:catalog.chains,
  assets:{...catalog.assets,[key]:{metadata,profile,routes:routeConfig,deployment}},
  infrastructure:catalog.infrastructure,
  publication:catalog.publication
 };
 // No personal contact information may ever be embedded, even in free-text descriptions.
 const publicJson=JSON.stringify({metadata,profile,routeConfig});
 if(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(publicJson)||
    /contactEmail|privateEmail|applicantEmail/i.test(publicJson))
   note("Personal email addresses must not appear in public token manifests");
 const errors=validateCatalog(proposedCatalog);
 if(errors.length)note("Generated manifest failed validation: "+errors.slice(0,4).join("; "));
 const json=x=>JSON.stringify(x,null,2)+"\n";
 const files={
  [base+"/asset.json"]:json(metadata),
  [base+"/metadata.json"]:json(profile),
  [base+"/routes.json"]:json(routeConfig),
  ["apps/web/catalog.json"]:json({schemaVersion:1,...proposedCatalog})
 };
 return {key,slug:a.slug,assetId,files,
  summary:{name:a.name,symbol:a.symbol,canonicalChain:a.canonicalChain,
   chains,routeCount:routes.length,applicantRole:raw.applicantRole,verified:false}};
}
