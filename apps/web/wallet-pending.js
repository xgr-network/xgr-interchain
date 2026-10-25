import {walletJourneys} from "./verified-journey.js";
import {transferFlowBinding} from "./transfer-flow-binding.js";
// Header badge for canonical wallet-owned unfinished transfer messages.
// Delivery UNKNOWN must remain visible but NEVER be described as delivered.
const ACCOUNT=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const ONWARD=new Set(["awaiting-onward","awaiting-final-proof",
 "final-delivery-unknown","journey-ambiguous"]);
export function pendingDeliveryCount({account,items=[],indexedOpenCount=0}={}){
 if(!ACCOUNT.test(account||"")||!Array.isArray(items))return 0;
 const seen=new Set;
 for(const item of walletJourneys(items)){
  if(item?.confirmed!==true||item.account?.toLowerCase()!==account.toLowerCase()||
    !HASH.test(item.messageId||"")||!HASH.test(item.txHash||""))continue;
  const firstPending=(item.status==="awaiting-proof"&&item.delivered===false)||
   (["delivery-unknown","destination-not-deployed"].includes(item.status)&&
     item.delivered!==true);
  const secondPending=HASH.test(item.onwardRouteId||"")&&
   ONWARD.has(item.status);
  if(firstPending||secondPending)seen.add(item.sourceChain+":"+item.messageId.toLowerCase());
 }
 const indexed=Number.isSafeInteger(indexedOpenCount)&&indexedOpenCount>=0?
  indexedOpenCount:0;
 return Math.max(seen.size,indexed);
}

// Only an EXACT active wallet-broadcast session may get an interim UI notice.
// Neither a history hint nor a bare resume URL proves an on-chain source TX.
// This is intentionally separate from pendingDeliveryCount (confirmed work only).
const SOURCE_UNVERIFIED=new Set([
 "pending-source","confirming","confirming-native-finality","finality-unavailable"
]);
export function activeSourceConfirmation({account,selectedTxHash,items=[],session=null}={}){
 const binding=transferFlowBinding({account,selectedTxHash,items,session});
 if(!binding?.sameSession)return null;
 const record=binding.record;
 if(record&&record.confirmed===true&&!SOURCE_UNVERIFIED.has(record.status))return null;
 if(record&&!SOURCE_UNVERIFIED.has(record.status))return null;
 const label=record?.status==="finality-unavailable"?"Source finality check unavailable":
  record?.status==="confirming"||record?.status==="confirming-native-finality"?
   "Source confirmations pending":"Source transaction awaiting confirmation";
 return {sourceTxHash:binding.sourceTxHash,asset:binding.journey.asset,label,
  href:"/transfer?token="+encodeURIComponent(binding.journey.asset)+
   "&resume="+encodeURIComponent(binding.sourceTxHash)};
}
