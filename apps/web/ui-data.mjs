// XETA reads event projections from the existing XGR Explorer, not a second explorer.
// The reverse proxy maps /api/xeta/v1 and /api/xgr-price to the existing Explorer API.
// Unavailable endpoints are reported as unavailable, never replaced with fake zeroes.
const API="/api/xeta/v1";
async function readJSON(path){
 const res=await fetch(path,{cache:"no-store",headers:{accept:"application/json"}});
 if(!res.ok)throw new Error("Indexer HTTP "+res.status);
 const data=await res.json();
 if(!data?.ok)throw new Error("Indexer reported unavailable");
 return data;
}
export async function loadXetaOverview(){return readJSON(API+"/overview");}
export async function loadXetaAsset(id){return readJSON(API+"/assets/"+encodeURIComponent(id));}
export async function loadXetaTransfers(id,limit=15){
 return readJSON(API+"/transfers?asset="+encodeURIComponent(id)+"&limit="+limit);
}
export async function loadMarketPrice(id){
 if(id!=="XGR")return null;
 const res=await fetch("/api/xgr-price",{cache:"no-store",headers:{accept:"application/json"}});
 if(!res.ok)throw Error("Market feed unavailable");
 const data=await res.json();
 const price=Number(data?.market_price_usdc_per_xgr);
 // Do not treat price_eur (the OTC discounted quote) as a market price.
 if(!data?.ok||!Number.isFinite(price)||price<=0)return null;
 return {value:price,currency:"USDC",source:"Explorer XGR market price",asOf:data?.timestamp??null};
}
export function aggregate(rows,decimals=18){
 if(!Array.isArray(rows))return null;
 let count=0,delivered=0,measured=0,amount=0n;
 const feesByChain={};
 for(const row of rows){
  const n=Number(row.transfers||0),d=Number(row.delivered||0),m=Number(row.measuredAmounts||0);
  if(!Number.isInteger(n)||n<0||!Number.isInteger(d)||d<0||!Number.isInteger(m)||m<0||m>n)
   throw Error("Invalid indexed counters");
  count+=n;delivered+=d;measured+=m;
  amount+=BigInt(row.amountRaw||"0");
  const key=String(row.sourceChainId);
  feesByChain[key]=(feesByChain[key]||0n)+BigInt(row.feeWei||"0");
 }
 const scale=10n**BigInt(decimals);
 const value=amount/scale;
 const fraction=(amount%scale).toString().padStart(decimals,"0").slice(0,6).replace(/0+$/,"");
 return {count,delivered,measured,complete:measured===count,
  amount: value.toString()+(fraction?"."+fraction:""),feesByChain};
}
export function displayPrice(price){
 if(!price||!Number.isFinite(price.value))return "—";
 return new Intl.NumberFormat("en-US",{maximumFractionDigits:8}).format(price.value)+" "+price.currency;
}
export function displayUnix(value){
 const ms=Number(value)*1000;
 return Number.isFinite(ms)&&ms>0?new Date(ms).toLocaleString():"—";
}
