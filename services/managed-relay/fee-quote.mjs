// Optional GmbH-operated quote economics. NOT a consensus or mint price oracle.
// XGR's CoinGecko ID is exactly "xgr" (operator's market maker).
export const COINGECKO_GAS_COIN_IDS = Object.freeze({
 xgrchain:"xgr",
 base:"ethereum",
 arbitrum:"ethereum",
 polygon:"polygon-ecosystem-token",
});
const nonnegative=x=>typeof x==="bigint"&&x>=0n;
export function ceilDiv(a,b){
 if(!nonnegative(a)||!nonnegative(b)||b===0n)throw Error("Invalid fee conversion integer");
 return (a+b-1n)/b;
}
// Preserve fractional USD precision; never use JS floating-point multiplication
// for any wei value. CoinGecko 0.00000001 USD is exactly representable as 1e4
// increments at 12-decimal USD precision.
export function usdPrice12(value){
 const str=typeof value==="number"?String(value):value;
 const m=/^([0-9]+)(?:\.([0-9]+))?(?:e([+-]?[0-9]+))?$/i.exec(str||"");
 if(!m)throw Error("Invalid CoinGecko USD price");
 const exp=Number(m[3]||0),digits=BigInt(m[1]+(m[2]||""));
 const powers=12+exp-(m[2]||"").length;
 if(!Number.isInteger(exp)||exp<-30||exp>30||powers<-50||powers>50)
  throw Error("CoinGecko USD price out of range");
 const n=powers>=0?digits*10n**BigInt(powers):digits/10n**BigInt(-powers);
 if(n<=0n||n>1000000000n*10n**12n)throw Error("CoinGecko USD price invalid");
 return n;
}
export function costInSourceWei({
 sourcePriceUsd,destinationPriceUsd,destinationGasPriceWei,
 destinationGasUnits,bufferBps=13000n
}){
 const src=usdPrice12(sourcePriceUsd),dst=usdPrice12(destinationPriceUsd);
 const gas=BigInt(destinationGasPriceWei),units=BigInt(destinationGasUnits);
 const buffer=BigInt(bufferBps);
 if(gas<=0n||units<21000n||units>5000000n||
   buffer<10000n||buffer>30000n)throw Error("Unsafe destination gas quote");
 const cost=gas*units;
 const nativeEquivalent=ceilDiv(cost*dst,src);
 return {
  estimatedDestinationCostWei:cost.toString(),
  quotedServiceFeeWei:ceilDiv(nativeEquivalent*buffer,10000n).toString(),
  sourcePrice12:src.toString(),destinationPrice12:dst.toString(),
 };
}
export function verifiedCoinGeckoPrices(data,source,destination,{now=Date.now(),maxAgeSec=240}={}){
 const sourceId=COINGECKO_GAS_COIN_IDS[source],
  destinationId=COINGECKO_GAS_COIN_IDS[destination];
 if(!sourceId||!destinationId)throw Error("Unsupported native gas coin");
 const out={};
 for(const id of new Set([sourceId,destinationId])){
  const item=data?.[id],age=Math.floor(now/1000)-Number(item?.last_updated_at);
  if(!Number.isFinite(item?.usd)||item.usd<=0||
    !Number.isSafeInteger(Number(item?.last_updated_at))||
    !Number.isFinite(age)||age<0||age>maxAgeSec)throw Error("CoinGecko price stale or unavailable: "+id);
  usdPrice12(item.usd);
  out[id]=item.usd;
 }
 return {sourceId,destinationId,sourceUsd:out[sourceId],destinationUsd:out[destinationId]};
}
