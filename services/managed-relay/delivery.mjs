// Permissionless destination gas execution with a persisted signed-tx
// journal BEFORE any broadcast. A crash must not create a second nonce.
import {keccak256} from "ethers";
const HASH=/^0x[0-9a-f]{64}$/i,RAW=/^0x(?:[0-9a-f]{2})+$/i;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
export async function deliverManagedMessage(entry,{
 destinationChainId,destinationMailbox,getDelivered,getProof,signTransaction,
 broadcastRaw,getPreviousTx,persist
}){
 if(!HASH.test(entry?.messageId||"")||!HASH.test(entry?.sourceTxHash||"")||
   !Number.isSafeInteger(destinationChainId)||destinationChainId<1||
   !/^0x[0-9a-f]{40}$/i.test(destinationMailbox||""))
  throw Error("Invalid managed delivery binding");
 // True on-chain mailbox state is always preferred over this operator's
 // recorded transaction. Another relayer may already have delivered it.
 const delivered=await getDelivered(entry.messageId);
 if(delivered===true){
  const next={...entry,delivered:true,status:"DELIVERED"};
  await persist(next);
  return next;
 }
 if(delivered!==false)throw Error("Destination Mailbox status unavailable");
 if(entry.destinationTxHash){
  if(!HASH.test(entry.destinationTxHash)||!RAW.test(entry.signedRawTransaction||"")||
    !same(keccak256(entry.signedRawTransaction),entry.destinationTxHash))
   throw Error("Invalid persisted signed transaction");
  const prior=await getPreviousTx(entry.destinationTxHash);
  if(prior==="confirmed"){
   // A mined tx is not equivalent to delivered=true (may have reverted).
   const next={...entry,status:"WAITING_FINALIZED_DESTINATION"};
   await persist(next);return next;
  }
  if(prior==="failed"){
   const next={...entry,status:"DESTINATION_REVERTED_MANUAL_REVIEW"};
   await persist(next);return next;
  }
  if(prior==="pending")return {...entry,status:"DESTINATION_TX_PENDING"};
  if(prior!=="absent")throw Error("Destination previous tx status unavailable");
  // Re-submit only the SAME signed raw transaction. No new nonce/gas price.
  await broadcastRaw(entry.signedRawTransaction);
  const next={...entry,status:"BROADCAST_EXISTING_TRANSACTION"};
  await persist(next);
  return next;
 }
 const proof=await getProof(entry);
 if(proof?.status!=="READY_UNSIGNED_CALL"){
  if(!["PENDING","FRESH_QUORUM_REQUIRED","ALREADY_DELIVERED"].includes(proof?.status))
   throw Error("Unknown unsigned proof state");
  if(proof.status==="ALREADY_DELIVERED")throw Error("Destination state raced, recheck delivered");
  return {...entry,status:"WAITING_VALIDATOR_PROOF"};
 }
 if(!same(proof.messageId,entry.messageId)||
   !same(proof.destinationMailbox,destinationMailbox)||
   Number(proof.destinationChainId)!==destinationChainId||
   proof.value!=="0x0"||
   !/^0x[0-9a-f]{10,}$/i.test(proof.data||""))
  throw Error("Unsigned proof does not match approved destination");
 const tx=await signTransaction(proof);
 if(!RAW.test(tx?.raw||"")||!HASH.test(tx?.hash||"")||
   !same(keccak256(tx.raw),tx.hash))throw Error("Invalid relayer signed destination tx");
 const staged={...entry,destinationTxHash:tx.hash.toLowerCase(),
  signedRawTransaction:tx.raw,status:"SIGNED_PENDING_BROADCAST"};
 await persist(staged); // Durable write-ahead journal BEFORE sending.
 await broadcastRaw(tx.raw);
 const broadcast={...staged,status:"BROADCAST_DESTINATION"};
 await persist(broadcast);
 return broadcast;
}
