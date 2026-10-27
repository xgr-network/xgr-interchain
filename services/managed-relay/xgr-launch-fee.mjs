// Fixed launch ceiling for the XITA SERVICE FEE of XGR transfers.
// This does not alter Gateway protocol fees, token principal, native gas,
// immutable signed sponsorship grants, or on-chain quote verification.
// Source-chain native coin value is derived from the SAME fresh, backend-only
// CoinGecko snapshot already used by the quote signer and public preview.
import {usdPrice12} from "./fee-quote.mjs";

export const XGR_LAUNCH_CAP_XGR_WEI=100n*10n**18n;
const DECIMAL=/^(0|[1-9][0-9]*)$/;
const UINT256=1n<<256n;
const min=(a,b)=>a<b?a:b;

export function capXgrLaunchServiceFee({
 regularFeeWei,uiAvailabilityFeeWei,sourceNativeUsd,xgrUsd
}={}){
 if(!DECIMAL.test(String(regularFeeWei))||
    !DECIMAL.test(String(uiAvailabilityFeeWei)))
  throw Error("Invalid XGR launch fee inputs");
 const regular=BigInt(regularFeeWei),ui=BigInt(uiAvailabilityFeeWei);
 if(regular<=0n||regular>=UINT256||ui<=0n||ui>regular)
  throw Error("Invalid XGR launch fee bounds");
 // Floor the conversion to ensure the customer NEVER pays > 100 XGR
 // equivalent even when the source coin is ETH (Base/Arbitrum).
 // No JS floating point or extra price/RPC call.
 const capWei=(XGR_LAUNCH_CAP_XGR_WEI*usdPrice12(xgrUsd))/
  usdPrice12(sourceNativeUsd);
 if(capWei<1n||capWei>=UINT256)
  throw Error("XGR launch price cap unavailable");
 const charged=min(regular,capWei),chargedUi=min(charged,ui);
 return {
  chargedFeeWei:charged.toString(),
  uiAvailabilityFeeWei:chargedUi.toString(),
  sponsoredServiceFeeWei:(charged-chargedUi).toString(),
  regularFeeWei:regular.toString(),
  capWei:capWei.toString(),
  discountWei:(regular-charged).toString(),
  applied:charged<regular
 };
}
