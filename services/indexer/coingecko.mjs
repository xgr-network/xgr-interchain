// Public CoinGecko market snapshots for configured IDs.
// Market capitalization is external provider data, NEVER an on-chain proof.
const ID=/^[a-z0-9][a-z0-9-]{0,99}$/;
const now=()=>Date.now();
export function configuredIds(catalog){
 return [...new Set(Object.values(catalog?.assets||{}).map(a=>a.profile?.market?.priceSource==="coingecko"?a.profile?.market?.coingeckoId:null).filter(id=>ID.test(id||"")))];
}
export function validMarketRecord(record,asOf){
 const price=record?.current_price,cap=record?.market_cap,supply=record?.circulating_supply;
 const valid=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
 if(!valid(price)||price===0||!valid(cap)||!valid(supply)||supply===0)return null;
 return {priceUsd:price,marketCapUsd:cap,circulating:supply,asOf,source:"coingecko"};
}
export async function getCoinGeckoPrices(catalog,{fetcher=fetch,clock=now,apiKey=process.env.XITA_COINGECKO_API_KEY}={}){
 const ids=configuredIds(catalog);
 if(!ids.length)return {records:{},asOf:new Date(clock()).toISOString(),source:"coingecko"};
 const url="https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids="+encodeURIComponent(ids.join(","))+"&per_page="+ids.length+"&page=1";
 const headers={"Accept":"application/json"};
 if(apiKey)headers["x-cg-demo-api-key"]=apiKey;
 const response=await fetcher(url,{headers,signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error("CoinGecko HTTP "+response.status);
 const data=await response.json();
 if(!Array.isArray(data))throw Error("CoinGecko response invalid");
 const asOf=new Date(clock()).toISOString(),records={};
 for(const item of data){
  if(!ids.includes(item.id))continue;
  const record=validMarketRecord(item,asOf);
  if(record)records[item.id]=record;
 }
 return {records,asOf,source:"coingecko"};
}
