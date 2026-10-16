// GmbH-operated OPTIONAL signed source-native fee quotes.
// No protocol authority: signer can only authorize the commercial adapter.
import {randomBytes} from "node:crypto";
import {getAddress,zeroPadValue} from "ethers";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {COINGECKO_GAS_COIN_IDS,costInSourceWei,verifiedCoinGeckoPrices} from "./fee-quote.mjs";

export const MANAGED_QUOTE_TYPES=Object.freeze({
 SponsoredQuote:[
  {name:"payer",type:"address"},{name:"gateway",type:"address"},
  {name:"routeId",type:"bytes32"},{name:"destinationDomain",type:"uint32"},
  {name:"recipient",type:"bytes32"},{name:"amount",type:"uint256"},
  {name:"bridgeValueWei",type:"uint256"},{name:"relayerFeeWei",type:"uint256"},
  {name:"nonce",type:"uint256"},{name:"issuedAt",type:"uint64"}
 ]
});
const NONCE=()=>BigInt("0x"+randomBytes(32).toString("hex"));
const DECIMAL=/^[1-9][0-9]{0,77}$/;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const toUint=v=>{if(typeof v!=="string"||!DECIMAL.test(v))throw Error("Invalid positive raw token amount");return BigInt(v)};
const invalid=()=>{throw Error("No uniquely deployed managed relay route")};
export async function buildManagedQuote({
 catalog,request,executionAddress,signer,readGatewayQuote,
 readExecutionOwner,readQuoteLifetime,getDestinationGasQuote,getCoinGeckoSnapshot,
 clock=Date.now,nonce=NONCE,gasUnits=1200000n,bufferBps=13000n
}){
 const {asset,source,destination,amountRaw,payer,recipient:payout}=request||{};
 const payerAddress=ADDRESS.test(payer||"")?getAddress(payer):null;
 const recipientAddress=ADDRESS.test(payout||"")?getAddress(payout):null;
 if(!payerAddress||!recipientAddress||!ADDRESS.test(executionAddress||"")||
   !["xgrchain","base"].includes(source)||!["xgrchain","base"].includes(destination)||
   source===destination)throw Error("Unsupported source, destination or wallet");
 const amount=toUint(amountRaw);
 if(amount >= 2n**256n)throw Error("Token amount overflow");
 const matching=deployedRoutes(catalog).filter(r=>
  r.asset===asset&&r.source===source&&r.destination===destination);
 if(matching.length!==1)invalid();
 const route=matching[0],src=catalog.chains[source],dst=catalog.chains[destination];
 const execution=getAddress(executionAddress);
 const owner=await readExecutionOwner({source,executionAddress:execution});
 if(!eq(owner,signer?.address))throw Error("Configured relayer key is not contract owner");
 const [bridge,gas,priceData,onChainLifetime]=await Promise.all([
  readGatewayQuote({source,route,destinationDomain:dst.domainId,
   recipient:zeroPadValue(recipientAddress,32),amount}),
  getDestinationGasQuote({destination,relayerAddress:signer.address}),
  getCoinGeckoSnapshot({source,destination}),
  readQuoteLifetime({source,executionAddress:execution})
 ]);
 if(!Number.isSafeInteger(Number(dst?.domainId))||dst.domainId<1)
  throw Error("Invalid destination chain domain");
 const bridgeValue=BigInt(bridge?.bridgeNativeWei??-1);
 if(bridgeValue<1n||BigInt(bridge?.validatorFeeWei??0)<1n||
    (route.sourceToken===null?BigInt(bridge.tokenAmount??-1)!==0n:
     BigInt(bridge.tokenAmount??-1)!==amount))
  throw Error("Source Gateway bridge quote unavailable or token mismatch");
 const units=BigInt(gasUnits),gasPriceWei=BigInt(gas.gasPriceWei);
 const destinationCost=units*gasPriceWei;
 if(BigInt(gas.availableWei)<destinationCost*2n)
  throw Error("Relayer lacks destination native gas reserve");
 const ttl=BigInt(onChainLifetime);
 if(ttl<1n||ttl>90n)throw Error("Invalid deployed managed quote lifetime");
 const now=clock(),oracle=verifiedCoinGeckoPrices(priceData,source,destination,{now});
 const fee=costInSourceWei({sourcePriceUsd:oracle.sourceUsd,
  destinationPriceUsd:oracle.destinationUsd,destinationGasPriceWei:gasPriceWei,
  destinationGasUnits:units,bufferBps});
 const relayerFeeWei=BigInt(fee.quotedServiceFeeWei);
 if(relayerFeeWei===0n)throw Error("Native source service fee unavailable");
 const issuedAt=Math.floor(now/1000);
 if(!Number.isSafeInteger(issuedAt)||issuedAt<1)
  throw Error("Invalid managed quote issuance clock");
 const expiresAt=issuedAt+Number(ttl);
 const q={
  payer:payerAddress,gateway:getAddress(route.gateway),routeId:route.routeId,
  destinationDomain:dst.domainId,
  recipient:zeroPadValue(recipientAddress,32),
  amount:amount.toString(),bridgeValueWei:bridgeValue.toString(),
  relayerFeeWei:relayerFeeWei.toString(),nonce:nonce().toString(),
  issuedAt
 };
 const domain={name:"XITA Managed Relay",version:"1",chainId:src.chainId,
  verifyingContract:execution};
 const signature=await signer.signTypedData(domain,MANAGED_QUOTE_TYPES,q);
 if(!/^0x[0-9a-f]{130}$/i.test(signature))
  throw Error("Invalid operator quote signature");
 return {
  status:"SIGNED_MANAGED_QUOTE",source,sourceChainId:src.chainId,destination,
  asset,relayerOwner:owner,executionAddress:execution,
  quote:q,signature,expiresAt,quoteLifetimeSeconds:Number(ttl),
  feeCurrency:COINGECKO_GAS_COIN_IDS[source], // CoinGecko ID, not an ERC20
  sourceValueWei:(bridgeValue+relayerFeeWei).toString(),
  pricing:{sourceNativeCoinGeckoId:oracle.sourceId,
   destinationNativeCoinGeckoId:oracle.destinationId,
   sourceNativeUsd:oracle.sourceUsd,destinationNativeUsd:oracle.destinationUsd,
   destinationGasUnits:units.toString(),destinationGasPriceWei:gasPriceWei.toString(),
   estimatedDestinationCostWei:fee.estimatedDestinationCostWei,
   sourceNativeRelayerFeeWei:fee.quotedServiceFeeWei,
   bufferBps:String(bufferBps),oracle:"CoinGecko",maximumAgeSeconds:240},
 };
}
