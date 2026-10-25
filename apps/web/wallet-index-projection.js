// The indexed SQL wallet endpoint owns all persistent journey rows.
// Keep only an explicitly active, not-yet-indexed wallet broadcast provisional.
// No explorer-derived or localStorage-derived confirmed history is appended.
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const key=item=>item.sourceChain+":"+String(item.txHash||"").toLowerCase();
export function canonicalWalletSnapshot({account,rows,previous=[],activeSourceHash=null}={}){
 if(!ADDRESS.test(account||"")||!Array.isArray(rows))return [];
 const owner=account.toLowerCase();
 const indexed=rows.filter(row=>row?.account?.toLowerCase()===owner&&
  HASH.test(row.txHash||"")&&row.confirmed===true);
 const byKey=new Map(indexed.map(row=>[key(row),row]));
 // An independently confirmed on-chain child already associated with the
 // exact indexed parent may arrive before its SQL projection. Preserve only
 // that cryptographic linkage, never guess from a shared amount or wallet.
 for(const parent of previous){
  if(parent?.account?.toLowerCase()!==owner||!HASH.test(parent?.txHash||"")||
     !HASH.test(parent?.secondHopTxHash||"")||!HASH.test(parent?.secondHopMessageId||"")||
     !["awaiting-final-proof","final-delivery-unknown","journey-delivered"].includes(parent.status)||
     parent.confirmed!==true||parent.delivered!==true)continue;
  const current=byKey.get(key(parent));
  if(!current||current.delivered!==true||current.account?.toLowerCase()!==owner||
     !HASH.test(current.messageId||"")||current.messageId.toLowerCase()!==String(parent.messageId||"").toLowerCase()||
     current.routeId?.toLowerCase()!==parent.routeId?.toLowerCase()||
     current.onwardRouteId?.toLowerCase()!==parent.onwardRouteId?.toLowerCase()||
     current.amountRaw!==parent.amountRaw||current.asset!==parent.asset||
     current.finalDestinationChain!==parent.finalDestinationChain||
     current.finalRecipient?.toLowerCase()!==parent.finalRecipient?.toLowerCase()||
     (current.secondHopTxHash&&current.secondHopTxHash.toLowerCase()!==parent.secondHopTxHash.toLowerCase())||
     (current.secondHopMessageId&&current.secondHopMessageId.toLowerCase()!==parent.secondHopMessageId.toLowerCase()))continue;
  // Keep newest independently sourced child while SQL catches up.
  if(!HASH.test(current.secondHopTxHash||""))
   byKey.set(key(parent),{...current,secondHopTxHash:parent.secondHopTxHash,
    secondHopMessageId:parent.secondHopMessageId,finalDelivered:parent.finalDelivered,
    status:parent.status});
 }
 // The active wallet operation must not disappear when its receipt is mined
 // but the finalized SQL index has not yet observed the source log.
 const provisional=HASH.test(activeSourceHash||"")?
  previous.find(row=>row?.account?.toLowerCase()===owner&&
   row.txHash?.toLowerCase()===activeSourceHash.toLowerCase()):null;
 if(provisional&&!byKey.has(key(provisional))&&
   !indexed.some(row=>row.secondHopTxHash?.toLowerCase()===provisional.txHash?.toLowerCase()))
  byKey.set(key(provisional),provisional);
 return [...byKey.values()];
}
