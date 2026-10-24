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

export function blocksUnverifiedSourceRepeat(selectedTxHash,verifiedRecord){
 // A source hash in a resume URL is NEVER permission to start a fresh burn.
 // Unknown and already completed resume intents must fail closed.
 return HASH.test(selectedTxHash||"")&&!verifiedRecord;
}
