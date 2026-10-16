// Optional GmbH Interchain Fee pricing. NOT a consensus or mint price oracle.
// The source-native quoted fee is a UNIFORM GROSS price: cost x 1.10 x 1.27.
// Actual VAT is extracted after collection; changes do not alter signed gross.
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
export const DEFAULT_INTERCHAIN_MARKUP_BPS=1000n; // 10% nominal net margin over estimated cost.
export const GERMAN_STANDARD_VAT_BPS=1900n;
export const EU_STANDARD_VAT_PRICE_CAP_BPS=2700n; // 2026 EU max: Hungary (not global maximum).
const BPS=10000n;
/**
 * Fixed source-native GROSS quote (independent of customer's accounting VAT).
 * Price floor = estimated costs * 1.10 * 1.27 = 1.397, rounded up in wei.
 * Reverse-extract actual VAT from this exact customer-paid gross amount.
 * This keeps the consumer quote unchanged across EU VAT jurisdictions and
 * leaves >=10% net margin if actual VAT <= 27%. No contract redeployment
 * is necessary when the VAT accounting policy changes.
 */
export function priceInterchainCostWei({
 estimatedCostSourceWei,markupBps=DEFAULT_INTERCHAIN_MARKUP_BPS,
 priceVatCapBps=EU_STANDARD_VAT_PRICE_CAP_BPS,vatBps
}){
 if(vatBps===undefined||vatBps===null)throw Error("VAT policy unresolved");
 const cost=BigInt(estimatedCostSourceWei),markup=BigInt(markupBps),
  ceiling=BigInt(priceVatCapBps),vatRate=BigInt(vatBps);
 if(cost<=0n||markup!==DEFAULT_INTERCHAIN_MARKUP_BPS||
   ceiling!==EU_STANDARD_VAT_PRICE_CAP_BPS||
   vatRate<0n||vatRate>ceiling)throw Error("Unsafe pricing or VAT quote");
 const minNetAtCapWei=ceilDiv(cost*(BPS+markup),BPS);
 const grossInterchainFeeWei=ceilDiv(minNetAtCapWei*(BPS+ceiling),BPS);
 // VAT-inclusive gross must be the ONLY signed/on-chain customer price.
 // Round net DOWN so net + VAT remains exactly equal to customer gross.
 const netInterchainFeeWei=(grossInterchainFeeWei*BPS)/(BPS+vatRate);
 const vatWei=grossInterchainFeeWei-netInterchainFeeWei;
 const marginWei=netInterchainFeeWei-cost;
 if(marginWei<0n)throw Error("Quoted margin negative after VAT");
 return {
  estimatedCostSourceWei:cost.toString(),
  minimumNetAtVatCapWei:minNetAtCapWei.toString(),
  marginWei:marginWei.toString(),
  netInterchainFeeWei:netInterchainFeeWei.toString(),
  vatWei:vatWei.toString(),
  grossInterchainFeeWei:grossInterchainFeeWei.toString(),
  quotedServiceFeeWei:grossInterchainFeeWei.toString(),
  markupBps:markup.toString(),priceVatCapBps:ceiling.toString(),
  vatRateBps:vatRate.toString()
 };
}
export function costInSourceWei({
 sourcePriceUsd,destinationPriceUsd,destinationGasPriceWei,
 destinationGasUnits,vatBps
}){
 const src=usdPrice12(sourcePriceUsd),dst=usdPrice12(destinationPriceUsd);
 const gas=BigInt(destinationGasPriceWei),units=BigInt(destinationGasUnits);
 if(gas<=0n||units<21000n||units>5000000n)
  throw Error("Unsafe destination gas quote");
 const cost=gas*units;
 const estimatedCostSourceWei=ceilDiv(cost*dst,src);
 return {
  estimatedDestinationCostWei:cost.toString(),
  ...priceInterchainCostWei({estimatedCostSourceWei,vatBps}),
  sourcePrice12:src.toString(),destinationPrice12:dst.toString()
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
