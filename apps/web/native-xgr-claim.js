// F-09: A verified Mailbox delivery is NOT proof that a native XGR payout
// succeeded. The existing deployed native router keeps a backed beneficiary
// claim; read it on-chain and let the beneficiary authorize withdrawal.
// Browser uses only the catalog-approved read-only RPC proxy; wallet signs only
// on an explicit click. No owner, company key, relayer or Join API is involved.
import {keccak256,selector} from "./keccak.js";
import {publicRead} from "./wallet-transfers.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i, HASH=/^0x[0-9a-f]{64}$/i;
const WORD=/^0x[0-9a-f]{64}$/i;
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export const NATIVE_CLAIM_SELECTOR=selector("pendingNativeXGR(address)");
export const NATIVE_WITHDRAW_SELECTOR=selector("withdrawPendingNativeXGR(address)");
export function configuredNativeXGRClaimRouter(catalog){
 const reps=catalog?.assets?.XGR?.deployment?.representations;
 const entries=Array.isArray(reps)?reps.filter(r=>r.chain==="xgrchain"&&r.component==="nativeRouter"):[];
 if(catalog?.assets?.XGR?.deployment?.present!==true||entries.length!==1||
    !ADDRESS.test(entries[0].address||"")||!HASH.test(entries[0].runtimeCodeKeccak256||"")||
    !/^deployments\/receipts\/xgrchain\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/.test(entries[0].receiptPath||"")||
    catalog?.chains?.xgrchain?.chainId!==1643)return null;
 return {address:entries[0].address.toLowerCase(),
  runtimeHash:entries[0].runtimeCodeKeccak256.toLowerCase()};
}
const addrWord=address=>String(address).slice(2).toLowerCase().padStart(64,"0");
function runtimeHash(code){
 if(!/^0x(?:[0-9a-f]{2})+$/i.test(code||"")||code.length>150000)
  throw Error("Native XGR router code unavailable");
 const hex=code.slice(2);
 const bytes=Uint8Array.from({length:hex.length/2},(_,i)=>parseInt(hex.slice(i*2,i*2+2),16));
 return keccak256(bytes);
}
export async function readNativeXGRClaim({catalog,account,read=publicRead}={}){
 if(!ADDRESS.test(account||""))throw Error("Connect a valid beneficiary wallet");
 const router=configuredNativeXGRClaimRouter(catalog);
 const chain=catalog?.chains?.xgrchain,url=chain?.rpcUrls?.[0];
 if(!router||typeof url!=="string"||!url.startsWith("https://"))
  throw Error("Verified native XGR claim router unavailable");
 const chainId=await read(url,"eth_chainId",[]);
 if(typeof chainId!=="string"||!/^0x[0-9a-f]+$/i.test(chainId)||
    BigInt(chainId)!==1643n)throw Error("Native claim RPC chain mismatch");
 const code=await read(url,"eth_getCode",[router.address,"latest"]);
 if(!eq(runtimeHash(code),router.runtimeHash))
  throw Error("Native claim router runtime is not verified");
 const value=await read(url,"eth_call",[{to:router.address,
  data:NATIVE_CLAIM_SELECTOR+addrWord(account)},"latest"]);
 if(!WORD.test(value||""))throw Error("Native claim balance is not authoritative");
 const amountWei=BigInt(value);
 return {account:account.toLowerCase(),router:router.address,
  amountWei:amountWei.toString(),status:amountWei>0n?"pending":"none"};
}
export async function submitNativeXGRClaim({catalog,account,wallet,read=publicRead}={}){
 if(!wallet||typeof wallet.request!=="function")throw Error("Connected EVM wallet unavailable");
 const claim=await readNativeXGRClaim({catalog,account,read});
 if(claim.status!=="pending")throw Error("No verified native XGR claim to withdraw");
 const verifyAccount=async()=>{
  const accounts=await wallet.request({method:"eth_accounts",params:[]});
  if(!Array.isArray(accounts)||!accounts.some(a=>ADDRESS.test(a)&&eq(a,account)))
   throw Error("The beneficiary wallet must authorize this claim");
 };
 await verifyAccount();
 const id=await wallet.request({method:"eth_chainId",params:[]});
 if(!/^0x[0-9a-f]+$/i.test(id||""))throw Error("Wallet chain identity unavailable");
 if(BigInt(id)!==1643n){
  // Network selection is user-mediated, never an automatic transfer stage.
  await wallet.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x66b"}]});
  const now=await wallet.request({method:"eth_chainId",params:[]});
  if(!/^0x[0-9a-f]+$/i.test(now||"")||BigInt(now)!==1643n)
   throw Error("Wallet did not switch to XGRChain");
  await verifyAccount();
 }
 const calldata=NATIVE_WITHDRAW_SELECTOR+addrWord(account);
 // Contract-held beneficiaries may need their smart wallet's own execution
 // interface. An EOA must not attempt to impersonate a smart contract account.
 let hash;
 try{
  hash=await wallet.request({method:"eth_sendTransaction",params:[{
   from:account,to:claim.router,data:calldata,value:"0x0"
  }]});
 }catch(error){
  throw Error("Native XGR claim submission was rejected or its broadcast outcome is uncertain. Check wallet transaction history before retrying.");
 }
 if(!HASH.test(hash||""))
  throw Error("Native claim transaction outcome uncertain. Check wallet history before retrying.");
 return {status:"submitted",txHash:hash.toLowerCase(),amountWei:claim.amountWei};
}
