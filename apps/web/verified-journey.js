// Shared, deterministic journey linkage for wallet UI and finalized SQL index.
// A second hop is never inferred from balances, matching amounts or wallet hints.
// Both hops require independently confirmed canonical Gateway/Mailbox evidence.
const HASH=/^0x[0-9a-f]{64}$/i;
const lower=x=>String(x||"").toLowerCase();
export function linkIndexedJourneys(items,children){
 const byParent=new Map();
 for(const child of children||[]){
  if(child?.confirmed!==true||!HASH.test(child.parentMessageId||"")||
     child.sourceChain!=="xgrchain"||!HASH.test(child.messageId||""))continue;
  const key=lower(child.parentMessageId);
  byParent.set(key,[...(byParent.get(key)||[]),child]);
 }
 return (items||[]).map(item=>{
  if(item?.confirmed!==true||!item.onwardRouteId||item.delivered!==true||
     !HASH.test(item.messageId||""))return item;
  const matches=(byParent.get(lower(item.messageId))||[]).filter(child=>
    lower(child.account)===lower(item.account)&&child.asset===item.asset&&
    lower(child.routeId)===lower(item.onwardRouteId)&&
    child.destinationChain===item.finalDestinationChain&&
    lower(child.finalRecipient)===lower(item.finalRecipient)&&
    child.amountRaw===item.amountRaw&&child.executionAdapter!=null);
  if(matches.length>1)return {...item,status:"journey-ambiguous"};
  if(!matches.length)return item;
  const next=matches[0];
  return {...item,secondHopTxHash:next.txHash,secondHopMessageId:next.messageId,
   status:next.delivered===true?"journey-delivered":
    next.delivered===false?"awaiting-final-proof":"final-delivery-unknown",
   finalDelivered:next.delivered};
 });
}
