// Read-only token discovery: only show ERC-20 contracts that belong to
// independently documented, receipt-backed routes. Never trust a catalog
// metadata address alone, and never treat a native coin router as ERC-20.
import {formatUnits} from "./wallet-core.js";

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const AMOUNT=/^(?:0|[1-9][0-9]*)$/;

export function verifiedSyntheticContract(routes,assetId,representation){
 if(representation?.representation!=="synthetic"||!Array.isArray(routes))return null;
 const chain=representation.chain,addresses=new Set();
 for(const route of routes){
  if(route?.asset!==assetId)continue;
  const candidate=route.source===chain?route.sourceToken:
    route.destination===chain?route.destinationRouter:null;
  if(ADDRESS.test(candidate||"")&&!/^0x0{40}$/i.test(candidate))
   addresses.add(candidate.toLowerCase());
 }
 // Conflicting routers, absent deployments and unverified routes fail closed.
 return addresses.size===1?[...addresses][0]:null;
}

export function walletRepresentationBalance(wallet,assetId,representation,{tokenDecimals=18,nativeDecimals=18}={}){
 if(!ADDRESS.test(wallet?.account||""))return null;
 if(wallet.loading)return {status:"loading",label:"Checking balance…"};
 const native=representation?.representation==="native";
 if(!native&&representation?.representation!=="synthetic")
  return {status:"unavailable",label:"Balance not available for this representation"};
 const key=representation.chain;
 const result=native?wallet.balances?.[key]:wallet.tokenBalances?.[assetId+":"+key];
 const decimals=native?nativeDecimals:tokenDecimals;
 const raw=native?result?.balanceWei:result?.balanceRaw;
 if(result?.status!=="ready"||!AMOUNT.test(String(raw??""))||
    !Number.isInteger(decimals)||decimals<0||decimals>36)
  return {status:"unavailable",label:"Balance unavailable · RPC read failed"};
 try{
  const amount=BigInt(raw),symbol=representation.symbol||assetId;
  const shown=formatUnits(amount,decimals,8);
  const value=amount>0n&&shown==="0"&&decimals>8?"< 0.00000001":shown;
  return {status:"ready",label:value+" "+symbol};
 }catch{return {status:"unavailable",label:"Balance unavailable · invalid RPC result"};}
}

// Whitelisted explorer links only. Never interpolate an unverified URL.
export function tokenExplorerUrl(chain,address){
 if(!ADDRESS.test(address||""))return null;
 const origin={base:"https://basescan.org/token/",polygon:"https://polygonscan.com/token/",
  arbitrum:"https://arbiscan.io/token/"}[chain];
 return origin?origin+address:null;
}
