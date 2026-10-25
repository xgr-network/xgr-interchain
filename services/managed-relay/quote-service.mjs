// GmbH-operated OPTIONAL signed source-native fee quotes.
// No protocol authority: signer can only authorize the commercial adapter.
import {randomBytes} from "node:crypto";
import {getAddress,zeroPadValue} from "ethers";
import {walletAwareSponsorship} from "./wallet-aware-sponsorship.mjs";
import {ceilDiv,usdPrice12,priceInterchainCostWei} from "./fee-quote.mjs";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {COINGECKO_GAS_COIN_IDS,quotedJourneyCostWei,verifiedCoinGeckoPrices} from "./fee-quote.mjs";

export const MANAGED_QUOTE_TYPES=Object.freeze({
 SponsoredQuote:[
  {name:"payer",type:"address"},{name:"gateway",type:"address"},
  {name:"routeId",type:"bytes32"},{name:"destinationDomain",type:"uint32"},
  {name:"recipient",type:"bytes32"},
  {name:"finalDestinationDomain",type:"uint32"},
  {name:"finalRecipient",type:"bytes32"},
  {name:"onwardRouteId",type:"bytes32"},
  {name:"amount",type:"uint256"},
  {name:"bridgeValueWei",type:"uint256"},{name:"interchainFeeWei",type:"uint256"},
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
 readExecutionOwner,readQuoteLifetime,readSourceBlockTimestamp,
 getDestinationGasQuote,getCoinGeckoSnapshot,readWalletNativeBalance=null,
 walletAwareEnabled=false,
 clock=Date.now,nonce=NONCE,gasUnits=1200000n,preview=false
}){
 const {asset,source,destination,amountRaw,payer,recipient:payout,
  firstHopDestination=null}=request||{};
 const payerAddress=ADDRESS.test(payer||"")?getAddress(payer):null;
 const recipientAddress=ADDRESS.test(payout||"")?getAddress(payout):null;
 if(!payerAddress||!recipientAddress||!ADDRESS.test(executionAddress||"")||
   !catalog?.chains?.[source]||!catalog?.chains?.[destination]||
   source===destination)throw Error("Unsupported source, destination or wallet");
 const amount=toUint(amountRaw);
 if(amount >= 2n**256n)throw Error("Token amount overflow");
 const firstDestination=firstHopDestination||(
  source!=="xgrchain"&&destination!=="xgrchain"?"xgrchain":destination);
 const matching=deployedRoutes(catalog).filter(r=>
  r.asset===asset&&r.source===source&&r.destination===firstDestination);
 if(matching.length!==1)invalid();
 const route=matching[0],src=catalog.chains[source],dst=catalog.chains[firstDestination];
 const second=firstDestination===destination?null:deployedRoutes(catalog).filter(r=>
  r.asset===asset&&r.source==="xgrchain"&&r.destination===destination);
 if(second&&second.length!==1)invalid();
 const finalDomain=catalog.chains[destination]?.domainId;
 if(!Number.isSafeInteger(finalDomain)||finalDomain<1)invalid();
 const execution=getAddress(executionAddress);
 // Globally uniform gross quote. Tax status and customer jurisdiction are
 // separate back-office records, never price-signing or protocol conditions.
 // Two-hop fees include both mailbox deliveries, the XGR onward bridge gas
 // and the ON-CHAIN XGR validator/router fee for the second hop.
 const owner=await readExecutionOwner({source,executionAddress:execution});
 if(!eq(owner,signer?.address))throw Error("Configured quote signing key does not match deployed contract");
 const finalChain=catalog.chains[destination];
 const secondRoute=second?.[0]??null;
 const stageChains=[firstDestination,...(secondRoute?[destination]:[])];
 const gasByChain=new Map;
 const [bridge,priceData,onChainLifetime,secondBridge,sourceTipTimestamp]=await Promise.all([
  readGatewayQuote({source,route,destinationDomain:dst.domainId,
   recipient:zeroPadValue(recipientAddress,32),amount}),
  getCoinGeckoSnapshot({source,destination}),
  readQuoteLifetime({source,executionAddress:execution}),
  secondRoute?readGatewayQuote({source:"xgrchain",route:secondRoute,
   destinationDomain:finalChain.domainId,
   recipient:zeroPadValue(recipientAddress,32),amount}):Promise.resolve(null),
  preview?Promise.resolve(null):readSourceBlockTimestamp?.({source,executionAddress:execution})
 ]);
 if(!Number.isSafeInteger(Number(dst?.domainId))||dst.domainId<1)
  throw Error("Invalid first destination domain");
 const bridgeValue=BigInt(bridge?.bridgeNativeWei??-1);
 if(bridgeValue<1n||BigInt(bridge?.validatorFeeWei??0)<1n||
    (route.sourceToken===null?BigInt(bridge.tokenAmount??-1)!==0n:
     BigInt(bridge.tokenAmount??-1)!==amount))
  throw Error("Source Gateway bridge quote unavailable or token mismatch");
 const gasSnapshots=await Promise.all([...new Set(stageChains)].map(async name=>{
  const fee=await getDestinationGasQuote({destination:name,
   relayerAddress:signer.address});
  const unit=BigInt(fee?.gasPriceWei??0);
  if(unit<1n)throw Error("Unpriced destination gas: "+name);
  return [name,{gasPriceWei:unit,
   availableWei:BigInt(fee.availableWei??0n)}];
 }));
 for(const [name,data] of gasSnapshots)gasByChain.set(name,data);
 const units=BigInt(gasUnits);
 if(units<21000n||units>5000000n)throw Error("Gas units exceed quote safety cap");
 const stages=[{chain:firstDestination,kind:"first-delivery",
  gasUnits:units,gasPriceWei:gasByChain.get(firstDestination).gasPriceWei}];
 let onwardFeeWei=null;
 if(secondRoute){
  if(!secondBridge||BigInt(secondBridge.validatorFeeWei??0)<1n)
   throw Error("Second hop validator quote unavailable");
  const secondValue=BigInt(secondBridge.bridgeNativeWei??-1);
  const secondPrincipal=secondRoute.sourceToken===null?amount:0n;
  if(secondValue<=secondPrincipal||
     secondValue-secondPrincipal<BigInt(secondBridge.validatorFeeWei)||
     BigInt(secondBridge.tokenAmount??-1)!==(secondRoute.sourceToken===null?0n:amount))
   throw Error("Second hop protocol quote or principal invalid");
  onwardFeeWei=secondValue-secondPrincipal;
  stages.push({chain:"xgrchain",kind:"onward-bridge-gas",
   gasUnits:units,gasPriceWei:gasByChain.get("xgrchain").gasPriceWei});
  stages.push({chain:"xgrchain",kind:"onward-protocol-fee",
   nativeFeeWei:onwardFeeWei});
  stages.push({chain:destination,kind:"final-delivery",
   gasUnits:units,gasPriceWei:gasByChain.get(destination).gasPriceWei});
 }
 const ttl=BigInt(onChainLifetime);
 if(ttl<1n||ttl>90n)throw Error("Invalid deployed fee quote lifetime");
 const now=clock();
 const wallSecond=Math.floor(now/1000);
 if(!Number.isSafeInteger(wallSecond)||wallSecond<1)
  throw Error("Invalid quote issuance clock");
 let issuedAt=wallSecond;
 if(!preview){
  // The contract rejects issuedAt > block.timestamp, even by one second.
  // Service wall clocks can run ahead of the latest Base/XGRChain block.
  // Bind to the live SOURCE BLOCK and add a small three-second safety margin
  // for wallets using a second slightly lagging RPC.
  const tipSecond=Number(sourceTipTimestamp);
  if(!Number.isSafeInteger(tipSecond)||tipSecond<1||
     tipSecond>wallSecond+5||wallSecond-tipSecond>15)
   throw Error("Source chain tip clock unavailable or stale; no fee quote signed");
  issuedAt=Math.min(wallSecond,tipSecond)-3;
  if(issuedAt<1||wallSecond-issuedAt>20)
   throw Error("Source chain timestamp cannot safely issue fee quote");
 }
 const oracle=verifiedCoinGeckoPrices(priceData,source,destination,{now});
 const sponsorStages=[{chain:firstDestination,kind:"first-delivery",
  gasUnits:units,gasPriceWei:gasByChain.get(firstDestination).gasPriceWei},
  ...(secondRoute?[{chain:"xgrchain",kind:"hub-onward",
   gasUnits:units,gasPriceWei:gasByChain.get("xgrchain").gasPriceWei,
   nativeFeeWei:onwardFeeWei},{chain:destination,kind:"final-delivery",
   gasUnits:units,gasPriceWei:gasByChain.get(destination).gasPriceWei}]:[])];
 if(walletAwareEnabled&&typeof readWalletNativeBalance!=="function")
  throw Error("Verified wallet balance reader required");
 const balances={};
 if(walletAwareEnabled){
  for(const chain of new Set(sponsorStages.map(x=>x.chain))){
   const v=await readWalletNativeBalance({chain,account:payerAddress});
   if(typeof v!=="bigint"||v<0n||v>=2n**256n)
    throw Error("Unverified native wallet balance");
   balances[chain]=v.toString();
  }
 }
 const allocation=walletAwareEnabled?
  walletAwareSponsorship({stages:sponsorStages,balances}):null;
 const fee=walletAwareEnabled?(()=>{
  // Only the documented shortfall is priced; the positive fixed base fee is
  // independent of wallet balances and covers the operation even at zero grants.
  const cost=allocation.grants.reduce((total,grant)=>
   total+ceilDiv(BigInt(grant.amountWei)*
    usdPrice12(verifiedCoinGeckoPrices(priceData,source,grant.chain,{now}).destinationUsd),
    usdPrice12(oracle.sourceUsd)),0n);
  // Fixed economic margin is derived from the original full journey cost,
  // so sufficient wallet gas still pays the platform for its service.
  const fullWei=BigInt(quotedJourneyCostWei({source,stages,
   coinGeckoSnapshot:priceData,now}).estimatedCostSourceWei);
  const baseWei=ceilDiv(fullWei*1000n,10000n);
  if(baseWei<=0n)throw Error("Derived service margin is unavailable");
  const priced=priceInterchainCostWei({estimatedCostSourceWei:cost+baseWei,vatBps:0n});
  return {...priced,stages:quotedJourneyCostWei({source,stages,
   coinGeckoSnapshot:priceData,now}).stages};
 })():quotedJourneyCostWei({source,stages,coinGeckoSnapshot:priceData,now});
 const gasPriceWei=gasByChain.get(destination).gasPriceWei;
 const interchainFeeWei=BigInt(fee.quotedServiceFeeWei);
 if(interchainFeeWei===0n)throw Error("Native source service fee unavailable");
 const expiresAt=issuedAt+Number(ttl);
 const q={
  payer:payerAddress,gateway:getAddress(route.gateway),routeId:route.routeId,
  destinationDomain:dst.domainId,
  recipient:zeroPadValue(recipientAddress,32),
  finalDestinationDomain:finalDomain,
  finalRecipient:zeroPadValue(recipientAddress,32),
  onwardRouteId:second?second[0].routeId:"0x"+"00".repeat(32),
  amount:amount.toString(),bridgeValueWei:bridgeValue.toString(),
  interchainFeeWei:interchainFeeWei.toString(),nonce:preview?"0":nonce().toString(),
  issuedAt
 };
 const domain={name:"XITA Interchain Fee",version:"1",chainId:src.chainId,
  verifyingContract:execution};
 const signature=preview?null:await signer.signTypedData(domain,MANAGED_QUOTE_TYPES,q);
 if(!preview&&!/^0x[0-9a-f]{130}$/i.test(signature))
  throw Error("Invalid operator quote signature");
 return {
  status:preview?"UNSIGNED_FEE_PREVIEW":"SIGNED_INTERCHAIN_FEE_QUOTE",source,sourceChainId:src.chainId,destination,
  asset,relayerOwner:owner,executionAddress:execution,
  quote:preview?null:q,signature:preview?null:signature,expiresAt:preview?null:expiresAt,quoteLifetimeSeconds:Number(ttl),
  feeCurrency:COINGECKO_GAS_COIN_IDS[source], // CoinGecko ID, not an ERC20
  sourceValueWei:(bridgeValue+interchainFeeWei).toString(),
  validatorFeeWei:String(bridge.validatorFeeWei),
  sourceBridgeNativeWei:bridgeValue.toString(),
  sourceTokenPrincipalWei:route.sourceToken===null?amount.toString():"0",
  pricing:{sourceNativeCoinGeckoId:oracle.sourceId,
   destinationNativeCoinGeckoId:oracle.destinationId,
   sourceNativeUsd:oracle.sourceUsd,destinationNativeUsd:oracle.destinationUsd,
   destinationGasUnits:units.toString(),destinationGasPriceWei:gasPriceWei.toString(),
   estimatedDestinationCostWei:(units*gasPriceWei).toString(),
   estimatedCostSourceWei:fee.estimatedCostSourceWei,
   onwardProtocolFeeWei:onwardFeeWei===null?null:onwardFeeWei.toString(),
   journeyCostStages:fee.stages,
   walletAware:walletAwareEnabled,
   firstDestinationChain:firstDestination,
   sponsorCommitments:allocation?.grants||[],
   sponsorAllocation:allocation?.stages||[],
   grossInterchainFeeWei:fee.grossInterchainFeeWei,
   sourceNativeInterchainFeeWei:fee.quotedServiceFeeWei,
   markupBps:fee.markupBps,
   priceVatCapBps:fee.priceVatCapBps,
   oracle:"CoinGecko · cached backend prices",maximumAgeSeconds:900},
 };
}
