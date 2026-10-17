// Header open-delivery badge is a view of CHAIN-DERIVED evidence only.
// Unknown destination status, failed/pending source and cross-wallet data
// never count as confirmed unfinished mint/unlock.
const ACCOUNT=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
export function pendingDeliveryCount({account,items=[],indexedOpenCount=0}={}){
 if(!ACCOUNT.test(account||"")||!Array.isArray(items))return 0;
 const seen=new Set;
 for(const item of items){
  if((item?.status==="awaiting-proof"&&item.delivered===false||
     item?.status==="awaiting-onward"&&item.delivered===true&&item.onwardRouteId||
     item?.status==="awaiting-final-proof"&&item.onwardRouteId)&&
   item.confirmed===true&&item.account?.toLowerCase()===account.toLowerCase()&&
   HASH.test(item.messageId||"")&&HASH.test(item.txHash||""))
    seen.add(item.sourceChain+":"+item.messageId.toLowerCase());
 }
 const indexed=Number.isSafeInteger(indexedOpenCount)&&indexedOpenCount>=0?
  indexedOpenCount:0;
 return Math.max(seen.size,indexed);
}
