// Shared, persisted CoinGecko gas-coin prices for both unsigned previews and
// the independent EIP-712 quote signer. HTTP handlers NEVER fetch CoinGecko.
// A keyless systemd timer refreshes this file at a bounded two-minute cadence.
import {readFile,writeFile,rename,unlink} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import {COINGECKO_GAS_COIN_IDS,usdPrice12} from "./fee-quote.mjs";

export const PRICE_CACHE_KIND="xita-interchain-gas-prices-v1";
export const PRICE_CACHE_MAX_AGE_SECONDS=900; // Hard 15-minute market-data circuit breaker.
export const PRICE_REFRESH_SECONDS=120;
export const DEFAULT_PRICE_CACHE_PATH="/var/lib/xita/interchain-gas-prices.json";
const ID=/^[a-z0-9][a-z0-9-]{0,99}$/;
const requiredIds=()=>[...new Set(Object.values(COINGECKO_GAS_COIN_IDS))];
const seconds=time=>Math.floor(time/1000);
const filePath=()=>process.env.XITA_INTERCHAIN_PRICE_CACHE_PATH||DEFAULT_PRICE_CACHE_PATH;
function validPrice(entry,nowSec){
 const age=nowSec-Number(entry?.last_updated_at);
 if(typeof entry?.usd!=="number"||!Number.isFinite(entry.usd)||entry.usd<=0||
  !Number.isSafeInteger(entry.last_updated_at)||!Number.isFinite(age)||
  age<0||age>PRICE_CACHE_MAX_AGE_SECONDS)return false;
 try{usdPrice12(entry.usd);return true}catch{return false}
}
function assertCache(cache,now){
 const at=cache?.refreshedAt;
 if(cache?.kind!==PRICE_CACHE_KIND||cache?.version!==1||
  !Number.isSafeInteger(at)||at>now||now-at>PRICE_CACHE_MAX_AGE_SECONDS*1000||
  typeof cache?.prices!=="object"||cache.prices===null||Array.isArray(cache.prices))
  throw Error("Interchain pricing cache missing or stale; no fee quote signed");
 const prices={},nowSec=seconds(now);
 for(const id of requiredIds()){
  const entry=cache.prices[id];
  if(validPrice(entry,nowSec))prices[id]={usd:entry.usd,last_updated_at:entry.last_updated_at,...(Number.isFinite(entry.eur)&&entry.eur>0?{eur:entry.eur}:{})};
 }
 if(!Object.keys(prices).length)
  throw Error("Interchain pricing cache has no valid market prices");
 return prices;
}
export async function readCachedGasPrices({path=filePath(),now=Date.now()}={}){
 let body;
 try{body=await readFile(path,"utf8")}
 catch{throw Error("Interchain pricing cache unavailable; no fee quote signed")}
 if(body.length>16384)throw Error("Interchain pricing cache invalid");
 let snapshot;
 try{snapshot=JSON.parse(body)}catch{throw Error("Interchain pricing cache invalid")}
 return assertCache(snapshot,now);
}
export async function refreshGasPriceCache({
 path=filePath(),now=Date.now(),fetcher=globalThis.fetch,
 apiKey=process.env.XITA_COINGECKO_API_KEY
}={}){
 const ids=requiredIds();
 if(ids.some(id=>!ID.test(id)))throw Error("Invalid configured native gas coin ID");
 // Independently refreshed server-side. One batched request, never one per route,
 // amount, user, quote or browser render.
 const url="https://api.coingecko.com/api/v3/simple/price?ids="+
  encodeURIComponent(ids.join(","))+"&vs_currencies=usd%2Ceur&include_last_updated_at=true";
 const headers={accept:"application/json"};
 if(apiKey)headers["x-cg-demo-api-key"]=apiKey;
 const response=await fetcher(url,{headers,signal:AbortSignal.timeout(9000)});
 if(!response?.ok)throw Error("CoinGecko backend refresh failed (HTTP "+String(response?.status||"network")+")");
 const body=await response.json();
 if(!body||typeof body!=="object"||Array.isArray(body))
  throw Error("CoinGecko returned invalid price snapshot");
 const entries={},nowSec=seconds(now);
 for(const id of ids){
  const value=body[id];
  if(validPrice({usd:value?.usd,last_updated_at:value?.last_updated_at},nowSec))
   entries[id]={usd:value.usd,last_updated_at:value.last_updated_at,...(Number.isFinite(value.eur)&&value.eur>0?{eur:value.eur}:{})};
 }
 if(!Object.keys(entries).length)throw Error("CoinGecko has no valid gas-coin prices");
 // A partial provider response must not erase other still-valid cached assets.
 // Never permit a carried-forward value to outlive its original timestamp.
 try{
  const old=await readCachedGasPrices({path,now});
  for(const [id,entry] of Object.entries(old))
   if(!entries[id]||entries[id].last_updated_at<entry.last_updated_at)entries[id]=entry;
 }catch{/* Missing/stale cache starts from current verified provider response. */}
 const payload=JSON.stringify({kind:PRICE_CACHE_KIND,version:1,refreshedAt:now,prices:entries})+"\n";
 const temporary=path+".tmp-"+process.pid+"-"+randomBytes(6).toString("hex");
 try{
  await writeFile(temporary,payload,{encoding:"utf8",mode:0o600,flag:"wx"});
  await rename(temporary,path);
 }finally{await unlink(temporary).catch(()=>{});}
 return {refreshedAt:now,coins:Object.keys(entries),path};
}
