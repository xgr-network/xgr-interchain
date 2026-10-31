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
 // An independently finalized Mailbox delivery can reach the browser before
 // the eventual SQL projection has refreshed. Preserve ONLY its positive
 // proof for the exact same canonical route/message, never an unrelated local
 // status or a chain with conflicting finalized evidence.
 for(const verified of previous){
  if(verified?.account?.toLowerCase()!==owner||
     verified.confirmed!==true||verified.delivered!==true||
     verified.finalityVerified!==true||verified.status!=="delivered"||
     !HASH.test(verified.messageId||""))continue;
  const current=byKey.get(key(verified));
  if(!current||current.confirmed!==true||
     current.messageId?.toLowerCase()!==verified.messageId.toLowerCase()||
     current.routeId?.toLowerCase()!==verified.routeId?.toLowerCase()||
     current.gateway?.toLowerCase()!==verified.gateway?.toLowerCase()||
     current.asset!==verified.asset||
     current.destinationChain!==verified.destinationChain||
     current.onwardRouteId||verified.onwardRouteId||
     current.delivered===true||
     (current.finalityVerified===true&&current.destinationFinalityHash&&
      verified.destinationFinalityHash&&
      current.destinationFinalityHash.toLowerCase()!==verified.destinationFinalityHash.toLowerCase()))
   continue;
  byKey.set(key(verified),{...current,delivered:true,status:"delivered",
   finalityVerified:true,destinationFinalityBlock:verified.destinationFinalityBlock,
   destinationFinalityHash:verified.destinationFinalityHash});
 }
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
 // A delayed or paginated SQL page must not silently erase independently
 // confirmed, still-open original wallet operations. Keeping their existing
 // immutable evidence is read-only: the signing path rechecks canonical chain
 // proof, nonce and destination delivery before asking the wallet again.
 for(const previousOpen of previous){
  if(previousOpen?.account?.toLowerCase()!==owner||
     previousOpen.confirmed!==true||
     !HASH.test(previousOpen.txHash||"")||
     !HASH.test(previousOpen.messageId||""))continue;
  const ongoing=previousOpen.delivered!==true||
    (HASH.test(previousOpen.onwardRouteId||"")&&
     previousOpen.status!=="journey-delivered"&&
     previousOpen.finalDelivered!==true);
  if(!ongoing||byKey.has(key(previousOpen)))continue;
  if(indexed.some(row=>row?.secondHopTxHash?.toLowerCase()===
    previousOpen.txHash.toLowerCase()))continue;
  byKey.set(key(previousOpen),previousOpen);
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
