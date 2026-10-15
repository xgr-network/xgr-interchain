// Pending destination deliveries are independent of a new source transfer.
// Never silently switch the primary action to an older wallet operation.
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const OPEN=new Set(["awaiting-proof","delivery-unknown","confirming","pending-source","destination-not-deployed"]);
export function openWalletTransfers(items,account){
 if(!ADDRESS.test(account||"")||!Array.isArray(items))return [];
 return items.filter(item=>item?.account?.toLowerCase()===account.toLowerCase()&&
  OPEN.has(item.status)&&HASH.test(item.txHash||""));
}
export function selectedRecovery(items,account,txHash){
 if(!HASH.test(txHash||""))return null;
 return openWalletTransfers(items,account).find(item=>item.txHash.toLowerCase()===txHash.toLowerCase())||null;
}
