// Header badge for canonical wallet-owned unfinished transfer messages.
// Delivery UNKNOWN must remain visible but NEVER be described as delivered.
const ACCOUNT=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const ONWARD=new Set(["awaiting-onward","awaiting-final-proof",
 "final-delivery-unknown","journey-ambiguous"]);
export function pendingDeliveryCount({account,items=[],indexedOpenCount=0}={}){
 if(!ACCOUNT.test(account||"")||!Array.isArray(items))return 0;
 const seen=new Set;
 for(const item of items){
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
