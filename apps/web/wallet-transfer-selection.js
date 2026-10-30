import {walletJourneys} from "./verified-journey.js";
// Pending destination deliveries are independent of a new source transfer.
// Never silently switch the primary action to an older wallet operation.
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const OPEN=new Set(["awaiting-proof","awaiting-onward","awaiting-final-proof","final-delivery-unknown","journey-ambiguous","delivery-unknown","confirming","confirming-native-finality","finality-unavailable","pending-source","destination-not-deployed"]);
export function openWalletTransfers(items,account){
 if(!ADDRESS.test(account||"")||!Array.isArray(items))return [];
 return walletJourneys(items).filter(item=>item?.account?.toLowerCase()===account.toLowerCase()&&
  OPEN.has(item.status)&&HASH.test(item.txHash||""));
}
export function selectedRecovery(items,account,txHash){
 if(!HASH.test(txHash||""))return null;
 return openWalletTransfers(items,account).find(item=>item.txHash.toLowerCase()===txHash.toLowerCase())||null;
}

// A wallet-owned, independently confirmed delivery is historical activity,
// not an unfinished recovery. Never infer this from a bare resume URL.
export function completedWalletTransfer(items,account,txHash){
 if(!ADDRESS.test(account||"")||!HASH.test(txHash||"")||!Array.isArray(items))return null;
 return items.find(item=>item?.account?.toLowerCase()===account.toLowerCase()&&
  item.txHash?.toLowerCase()===txHash.toLowerCase()&&
  item.confirmed===true&&item.delivered===true&&
  ["delivered","journey-delivered"].includes(item.status))||null;
}

// New-transfer price previews are safe for a completed, verified resume link.
// Unknown, foreign and still-active hashes remain isolated from fresh quotes.
export function canPreviewNewTransfer(items,account,selectedTxHash){
 return !HASH.test(selectedTxHash||"")||
  completedWalletTransfer(items,account,selectedTxHash)!==null;
}

export function blocksUnverifiedSourceRepeat(selectedTxHash,verifiedRecord){
 // A source hash in a resume URL is NEVER permission to start a fresh burn.
 // Unknown and already completed resume intents must fail closed.
 return HASH.test(selectedTxHash||"")&&!verifiedRecord;
}
