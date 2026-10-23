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
 // The active wallet operation must not disappear when its receipt is mined
 // but the finalized SQL index has not yet observed the source log.
 const provisional=HASH.test(activeSourceHash||"")?
  previous.find(row=>row?.account?.toLowerCase()===owner&&
   row.txHash?.toLowerCase()===activeSourceHash.toLowerCase()):null;
 if(provisional&&!byKey.has(key(provisional)))
  byKey.set(key(provisional),provisional);
 return [...byKey.values()];
}
