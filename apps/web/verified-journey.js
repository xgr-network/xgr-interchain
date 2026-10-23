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

// Only an unambiguous, independently linked child belongs to the same
// wallet-facing journey. Never hide an orphaned or ambiguous second hop.
export function walletJourneys(items=[]){
 const parentIds=new Map();
 for(const parent of items){
  if(parent?.confirmed!==true||parent.delivered!==true||
    !HASH.test(parent.messageId||"")||!HASH.test(parent.onwardRouteId||""))continue;
  const key=lower(parent.messageId);
  parentIds.set(key,[...(parentIds.get(key)||[]),parent]);
 }
 const hidden=new Set();
 for(const child of items){
  if(child?.confirmed!==true||child.sourceChain!=="xgrchain"||
   !HASH.test(child.parentMessageId||"")||!HASH.test(child.messageId||""))continue;
  const parents=(parentIds.get(lower(child.parentMessageId))||[]).filter(parent=>
    lower(parent.account)===lower(child.account)&&parent.asset===child.asset&&
    lower(parent.onwardRouteId)===lower(child.routeId)&&
    parent.finalDestinationChain===child.destinationChain&&
    lower(parent.finalRecipient)===lower(child.finalRecipient)&&
    parent.amountRaw===child.amountRaw&&child.executionAdapter!=null);
  if(parents.length!==1)continue;
  const linked=linkIndexedJourneys([parents[0]],items)[0];
  if(linked.status!=="journey-ambiguous"&&
     lower(linked.secondHopTxHash)===lower(child.txHash))hidden.add(child);
 }
 return items.filter(item=>!hidden.has(item));
}

/**
 * Reconcile independently verified observations of the SAME on-chain source
 * operation. A delayed indexer row must not take an already completed two-hop
 * journey backwards or erase the cryptographically linked onward operation.
 * This is a UI projection only, NEVER a signing or custody authorization.
 */
const PROGRESS=Object.freeze({
 "pending-source":0,"confirming":1,
 "awaiting-proof":2,"delivery-unknown":2,"destination-not-deployed":2,
 "delivered":3,"awaiting-onward":4,
 "awaiting-final-proof":5,"final-delivery-unknown":5,
 "journey-ambiguous":6,"journey-delivered":7
});
export function mergeWalletObservation(previous,incoming){
 if(!previous)return incoming;
 if(!incoming)return previous;
 if(lower(previous.account)!==lower(incoming.account)||
    previous.sourceChain!==incoming.sourceChain||
    lower(previous.txHash)!==lower(incoming.txHash))return previous;
 // The canonical message ID and route identity are immutable. If two backends
 // disagree, retain evidence and block continuation pending investigation.
 const conflict=(a,b)=>a&&b&&lower(a)!==lower(b);
 if(conflict(previous.messageId,incoming.messageId)||
    conflict(previous.routeId,incoming.routeId)||
    conflict(previous.gateway,incoming.gateway))
  return {...previous,status:"journey-ambiguous"};
 if(previous.confirmed===true&&incoming.confirmed!==true)return previous;
 if(previous.delivered===true&&incoming.delivered!==true)return previous;
 const next={...previous,...incoming};
 if((PROGRESS[previous.status]??-1)>(PROGRESS[incoming.status]??-1)){
  next.status=previous.status;
  next.delivered=previous.delivered;
 }
 for(const key of ["secondHopTxHash","secondHopMessageId","finalDelivered"]){
  if(previous[key]!==undefined&&incoming[key]==null)next[key]=previous[key];
 }
 if(conflict(previous.secondHopMessageId,incoming.secondHopMessageId)||
    conflict(previous.secondHopTxHash,incoming.secondHopTxHash))
  return {...next,status:"journey-ambiguous"};
 // A later read-only observation may recover a previously unknown delivery,
 // but never turn a known Mailbox TRUE into FALSE or NULL.
 if(previous.delivered===true)next.delivered=true;
 return next;
}
