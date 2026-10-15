// Secure fallback for injected wallets that return null/nonstandard account nonces.
import {publicRead} from "./wallet-transfers.js";
const HEX=/^0x[0-9a-f]{1,64}$/i;
const DECIMAL=/^(?:0|[1-9][0-9]{0,19})$/;
const ACCOUNT=/^0x[0-9a-f]{40}$/i;
const MAX_NONCE=2n**64n-1n;
// Some EIP-1193 providers return padded hex, decimal text or a safe integer.
// Normalize unequivocal uint64 values; do not guess at null or malformed data.
const quantity=v=>{
 let n;
 if(typeof v==="bigint")n=v;
 else if(typeof v==="number"&&Number.isSafeInteger(v)&&v>=0)n=BigInt(v);
 else if(typeof v==="string"&&(HEX.test(v)||DECIMAL.test(v)))n=BigInt(v);
 else return null;
 return n>=0n&&n<=MAX_NONCE?n:null;
};
export async function ensureNoPendingWalletTransaction({provider,account,chain,fetcher=globalThis.fetch}={}){
 if(!ACCOUNT.test(account||"")||!Number.isSafeInteger(chain?.chainId)||typeof provider?.request!=="function")
  throw Error("Wallet nonce check unavailable; no transaction sent.");
 const responses=await Promise.allSettled(["latest","pending"].map(block=>
  provider.request({method:"eth_getTransactionCount",params:[account,block]})));
 const walletLatest=responses[0].status==="fulfilled"?quantity(responses[0].value):null;
 const walletPending=responses[1].status==="fulfilled"?quantity(responses[1].value):null;
 if(walletLatest!==null&&walletPending!==null){
  if(walletPending>walletLatest)
   throw Error("A wallet transaction is pending. Wait for its receipt before another transfer.");
  if(walletPending===walletLatest)return {source:"wallet",nonce:walletLatest};
  // pending < latest can be caused by a stale injected wallet/RPC cache.
 }
 const url=chain.rpcUrls?.[0];
 if(typeof url!=="string"||!url.startsWith("https://"))
  throw Error("Nonce verification unavailable: source RPC missing. No transaction sent.");
 let chainId,latest,pending;
 try{
  [chainId,latest,pending]=await Promise.all([
   publicRead(url,"eth_chainId",[],fetcher),
   publicRead(url,"eth_getTransactionCount",[account,"latest"],fetcher),
   publicRead(url,"eth_getTransactionCount",[account,"pending"],fetcher)
  ]);
 }catch{
  throw Error("Nonce verification failed: wallet returned invalid/stale data and the chain RPC did not respond. No transaction sent.");
 }
 if(quantity(chainId)===null||BigInt(chainId)!==BigInt(chain.chainId))
  throw Error("Nonce verification failed: source RPC chain ID mismatch. No transaction sent.");
 const confirmed=quantity(latest),queued=quantity(pending);
 if(confirmed===null||queued===null)
  throw Error("Nonce verification failed: source RPC returned invalid nonce data. No transaction sent.");
 if(walletLatest!==null&&walletLatest!==confirmed)
  throw Error("Nonce verification failed: wallet and source RPC disagree on confirmed nonce. No transaction sent.");
 if(walletPending!==null&&walletPending>confirmed)
  throw Error("A wallet transaction is pending. Wait for its receipt before another transfer.");
 if(queued<confirmed)
  throw Error("Nonce verification failed: source RPC pending nonce is behind confirmed state. No transaction sent.");
 if(queued>confirmed)
  throw Error("A source-chain transaction is pending. Wait for its receipt before another transfer.");
 return {source:"verified-source-rpc",nonce:confirmed};
}
