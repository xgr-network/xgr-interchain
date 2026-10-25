// Wallet-specific, bounded read-only discovery hints. These are public
// EVM source TX hashes, NOT evidence of a bridge, transfer journal or any
// authorization to call MetaMask. Every hint must be verified independently
// using a canonical Gateway + Mailbox receipt before displaying as a transfer.
// The on-chain event index remains the durable, cross-device source of truth.
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i;
const SOURCE=/^[a-z][a-z0-9-]{0,40}$/;
export const MAX_SOURCE_HINTS=32;
export const SOURCE_HINT_TTL_MS=365*24*3600*1000;
const KEY="xita-public-source-tx-hints-v1:";
const storeKey=account=>KEY+account.toLowerCase();
function saved(store,account,now){
 if(!store||!ADDRESS.test(account||""))return [];
 try{
  const raw=store.getItem(storeKey(account));
  if(typeof raw!=="string"||raw.length>12000)return [];
  const value=JSON.parse(raw);
  if(!Array.isArray(value))return [];
  const unique=new Set;
  return value.filter(entry=>{
   if(!entry||!SOURCE.test(entry.sourceChain||"")||
    !HASH.test(entry.txHash||"")||!Number.isSafeInteger(entry.at)||
    entry.at>now||now-entry.at>SOURCE_HINT_TTL_MS)return false;
   const key=entry.sourceChain+":"+entry.txHash.toLowerCase();
   if(unique.has(key))return false;
   unique.add(key);return true;
  }).slice(0,MAX_SOURCE_HINTS).map(entry=>({
   sourceChain:entry.sourceChain,txHash:entry.txHash.toLowerCase(),at:entry.at
  }));
 }catch{return []}
}
export function listSourceTxHints(account,{store=globalThis.localStorage,now=Date.now()}={}){
 return saved(store,account,now);
}
export function rememberSourceTxHint({account,sourceChain,txHash},
 {store=globalThis.localStorage,now=Date.now()}={}){
 if(!ADDRESS.test(account||"")||!SOURCE.test(sourceChain||"")||
  !HASH.test(txHash||"")||!Number.isSafeInteger(now))return false;
 try{
  if(!store)return false;
  const previous=saved(store,account,now).filter(h=>
   !(h.sourceChain===sourceChain&&h.txHash===txHash.toLowerCase()));
  const next=[{sourceChain,txHash:txHash.toLowerCase(),at:now},...previous]
   .slice(0,MAX_SOURCE_HINTS);
  store.setItem(storeKey(account),JSON.stringify(next));
  return true;
 }catch{return false}
}


// Local wallet broadcasts are discovery hints, not an open-transfer ledger.
// Exclude only canonical wallet-owned source transactions and independently
// parent-linked TX3 hashes. Never hide an ambiguous/unlinked transaction
// based on same amount, recency or token alone.
export function unresolvedSourceTxHints({account,items=[],hints=[]}={}){
 if(!ADDRESS.test(account||"")||!Array.isArray(items)||!Array.isArray(hints))return [];
 const owner=account.toLowerCase(),verified=new Set();
 for(const row of items){
  if(row?.confirmed!==true||row.account?.toLowerCase()!==owner)continue;
  if(SOURCE.test(row.sourceChain||"")&&HASH.test(row.txHash||""))
   verified.add(row.sourceChain+":"+row.txHash.toLowerCase());
  if(row.delivered===true&&
     ["awaiting-final-proof","final-delivery-unknown","journey-delivered"].includes(row.status)&&
     HASH.test(row.secondHopTxHash||"")&&HASH.test(row.secondHopMessageId||"")&&
     HASH.test(row.onwardRouteId||""))
   verified.add("xgrchain:"+row.secondHopTxHash.toLowerCase());
 }
 const seen=new Set();
 return hints.filter(h=>{
  if(!h||!SOURCE.test(h.sourceChain||"")||!HASH.test(h.txHash||""))return false;
  const key=h.sourceChain+":"+h.txHash.toLowerCase();
  if(verified.has(key)||seen.has(key))return false;
  seen.add(key);return true;
 }).map(h=>({...h,txHash:h.txHash.toLowerCase()}));
}
