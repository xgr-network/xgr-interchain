// Read-only native gas balances for the currently connected EVM account.
// Never request signatures, approvals, transfers, or wallet chain switching.
import {publicRead} from "./wallet-transfers.js";
const ACCOUNT=/^0x[0-9a-f]{40}$/i;
const QUANTITY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const MAX_UINT256=(1n<<256n)-1n;
export function rpcQuantity(value){
 if(typeof value!=="string"||!QUANTITY.test(value))throw Error("Invalid EVM RPC quantity");
 const amount=BigInt(value);
 if(amount<0n||amount>MAX_UINT256)throw Error("RPC quantity exceeds uint256");
 return amount;
}
function endpointFor(chain){
 const value=chain?.rpcUrls?.[0];
 if(typeof value!=="string")throw Error("RPC not configured");
 const url=new URL(value);
 if(url.protocol!=="https:"||url.username||url.password||!url.hostname)
  throw Error("Untrusted network RPC endpoint");
 return url.toString();
}
async function rpcRead(endpoint,method,params,fetcher,signal){
 const result=await publicRead(endpoint,method,params,fetcher,{signal});
 if(typeof result!=="string")throw Error("Invalid public RPC response");
 return result;
}
export async function readNativeGasBalances({account,chains,provider,fetcher=globalThis.fetch,timeoutMs=7000}={}){
 if(!ACCOUNT.test(account||""))throw Error("Connect an authorized wallet address first");
 if(!chains||typeof chains!=="object"||typeof fetcher!=="function"||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<500||timeoutMs>30000)
  throw Error("Invalid wallet gas check configuration");
 let walletChainId=null;
 if(provider?.request){
  try{
   const id=rpcQuantity(await provider.request({method:"eth_chainId"}));
   if(id<=BigInt(Number.MAX_SAFE_INTEGER))walletChainId=Number(id);
  }catch{/* Read-only RPC can still work if current wallet chain is unknown. */}
 }
 const requests=Object.entries(chains).filter(([,c])=>Number.isSafeInteger(c?.chainId)&&c.chainId>0).slice(0,24);
 const checked=await Promise.all(requests.map(async ([key,chain])=>{
  let result;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   let wei=null,source="public-rpc";
   if(chain.chainId===walletChainId&&provider?.request){
    try{
     wei=rpcQuantity(await provider.request({method:"eth_getBalance",params:[account,"latest"]}));
     source="wallet";
    }catch{/* Fall back to the configured validated public RPC. */}
   }
   if(wei===null){
    const endpoint=endpointFor(chain);
    const chainId=rpcQuantity(await rpcRead(endpoint,"eth_chainId",[],fetcher,controller.signal));
    if(chainId!==BigInt(chain.chainId))throw Error("RPC chain mismatch");
    wei=rpcQuantity(await rpcRead(endpoint,"eth_getBalance",[account,"latest"],fetcher,controller.signal));
   }
   result={status:"ready",balanceWei:wei.toString(),source};
  }catch{result={status:"unavailable"}}
  finally{clearTimeout(timeout)}
  return [key,result];
 }));
 return {account,walletChainId,balances:Object.fromEntries(checked),checkedAt:new Date().toISOString()};
}
