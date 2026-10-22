// The only identity used by a transfer status dialog is the wallet-owned
// original SOURCE transaction hash explicitly selected on the Transfer page.
// Never infer the current transfer from a previously opened modal, recent
// transaction, token, route, or a hash-only unverified URL.
const HASH=/^0x[0-9a-f]{64}$/i;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const normal=value=>String(value||"").toLowerCase();
export function findWalletTransfer(items,account,sourceTxHash){
 if(!ADDRESS.test(account||"")||!HASH.test(sourceTxHash||"")||!Array.isArray(items))return null;
 return items.find(record=>record?.account&&
  normal(record.account)===normal(account)&&
  normal(record.txHash)===normal(sourceTxHash))||null;
}
export function transferFlowBinding({account,selectedTxHash,items=[],session=null}={}){
 if(!ADDRESS.test(account||"")||!HASH.test(selectedTxHash||""))return null;
 const record=findWalletTransfer(items,account,selectedTxHash);
 // Local session is only a broadcast hint from THIS connected wallet.
 // It allows reopening while the indexer has not caught up. A URL alone is
 // not authoritative and MUST NOT activate any wallet transaction.
 const sameSession=Boolean(session?.journey&&HASH.test(session.sourceTxHash||"")&&
  normal(session.account)===normal(account)&&
  normal(session.sourceTxHash)===normal(selectedTxHash));
 if(!record&&!sameSession)return null;
 const original=session?.journey;
 const origin=record?.sourceChain||original?.origin;
 const asset=record?.asset||original?.asset;
 const compatible= sameSession&&
  (!record||original?.origin===origin&&original?.asset===asset);
 const destination=record?.finalDestinationChain||
  (compatible?original?.destination:null)||record?.destinationChain;
 if(typeof origin!=="string"||!origin||typeof destination!=="string"||
  !destination||typeof asset!=="string"||!asset)return null;
 return {
  account,sourceTxHash:selectedTxHash.toLowerCase(),record,
  journey:{origin,destination,asset},
  sameSession, // previous ephemeral UI stage is relevant only to this hash
  key:normal(account)+":"+normal(selectedTxHash)
 };
}
export function isFlowContinuationAuthorized({account,selectedTxHash,binding}={}){
 return Boolean(binding?.record?.confirmed===true&&
  normal(binding.account)===normal(account)&&
  HASH.test(selectedTxHash||"")&&
  normal(binding.sourceTxHash)===normal(selectedTxHash)&&
  normal(binding.record.txHash)===normal(selectedTxHash)&&
  normal(binding.record.account)===normal(account));
}
