// XITA system rankings: GitHub main defines public assets and representations.
// Verified on-chain collateral/movement and CoinGecko market data only add metrics.
// No price/TVL estimates and no planets for unranked assets.
import {verifiedMetrics} from "./leaderboard-data.js";
import {representationFor} from "./token-representation.js";
import {isPublicAsset} from "./listing-visibility.js";
const SORT=new Set(["lockedUsd","marketCapUsd","movedUsd"]);
const ADDR=/^0x[0-9a-fA-F]{40}$/;
const valid=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
export const MAX_ORBIT_TOKENS=6;
export const rankingSort=s=>SORT.has(s)?s:"lockedUsd";
export function representationReady(asset,chain){
 const rep=asset?.metadata?.representations?.find(x=>x.chain===chain);
 if(!rep)return false;
 if(rep.representation==="native"&&asset.metadata?.canonical?.chain===chain)return true;
 // A synthetic still under construction has no verified representation address.
 if(!ADDR.test(rep.assetAddress||""))return false;
 // An external published representation must be backed by a deployment ledger.
 const receiptPaths=asset?.deployment?.receiptPaths;
 return Array.isArray(receiptPaths)&&receiptPaths.length>0;
}
export function systemRanking(catalog,snapshot,chain,{sort="lockedUsd",search="",limit=MAX_ORBIT_TOKENS}={}){
 if(!Object.hasOwn(catalog?.chains||{},chain))return null;
 sort=rankingSort(sort);
 const text=String(search||"").trim().toLowerCase().slice(0,80);
 const max=Math.max(1,Math.min(MAX_ORBIT_TOKENS,Number.isSafeInteger(limit)?limit:MAX_ORBIT_TOKENS));
 const candidates=Object.entries(catalog.assets||{}).filter(([id,asset])=>
   isPublicAsset(id,asset)&&representationReady(asset,chain));
 const matches=candidates.filter(([id,a])=>(id+" "+(a.profile?.name||"")+" "+(a.metadata?.symbol||"")).toLowerCase().includes(text));
 const rows=matches.map(([id,asset])=>{
  const metric=verifiedMetrics(snapshot,id);
  const value=metric?.[sort]??null;
  const rep=representationFor({id,representations:asset.metadata?.representations},chain);
  return {assetId:id,slug:asset.profile?.slug||id.toLowerCase(),name:asset.profile?.name||id,
   symbol:rep.symbol,representation:rep.kind,
   marketCapUsd:metric?.marketCapUsd??null,lockedUsd:metric?.lockedUsd??null,movedUsd:metric?.movedUsd??null,
   asOf:metric?.asOf||null,value};
 });
 const ranking=rows.filter(row=>valid(row.value)).sort((a,b)=>b.value-a.value||a.assetId.localeCompare(b.assetId));
 return {schemaVersion:1,kind:"xita-system-ranking-v1",chain,sort,
  verifiedMetricCount:ranking.length,eligibleAssets:candidates.length,matchedAssets:matches.length,
  items:ranking.slice(0,max),status:ranking.length?"available":"unavailable",
  note:ranking.length?"Ranked by sourced "+sort+"; asset-wide values, not chain-specific escrow totals.":
   "No eligible tokens have an independently available "+sort+" metric. No estimated planets are displayed."};
}
