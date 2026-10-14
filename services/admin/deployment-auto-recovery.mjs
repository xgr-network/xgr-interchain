import {selector} from "../../apps/web/keccak.mjs";
import {compareCommittedWalletTransaction} from "./deployment-wallet-transaction.mjs";
// Read-only classification for interrupted EIP-1193 transactions.
// Missing receipts are NOT proof of failure. We first inspect the original
// wallet nonce and, where available, reconstruct the transaction from the
// source-chain's mined/pending blocks. The operator (not this module)
// decides whether to reconcile the original hash or retire an old journal.
const TX=/^0x[0-9a-f]{64}$/i;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HEX=/^0x[0-9a-f]+$/i;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
function uint(value){
 if(typeof value!=="string"||!(HEX.test(value)||/^[0-9]+$/.test(value)))
  throw Error("Invalid chain nonce/receipt value");
 return BigInt(value);
}
export function matchesWalletIntent(entry,tx,{allowWalletNonceDrift=false}={}){
 if(!entry||!tx)return false;
 try{
  const p=entry.transaction;
  return same(tx.from,entry.wallet)&&
   same(tx.input??tx.data,p.data)&&
   (allowWalletNonceDrift||uint(tx.nonce)===uint(p.nonce))&&uint(tx.value)===uint(p.value)&&
   (p.to===null?tx.to===null:same(tx.to,p.to))&&
   (tx.chainId==null||uint(tx.chainId)===BigInt(entry.chainId))&&
   TX.test(tx.hash||"");
 }catch{return false}
}
async function lookupMinedNonce(rpc,url,entry,head){
 // Standard JSON-RPC: find the first block in which this account's mined
 // nonce exceeds the original nonce, then inspect actual signed tx data.
 // Some RPC providers do not retain historical nonce state. In that case
 // this is best effort, not a blocker for the next MetaMask-confirmed try.
 // The approved Factory has exactly one SourceRegistry: it does not
 // create duplicates. Its live registry() determines whether a new wallet
 // attempt is needed; old WAL nonce/hash metadata cannot block forever.
 if(entry.id===chain.name+":sourceRegistry"&&entry.stage!=="confirmed"&&
    ADDRESS.test(entry.transaction.to||"")&&
    chain.sourceRegistryFactory?.address&&
    same(entry.transaction.to,chain.sourceRegistryFactory.address)&&
    same(entry.transaction.data,selector("deployRegistry()"))&&
    uint(entry.transaction.value)===0n){
  let raw;
  try{raw=await rpc(url,"eth_call",[
   {to:entry.transaction.to,data:selector("registry()")},"latest"]);}
  catch{return {action:"pending",reason:"factory-registry-rpc-unavailable"};}
  if(!/^0x[0-9a-f]{64}$/i.test(raw||""))
   return {action:"pending",reason:"factory-registry-invalid-rpc-result"};
  const registry="0x"+BigInt(raw).toString(16).padStart(40,"0");
  if(BigInt(raw)===0n)
   return {action:"retry",reason:"source-registry-factory-empty",
    warning:"On-chain Factory.registry() is empty. The old journal entry is archived; a new MetaMask-confirmed deployRegistry() call is permitted. A concurrent previous transaction may still consume gas."};
  // A registry exists already. Recover its actual Factory event/transaction
  // to publish the canonical, immutable GitHub receipt, not a guessed address.
  const factoryBlock=chain.sourceRegistryFactory.blockNumber;
  if(!Number.isSafeInteger(factoryBlock)||factoryBlock<1)
   return {action:"pending",reason:"factory-creation-block-unavailable"};
  const eventTopic=(await import("../../apps/web/keccak.mjs")).keccak256("RegistryDeployed(address)");
  const addrTopic="0x"+"0".repeat(24)+registry.slice(2);
  let candidates=[],head;
  try{head=uint(await rpc(url,"eth_blockNumber",[]));}
  catch{return {action:"pending",reason:"registry-event-head-unavailable"};}
  for(let from=BigInt(factoryBlock);from<=head;from+=1800n){
   const to=from+1799n>head?head:from+1799n;
   let logs;
   try{logs=await rpc(url,"eth_getLogs",[{address:entry.transaction.to,
    fromBlock:"0x"+from.toString(16),toBlock:"0x"+to.toString(16),
    topics:[eventTopic,addrTopic]}]);}
   catch{return {action:"pending",reason:"registry-event-query-unavailable"};}
   if(!Array.isArray(logs))return {action:"pending",reason:"registry-event-query-invalid"};
   candidates.push(...logs.filter(log=>log?.removed!==true&&
    same(log.address,entry.transaction.to)&&
    Array.isArray(log.topics)&&log.topics.length===2&&
    same(log.topics[0],eventTopic)&&same(log.topics[1],addrTopic)&&
    TX.test(log.transactionHash||"")));
   if(candidates.length>1)return {action:"pending",reason:"registry-events-ambiguous"};
  }
  if(candidates.length!==1)return {action:"pending",reason:"registry-event-not-found"};
  const log=candidates[0],hash=log.transactionHash.toLowerCase();
  let tx,receipt;
  try{[tx,receipt]=await Promise.all([
   rpc(url,"eth_getTransactionByHash",[hash]),
   rpc(url,"eth_getTransactionReceipt",[hash])]);}
  catch{return {action:"pending",reason:"registry-creation-receipt-unavailable"};}
  if(!receipt||!tx||!same(receipt.transactionHash,hash)||
     !same(receipt.from,entry.wallet)||!same(receipt.to,entry.transaction.to)||
     uint(receipt.status)!==1n||!same(receipt.blockHash,log.blockHash)||
     !same(receipt.blockNumber,log.blockNumber))
   return {action:"pending",reason:"registry-creation-receipt-mismatch"};
  const verified=compareCommittedWalletTransaction({...entry,txHash:hash},tx);
  if(!verified.matched||!Array.isArray(receipt.logs)||!receipt.logs.some(x=>
   same(x.address,entry.transaction.to)&&Array.isArray(x.topics)&&
   same(x.topics[0],eventTopic)&&same(x.topics[1],addrTopic)))
   return {action:"pending",reason:"registry-creation-transaction-mismatch"};
  return {action:"reconcile",txHash:hash,reason:"recovered-from-factory-event"};
 }
 const wanted=uint(entry.transaction.nonce);
 let low=0n,high=head;
 try{
  for(let i=0;low<high&&i<40;i++){
   const mid=(low+high)/2n;
   const used=uint(await rpc(url,"eth_getTransactionCount",[
    entry.wallet,"0x"+mid.toString(16)]));
   if(used>wanted)high=mid;
   else low=mid+1n;
  }
  if(low!==high)return null;
  const block=await rpc(url,"eth_getBlockByNumber",[
   "0x"+low.toString(16),true]);
  return block?.transactions?.find(tx=>tx&&typeof tx==="object"&&
   same(tx.from,entry.wallet)&&uint(tx.nonce)===wanted)||null;
 }catch{return null}
}
async function lookupPendingNonce(rpc,url,entry){
 try{
  const block=await rpc(url,"eth_getBlockByNumber",["pending",true]);
  return block?.transactions?.find(tx=>tx&&typeof tx==="object"&&
   same(tx.from,entry.wallet)&&uint(tx.nonce)===uint(entry.transaction.nonce))||null;
 }catch{return null}
}
export async function classifyInterruptedDeployment({entry,chain,rpc}){
 if(!entry||!chain||!ADDRESS.test(entry.wallet||"")||
    !["prepared","submitted","confirmed"].includes(entry.stage)||
    typeof rpc!=="function"||!HEX.test(entry.transaction?.nonce||""))
  throw Error("Invalid interrupted wallet deployment");
 const url=chain.rpcUrls?.[0];
 if(!/^https:\/\//.test(url||"")||chain.chainId!==entry.chainId)
  throw Error("Unapproved interrupted deployment chain");
 const chainId=uint(await rpc(url,"eth_chainId",[]));
 if(chainId!==BigInt(entry.chainId))throw Error("Recovery RPC chain ID mismatch");
 const wanted=uint(entry.transaction.nonce);
 const [latestRaw,pendingRaw]=await Promise.all([
  rpc(url,"eth_getTransactionCount",[entry.wallet,"latest"]),
  rpc(url,"eth_getTransactionCount",[entry.wallet,"pending"])
 ]);
 const latest=uint(latestRaw),pending=uint(pendingRaw);
 if(pending<latest)throw Error("Inconsistent deployment wallet nonce from RPC");
 if(entry.stage==="confirmed")
  return {action:"reconcile",reason:"previously-confirmed"};
 if(entry.txHash){
  if(!TX.test(entry.txHash))throw Error("Malformed saved wallet hash");
  let receipt=null,transaction=null;
  try{
   [receipt,transaction]=await Promise.all([
    rpc(url,"eth_getTransactionReceipt",[entry.txHash]),
    rpc(url,"eth_getTransactionByHash",[entry.txHash])
   ]);
  }catch{
   // No reliable RPC state: never treat a timeout as an absent transaction.
   return {action:"pending",reason:"rpc-temporarily-unavailable"};
  }
  if(transaction){
   // Compare an EXACT wallet-returned hash with the same checker used later
   // by reconcile. Only historical nonce-based searches require strict nonce.
   const proof=compareCommittedWalletTransaction(entry,transaction);
   if(!proof.matched){
    const factory=entry.transaction.to;
    const isRegistry=entry.id===chain.name+":sourceRegistry"&&
     ADDRESS.test(factory||"")&&
     same(entry.transaction.data,selector("deployRegistry()"))&&
     uint(entry.transaction.value)===0n;
    if(!isRegistry)
     throw Error("Saved wallet transaction differs from the approved deployment ("+
      proof.mismatched.join(", ")+"); no automatic rebroadcast");
    if(!receipt)
     return {action:"pending",reason:"source-registry-hash-mismatch-awaiting-receipt"};
    // SourceRegistry deployment is idempotent at its already approved Factory.
    // Only an on-chain zero registry plus a FINALIZED unrelated mined hash
    // may retire the stale WAL record for a new, explicit MetaMask attempt.
    let current;
    try{current=await rpc(url,"eth_call",[
     {to:factory,data:selector("registry()")},"latest"]);
    }catch{return {action:"pending",reason:"source-registry-state-unavailable"};}
    if(!/^0x[0-9a-f]{64}$/i.test(current||""))
     return {action:"pending",reason:"source-registry-state-invalid"};
    if(BigInt(current)!==0n)
     return {action:"pending",reason:"source-registry-already-exists-unattributed"};
    if(uint(receipt.status)===1n)
     return {action:"retry",reason:"source-registry-unrelated-saved-hash",
      warning:"The saved MetaMask hash belongs to another confirmed transaction. The approved Factory has no SourceRegistry; a new deployment requires explicit MetaMask confirmation."};
    if(uint(receipt.status)===0n)
     return {action:"retry",reason:"failed-onchain"};
    throw Error("Invalid on-chain transaction status");
   }
  }
  if(receipt){
   const status=uint(receipt.status);
   if(status===0n)return {action:"retry",reason:"failed-onchain"};
   if(status===1n)return {action:"reconcile",reason:"confirmed-receipt"};
   throw Error("Invalid wallet transaction receipt status");
  }
  if(transaction)return {action:"reconcile",reason:"submitted-transaction"};
 }
 if(latest>wanted){
  const head=uint(await rpc(url,"eth_blockNumber",[]));
  const found=await lookupMinedNonce(rpc,url,entry,head);
  if(found&&matchesWalletIntent(entry,found))
   return {action:"reconcile",txHash:found.hash,reason:"recovered-mined-wallet-nonce"};
  // Original nonce was irrevocably consumed, either by a replacement
  // transaction or by an unfindable old tx. A fresh wallet nonce is now
  // mandatory; a new deploy may consume additional gas or duplicate an
  // undocumented original, and remains an explicit MetaMask approval.
  return {action:"retry",reason:found?"nonce-replaced":"old-nonce-consumed-untraceable",
   warning:found?null:"Original transaction could not be reconstructed; a new deploy may duplicate an undocumented on-chain contract."};
 }
 if(pending>wanted){
  const found=await lookupPendingNonce(rpc,url,entry);
  if(found&&matchesWalletIntent(entry,found))
   return {action:"reconcile",txHash:found.hash,reason:"recovered-pending-wallet-nonce"};
  if(found)return {action:"retry",reason:"pending-nonce-replaced"};
  // The RPC reports a consumed pending nonce but cannot provide the
  // corresponding signed tx for reconstruction. The operator explicitly
  // requested forward progress rather than a permanent recovery gate.
  // A NEW nonce and a NEW MetaMask approval are required. The first tx
  // may still mine, so the UI must show a visible duplicate-cost warning.
  return {action:"retry",reason:"pending-nonce-untraceable",
   warning:"An unknown earlier transaction may still execute. A new MetaMask-confirmed deployment can cause additional gas/reserve costs or an orphaned duplicate contract."};
 }
 if(latest===wanted&&pending===wanted)
  return {action:"retry",reason:"wallet-nonce-unused"};
 return {action:"pending",reason:"nonce-state-not-conclusive"};
}
