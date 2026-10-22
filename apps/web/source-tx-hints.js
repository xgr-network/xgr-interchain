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
