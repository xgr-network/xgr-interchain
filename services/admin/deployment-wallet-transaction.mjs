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
// MetaMask may choose a fresh nonce while signing a prepared transaction if
// its own pending nonce is ahead of the public RPC used at prepare time.
// The EIP-1193-returned tx HASH is the identity; a wallet-assigned nonce is
// valid provided the actual signed sender, calldata, target, value and chain
// all match. Nonce remains mandatory when recovering an UNKNOWN hash via a
// historical block, because there the nonce itself identifies the candidate.
// The operator's Base wallet uses a smart-wallet executor for eth_sendTransaction.
 // This fixed, observed executor forwards a server-approved target/calldata via
 // an envelope. Full Factory events and runtime proofs are still mandatory
 // in chain/asset reconciliation; this check alone never publishes a receipt.
const BASE_WALLET_EXECUTOR="0xdb9b1e94b5b69df7e401ddbede43491141047db3";
export function matchesWalletExecutorEnvelope(entry,tx){
 const t=entry?.transaction,raw=(tx?.input??tx?.data);
 if(entry?.chainId!==8453||!same(tx?.to,BASE_WALLET_EXECUTOR)||
    typeof raw!=="string"||!/^0x[0-9a-f]+$/i.test(raw)||
    !raw.toLowerCase().startsWith("0xcef6d209")||
    !/^0x[0-9a-f]{40}$/i.test(t?.to||"")||
    typeof t?.data!=="string"||!/^0x[0-9a-f]+$/i.test(t.data)||
    t.data.length<10)return false;
 // A smart-wallet envelope must include the exact intended target and
 // calldata as nested bytes, not merely its function selector.
 const input=raw.toLowerCase(),calldata=t.data.slice(2).toLowerCase();
 return input.includes(t.to.slice(2).toLowerCase())&&
    input.includes(calldata)&&
    BigInt(tx.value??"-1")===BigInt(t.value);
}
export function compareCommittedWalletTransaction(entry,tx,{strictNonce=false}={}){
 const mismatched=[];
 if(!entry?.transaction||!tx)return {matched:false,mismatched:["transaction"],nonceChanged:false};
 const expected=entry.transaction;
 if(!same(tx.from,entry.wallet)||!same(tx.from,expected.from))mismatched.push("sender");
 const enveloped=matchesWalletExecutorEnvelope(entry,tx);
 if(!enveloped&&!same(tx.input??tx.data,expected.data))mismatched.push("calldata");
 if(!enveloped&&(expected.to===null?tx.to!==null:!same(tx.to,expected.to)))mismatched.push("destination");
 if(tx.hash!=null&&entry.txHash!=null&&!same(tx.hash,entry.txHash))
  mismatched.push("hash");
 const numeric=(actual,value,label)=>{
  try{if(BigInt(actual)!==BigInt(value))mismatched.push(label)}
  catch{mismatched.push(label)}
 };
 numeric(tx.value,expected.value,"value");
 if(tx.chainId!=null)numeric(tx.chainId,entry.chainId,"chainId");
 let nonceChanged=false;
 try{nonceChanged=BigInt(tx.nonce)!==BigInt(expected.nonce)}
 catch{mismatched.push("nonce")}
 if(strictNonce&&nonceChanged)mismatched.push("nonce");
 return {matched:mismatched.length===0,mismatched,nonceChanged,
  observedNonce:typeof tx.nonce==="string"?tx.nonce:null};
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
   return {pending:true,reason:"transaction-not-visible",txHash:entry.txHash};
  }
 }
 if(!tx)return {pending:true,reason:"transaction-not-visible",txHash:entry.txHash};
 const proof=compareCommittedWalletTransaction(entry,tx);
 if(!proof.matched)
  throw Error("On-chain wallet transaction differs from prepared request ("+
   proof.mismatched.join(", ")+"); no automatic rebroadcast");
 // The wallet-returned hash, not a speculative prepare-time nonce, now drives
 // receipt/runtime/immutable verification; no extra paid transaction is sent.
 return {pending:false,tx,txHash:entry.txHash,
  nonceChanged:proof.nonceChanged,observedNonce:proof.observedNonce};
}
