// Once the user's EIP-1193 wallet has returned a transaction hash, write it
// immediately to the durable WAL. Do NOT require an independent RPC node to
// have indexed the transaction already. The WAL never authorizes publication.
const TX=/^0x[0-9a-f]{64}$/i;
const same=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
export function persistWalletBroadcastHash({journal,id,txHash}){
 if(!TX.test(txHash||""))throw Error("Invalid wallet-returned transaction hash");
 if(typeof journal?.attachHash!=="function")throw Error("Missing durable deployment journal");
 // No RPC read before the fsync/atomic WAL write; same hash is idempotent.
 // This also applies when the browser supplies the ORIGINAL hash for recovery.
 const saved=journal.attachHash(id,txHash);
 return {...saved,rpcVerification:"pending"};
}
export async function observeCommittedWalletTransaction({rpc,url,entry}){
 if(typeof rpc!=="function"||!TX.test(entry?.txHash||"")||
    !Number.isSafeInteger(entry?.chainId)||!entry?.transaction)
  throw Error("Missing durable submitted transaction identity");
 let tx;
 try{
  tx=await rpc(url,"eth_getTransactionByHash",[entry.txHash]);
 }catch{
  // No proof means no publication. Provider timeouts / rate limits are
  // treated as unresolved, never as a reason to send a second wallet tx.
  return {pending:true,reason:"transaction-rpc-unavailable",txHash:entry.txHash};
 }
 if(!tx){
  // Some RPC nodes retain the mined receipt and full block but no longer
  // index the old transaction hash. Recover from the RECEIPT'S exact block,
  // not from a guessed contract address or a fresh wallet broadcast.
  try{
   const receipt=await rpc(url,"eth_getTransactionReceipt",[entry.txHash]);
   if(receipt?.blockNumber){
    const block=await rpc(url,"eth_getBlockByNumber",[receipt.blockNumber,true]);
    tx=block?.transactions?.find(t=>t&&typeof t==="object"&&
     same(t.hash,entry.txHash))||null;
   }
  }catch{
   return {pending:true,reason:"transaction-block-unavailable",txHash:entry.txHash};
  }
 }
 if(!tx)return {pending:true,reason:"transaction-not-visible",txHash:entry.txHash};
 const committed=entry.transaction;
 let matches=false;
 try{
  matches=same(tx.from,entry.wallet)&&
   same(tx.input??tx.data,committed.data)&&
   BigInt(tx.nonce)===BigInt(committed.nonce)&&
   BigInt(tx.value)===BigInt(committed.value)&&
   (committed.to===null?tx.to===null:same(tx.to,committed.to))&&
   (tx.hash==null||same(tx.hash,entry.txHash))&&
   (tx.chainId==null||BigInt(tx.chainId)===BigInt(entry.chainId));
 }catch{matches=false}
 if(!matches)
  throw Error("On-chain wallet transaction does not match the durable signed intent; manual review required, never rebroadcast");
 return {pending:false,tx,txHash:entry.txHash};
}
