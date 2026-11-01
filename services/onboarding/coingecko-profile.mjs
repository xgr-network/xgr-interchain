// CoinGecko metadata is input to reviewed XITA GitHub proposals, never a
// source of contract authority, custody, or live transfer deployments.
import {assertCoinGeckoIdentity,verifiedAssetPlatform} from "./coingecko-identity.mjs";
import {normalizeJoinDescription} from "../../apps/web/join-description.js";
import {isDeployedChain} from "../../apps/web/route-availability.js";
import {validateCatalog} from "../../tools/validate-manifests.mjs";
import {assetConfigFolder} from "../../tools/manifest-layout.mjs";
const ID=/^[a-z0-9][a-z0-9-]{0,99}$/,ADDR=/^0x[0-9a-f]{40}$/i,EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_TEXT=/[<>\x00-\x1f\x7f]/,MAIL=/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const cache=new Map();
export function publicHttps(value){
 if(typeof value!=="string"||value.length>512)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||!u.hostname.includes(".")||
     /^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)||
     /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
}
const firstUrl=values=>(Array.isArray(values)?values:[values]).map(publicHttps).find(Boolean)||null;
export function cleanCoinText(value){
 if(typeof value!=="string")return "";
 return value.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi," ")
  .replace(/<[^>]*>/g," ")
  .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi,x=>
   ({"&nbsp;":" ","&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&#39;":"'"}[x.toLowerCase()]||" "))
  .replace(/&#(\d{1,7});/g,(_,n)=>{const v=Number(n);return v>=32&&v<=126?String.fromCharCode(v):" "})
  .replace(/[<>\x00-\x1f\x7f]/g," ").replace(/\s+/g," ").trim();
}
export async function fetchCoinDetails(id,{fetcher=fetch,apiKey=process.env.XITA_COINGECKO_API_KEY,now=Date.now(),cacheResults=true}={}){
 if(!ID.test(id||""))throw Error("Valid CoinGecko API ID required");
 const prior=cacheResults?cache.get(id):null;
 if(prior&&prior.expires>now)return structuredClone(prior.coin);
 const url="https://api.coingecko.com/api/v3/coins/"+id+
 "?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false";
 let response;
 try{response=await fetcher(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),
   headers:{Accept:"application/json",...(apiKey?{"x-cg-demo-api-key":apiKey}:{})}});}
 catch{throw Error("CoinGecko API unavailable; try again later");}
 if(response.status===404)
  throw Error("Token not found on CoinGecko. Please enter its CoinGecko API ID, not the ticker symbol (for example, optimism instead of OP).");
 if(!response.ok)throw Error("CoinGecko HTTP "+response.status);
 if(Number(response.headers?.get?.("content-length")||0)>1000000)throw Error("Oversized CoinGecko response");
 const body=await response.text();
 if(body.length>1000000)throw Error("Oversized CoinGecko response");
 let coin;try{coin=JSON.parse(body)}catch{throw Error("Invalid CoinGecko response");}
 if(!coin||coin.id!==id)throw Error("CoinGecko ID does not match requested token");
 if(cacheResults){if(cache.size>120)cache.clear();cache.set(id,{coin,expires:now+60000});}
 return structuredClone(coin);
}
export function coinProfile(coin,{fallback=null}={}){
 if(!coin||typeof coin!=="object")throw Error("CoinGecko metadata unavailable");
 const name=cleanCoinText(coin.name);
 const symbol=String(coin.symbol||"").toUpperCase();
 if(!/^[A-Z][A-Z0-9]{1,11}$/.test(symbol))throw Error("CoinGecko symbol is unsupported; contact XGR");
 const desc=cleanCoinText(coin.description?.en||"");
 const description=normalizeJoinDescription(desc.slice(0,5000),40,5000)||
  fallback?.description||null;
 const shortDescription=normalizeJoinDescription((desc.slice(0,270).replace(/\s+\S*$/,"").trim()),15,280)||
  fallback?.shortDescription||null;
 const links=coin.links||{};
 const username=s=>typeof s==="string"&&/^[a-z0-9_]{1,30}$/i.test(s)?s:null;
 const website=firstUrl(links.homepage)||fallback?.links?.website||null;
 const x=username(links.twitter_screen_name);
 const telegram=username(links.telegram_channel_identifier);
 const github=firstUrl(links.repos_url?.github);
 const discord=firstUrl((links.chat_url||[]).filter(s=>/discord\.(gg|com)/i.test(s)));
 const stored=fallback?.links||{};
 const value=(fresh,prior)=>fresh||prior||null;
 const result={
  name:name.length>=2&&name.length<=120&&!SAFE_TEXT.test(name)?name:(fallback?.name||null),
  symbol,shortDescription,description,
  categories:[...new Set((Array.isArray(coin.categories)?coin.categories:[])
   .map(cleanCoinText).filter(s=>s.length>0&&s.length<=120&&!MAIL.test(s)))].slice(0,8),
  logoUrl:publicHttps(coin.image?.large||coin.image?.small||coin.image?.thumb)||fallback?.branding?.logoUrl||null,
  links:{website,explorer:value(firstUrl(links.blockchain_site),stored.explorer),
   github:value(github,stored.github),docs:stored.docs||null,whitepaper:value(publicHttps(links.whitepaper),stored.whitepaper),
   x:value(x?"https://x.com/"+x:null,stored.x),
   linkedin:stored.linkedin||null,telegram:value(telegram?"https://t.me/"+telegram:null,stored.telegram),
   discord:value(discord,stored.discord)}
 };
 if(!result.categories.length)result.categories=fallback?.categories||["Other"];
 if(!result.name||!result.description||!result.shortDescription||!result.logoUrl||!result.links.website)
  throw Error("CoinGecko profile is missing essential data; request manual review");
 if(MAIL.test(JSON.stringify(result)))throw Error("CoinGecko profile contains contact information");
 return result;
}
export function joinCandidates(coin,catalog){
 const items=[];
 for(const [key,chain] of Object.entries(catalog?.chains||{})){
  if(key==="xgrchain"||!isDeployedChain(catalog,key))continue;
  const platform=verifiedAssetPlatform(catalog,key);
  const address=coin?.detail_platforms?.[platform]?.contract_address||coin?.platforms?.[platform];
  const alternate=coin?.platforms?.[platform];
  if(!platform||!ADDR.test(address||"")||/^0x0{40}$/i.test(address)||
   (alternate&&String(alternate).toLowerCase()!==String(address).toLowerCase()))continue;
  const decimals=coin?.detail_platforms?.[platform]?.decimal_place;
  if(!Number.isInteger(decimals)||decimals<0||decimals>36)continue;
  items.push({chain:key,label:chain.displayName||chain.name||key,contract:address.toLowerCase(),decimals});
 }
 return items.sort((a,b)=>a.chain.localeCompare(b.chain));
}
export function joinFromCoin(input,coin,catalog,{requireContact=true}={}){
 if(!input||!ID.test(input.coingeckoId||"")||
    (requireContact&&(!EMAIL.test(input.contactEmail||"")||input.contactEmail.length>254||input.confirmed!==true)))
  throw Error("CoinGecko ID, email and project acknowledgement required");
 const choices=joinCandidates(coin,catalog);
 if(!choices.length){
  const supported=Object.entries(catalog?.chains||{}).filter(([key])=>verifiedAssetPlatform(catalog,key))
   .map(([,chain])=>chain.displayName||chain.name).join(", ");
  throw Error("No verified, deployed EVM original contract with decimals on CoinGecko for the currently available XITA networks: "+supported);
 }
 const chosen=input.canonicalChain|| (choices.length===1?choices[0].chain:null);
 if(!chosen)throw Error("Select the original blockchain from verified CoinGecko contracts");
 const chain=choices.find(c=>c.chain===chosen);
 if(!chain)throw Error("The selected original contract is not CoinGecko-verified");
 const profile=coinProfile(coin);
 const normalized={name:profile.name,symbol:profile.symbol,shortDescription:profile.shortDescription,
  description:profile.description,website:profile.links.website,canonicalChain:chosen,
  canonicalAddress:chain.contract,decimals:chain.decimals,categories:profile.categories,
  tags:[],logoUrl:profile.logoUrl,links:profile.links,priceSource:"coingecko",
  coingeckoId:input.coingeckoId,contactEmail:String(input.contactEmail||"").toLowerCase(),
  applicantRole:"community",confirmed:true};
 assertCoinGeckoIdentity(normalized,coin,{catalog});
 return {normalized,choices,profile};
}
export function checkedUpdateAsset(catalog,symbol){
 if(!/^[A-Z][A-Z0-9]{1,11}$/.test(symbol||"")||!Object.hasOwn(catalog.assets||{},symbol))
  throw Error("Token is not in the approved XITA directory");
 const e=catalog.assets[symbol];
 if(!e?.profile||!e?.metadata?.assetId)throw Error("Missing approved token metadata");
 return e;
}
export function profileUpdateFromCoin({symbol,coingeckoId},coin,catalog){
 const entry=checkedUpdateAsset(catalog,symbol),old=entry.profile;
 const present=old.market?.coingeckoId||null;
 if(present&&coingeckoId!==undefined&&coingeckoId!==present)
  throw Error("Existing CoinGecko ID cannot be replaced through self-service");
 const id=present||coingeckoId;
 if(!ID.test(id||"")||coin?.id!==id)throw Error("A matching CoinGecko API ID is required");
 const cp=coinProfile(coin,{fallback:old});
 if(cp.symbol!==symbol)throw Error("CoinGecko token symbol differs from approved asset");
 const original=entry.metadata.canonical;
 if(!ADDR.test(original.tokenAddress||""))throw Error("Original contract unavailable");
 if(original.chain==="xgrchain"){
  const platform=catalog.chains.xgrchain?.coingeckoAssetPlatform;
  const mapped=platform?(coin.platforms?.[platform]||coin.detail_platforms?.[platform]?.contract_address):null;
  if(mapped){
   if(String(mapped).toLowerCase()!==original.tokenAddress?.toLowerCase())
    throw Error("CoinGecko XGRChain contract does not match this token");
  }else if(!old.links?.website||new URL(cp.links.website).hostname!==new URL(old.links.website).hostname)
   throw Error("Unverified XGRChain CoinGecko association requires a manual review");
 }else{
  assertCoinGeckoIdentity({coingeckoId:id,canonicalChain:original.chain,
   canonicalAddress:original.tokenAddress,symbol,decimals:entry.metadata.decimals},coin,{catalog});
 }
 const profile={...old,name:cp.name,shortDescription:cp.shortDescription,
  description:cp.description,categories:cp.categories,tags:old.tags||[],
  branding:{...old.branding,logoUrl:cp.logoUrl},links:cp.links,
  market:{...old.market,coingeckoId:id,priceSource:"coingecko"}};
 // Neither creator permissions nor contract source identity are modifiable.
 const updated={...entry,profile};
 const candidate={...catalog,assets:{...catalog.assets,[symbol]:updated}};
 const errors=validateCatalog(candidate);
 if(errors.length)throw Error("CoinGecko update fails XITA validation: "+errors.slice(0,3).join("; "));
 if(MAIL.test(JSON.stringify(profile)))throw Error("Private contact details must never enter GitHub");
 const folder=assetConfigFolder(symbol,entry.metadata.assetId);
 const json=x=>JSON.stringify(x,null,2)+"\n";
 return {kind:"profile-update",key:symbol,assetId:entry.metadata.assetId,
  summary:{name:profile.name,symbol,applicantRole:"community",coingeckoId:id},
  files:{[folder+"/metadata.json"]:json(profile),
   "apps/web/catalog.json":json({schemaVersion:1,...candidate})}};
}
