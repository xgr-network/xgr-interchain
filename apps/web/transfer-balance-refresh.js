// Read-only balance refresh hints from verified wallet index transitions.
// No transfer ledger or displayed balance is inferred from these hints.
const key=row=>row.sourceChain+":"+String(row.txHash||"").toLowerCase();
export function changedTransferBalanceChains(previous=[],current=[],account=""){
 const owner=String(account).toLowerCase();
 const old=new Map(previous.filter(r=>r?.account?.toLowerCase()===owner).map(r=>[key(r),r]));
 const changed=new Set();
 for(const row of current){
  if(row?.account?.toLowerCase()!==owner||!row.confirmed)continue;
  const before=old.get(key(row));
  if(!before)continue; // Initial history load is not a new transfer.
  if(before.confirmed!==true&&row.confirmed===true&&row.sourceChain)
   changed.add(row.sourceChain);
  if(before.delivered!==true&&row.delivered===true&&row.destinationChain)
   changed.add(row.destinationChain);
  if(before.status!=="journey-delivered"&&row.status==="journey-delivered"&&
     row.delivered===true&&row.finalDelivered===true&&
     row.finalDestinationChain&&row.secondHopTxHash&&row.secondHopMessageId)
   changed.add(row.finalDestinationChain);
 }
 return [...changed];
}
