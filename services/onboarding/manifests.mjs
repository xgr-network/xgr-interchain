// XITA permissionless Alliance directory PR generator.
// Deterministic JSON derived exclusively from validated public inputs + main inventory.
// This only prepares directory manifests; it NEVER creates a contract or activates a route.
import {canonicalAssetId} from "../admin/asset-state.mjs";
import {validateCatalog} from "../../tools/validate-manifests.mjs";

const HEX=/^0x[0-9a-f]{40}$/i;
const ZERO=/^0x0{40}$/i;
const LINKS=["explorer","github","docs","whitepaper","x","linkedin","telegram","discord"];
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
function logoBytes(base64){
 if(base64===null||base64===undefined||base64==="")return null;
 if(typeof base64!=="string"||base64.length>410000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))note("Invalid logo upload");
 const bytes=Buffer.from(base64,"base64");
 if(bytes.length<33||bytes.length>300000||bytes.toString("base64")!==base64)
  note("Logo exceeds 300 KB or is malformed");
 if(bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||
    bytes.toString("ascii",12,16)!=="IHDR")note("Only sanitized PNG logos are supported");
 const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
 if(w<1||w>512||h<1||h>512)note("Logo dimensions must be 1-512 pixels");
 return bytes;
}
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
 const name=raw.name,slug=raw.slug;
 if(!validText(name,2,80)||!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug||"")||slug.endsWith("-"))
  note("Invalid project name or token slug");
 if(Object.values(inventory.assets||{}).some(a=>a.profile?.slug===slug||
    a.metadata?.canonical?.tokenAddress?.toLowerCase()===String(raw.canonicalAddress||"").toLowerCase()&&
    a.metadata?.canonical?.chain===raw.canonicalChain))
  note("Existing token slug or canonical contract");
 const shortDescription=raw.shortDescription,description=raw.description;
 if(!validText(shortDescription,15,280)||!validText(description,40,5000))
  note("Project descriptions do not meet length/format requirements");
 const website=safeUrl(raw.website);
 if(!website)note("Project website must use HTTPS");
 const canonicalChain=raw.canonicalChain;
 if(!Object.hasOwn(inventory.chains,canonicalChain))note("Unknown canonical chain");
 const address=String(raw.canonicalAddress||"").toLowerCase();
 if(!HEX.test(address)||ZERO.test(address))note("Original ERC-20 contract address required");
 if(!Number.isInteger(raw.decimals)||raw.decimals<0||raw.decimals>36)
  note("Invalid token decimals");
 const chosen=raw.targets;
 if(!Array.isArray(chosen)||chosen.length<1||chosen.length>16||
    new Set(chosen).size!==chosen.length||
    chosen.some(key=>!Object.hasOwn(inventory.chains,key)||key===canonicalChain))
  note("Choose at least one distinct supported destination");
 const categories=raw.categories;
 if(!Array.isArray(categories)||categories.length<1||categories.length>8||
    new Set(categories).size!==categories.length||
    !categories.every(s=>validText(s,1,60)))note("Choose valid project categories");
 const tags=raw.tags||[];
 if(!Array.isArray(tags)||tags.length>16||!tags.every(s=>validText(s,1,60))||
   new Set(tags).size!==tags.length)note("Invalid project tags");
 const binary=logoBytes(raw.logoPngBase64);
 const logoUrl=binary?"https://xita.xgr.network/pictures/tokens/"+slug+".png":safeUrl(raw.logoUrl);
 if(!logoUrl)note("Provide a HTTPS logo URL or upload a PNG");
 if(raw.confirmed!==true)note("Project representative acknowledgement required");
 const representations=[canonicalChain,"xgrchain",...chosen].filter((key,i,arr)=>arr.indexOf(key)===i);
 if(representations.length<2)note("An XGRChain spoke is required");
 const priceSource=raw.priceSource==="coingecko"?"coingecko":"none";
 const coingeckoId=priceSource==="coingecko"?String(raw.coingeckoId||"").toLowerCase():null;
 if(priceSource==="coingecko"&&!/^[a-z0-9][a-z0-9-]{0,99}$/.test(coingeckoId||""))note("Invalid CoinGecko ID");
 const linkMap=normalizeLinks(raw.links);
 const normalized={name,symbol,slug,shortDescription,description,website,
  canonicalChain,canonicalAddress:address,decimals:raw.decimals,
  targets:[...chosen].sort(),categories,tags,
  logoUrl,links:linkMap,priceSource,coingeckoId,confirmed:true};
 return {normalized,binary};
}
export function buildManifestBundle(raw,catalog){
 const {normalized:a,binary}=normalizeApplication(raw,catalog);
 const key=a.symbol,base="config/assets/"+key;
 const candidate={asset:key,canonical:{chain:a.canonicalChain,representation:"collateral",tokenAddress:a.canonicalAddress}};
 const assetId=canonicalAssetId(candidate,catalog.chains);
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
 const mainnet={schemaVersion:1,kind:"asset-network-config",asset:key,network:"mainnet",
  routeManifest:base+"/routes.json",deploymentManifest:"deployments/mainnet/assets/"+key+".json",
  notes:"Directory listing and route intentions only; on-chain deployment and activation are independent."};
 const deployment={schemaVersion:2,kind:"asset-deployment",network:"mainnet",asset:key,assetId,
  sourceManifest:base+"/asset.json",receiptPaths:[]};
 const listing={schemaVersion:1,kind:"xita-asset-listing",asset:key,status:"accepted",basis:"review-merged",publicProof:null};
 const proposedCatalog={
  chains:catalog.chains,infrastructure:catalog.infrastructure,
  assets:{...catalog.assets,[key]:{metadata,profile,routes:routeConfig,mainnet,deployment,listing}}
 };
 const errors=validateCatalog(proposedCatalog);
 if(errors.length)note("Generated manifest failed validation: "+errors.slice(0,4).join("; "));
 const json=x=>JSON.stringify(x,null,2)+"\n";
 const files={
  [base+"/asset.json"]:json(metadata),
  [base+"/metadata.json"]:json(profile),
  [base+"/routes.json"]:json(routeConfig),
  [base+"/mainnet.json"]:json(mainnet),
  ["deployments/mainnet/assets/"+key+".json"]:json(deployment),
  ["apps/web/catalog.json"]:json({schemaVersion:1,...proposedCatalog})
 };
 return {key,slug:a.slug,assetId,files,
  ...(binary?{logo:{path:"apps/web/pictures/tokens/"+a.slug+".png",base64:binary.toString("base64")}}:{}),
  summary:{name:a.name,symbol:a.symbol,canonicalChain:a.canonicalChain,
   chains,routeCount:routes.length,verified:false}};
}
