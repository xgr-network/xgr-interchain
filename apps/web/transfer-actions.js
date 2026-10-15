// Stateless, user-paid XITA v3.1.5 wallet calls.
// Confirmed gateway receipt + destination Mailbox.delivered are the ONLY
// transfer state. No browser WAL, localStorage, hidden relayer key or replay.
import {selector} from "./keccak.js";
import {deployedRoutes} from "./route-availability.js";
import {publicRead,findWalletSourceTx} from "./wallet-transfers.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i,QTY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const hex=n=>"0x"+BigInt(n).toString(16);
const word=n=>BigInt(n).toString(16).padStart(64,"0");
const addrWord=a=>a.slice(2).toLowerCase().padStart(64,"0");
const TOKEN_AMOUNT=/^(?:0|[1-9]\d*)(?:\.(\d+))?$/;
export function amountToUnits(text,decimals){
 if(typeof text!=="string"||!TOKEN_AMOUNT.test(text)||text.length>95||
   !Number.isInteger(decimals)||decimals<0||decimals>36)throw Error("Enter a valid token amount");
 const [whole,fraction=""]=text.split(".");
 if(fraction.length>decimals)throw Error("Too many token decimal places");
 const sum=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,"0")||"0");
 if(sum<=0n||sum>=2n**256n)throw Error("Enter a positive token amount");
 return sum;
}
async function request(provider,method,params=[]){
 if(typeof provider?.request!=="function")throw Error("Connect MetaMask");
 return provider.request({method,params});
}
async function rpcChain(provider,chain,{allowSwitch=false}={}){
 let current=await request(provider,"eth_chainId");
 if(!QTY.test(current||""))throw Error("Wallet chain ID unavailable");
 if(BigInt(current)!==BigInt(chain.chainId)){
  if(!allowSwitch)throw Error("Switch MetaMask to "+chain.name+" first");
  await request(provider,"wallet_switchEthereumChain",[{chainId:hex(chain.chainId)}]);
  current=await request(provider,"eth_chainId");
  if(!QTY.test(current||"")||BigInt(current)!==BigInt(chain.chainId))
   throw Error("Wallet did not switch to the selected chain");
 }
}
function requirePair(catalog,asset,source,destination){
 const records=deployedRoutes(catalog).filter(r=>r.asset===asset);
 const found=records.filter(r=>r.source===source&&r.destination===destination);
 const reverse=records.filter(r=>r.source===destination&&r.destination===source);
 if(found.length!==1||reverse.length!==1)throw Error("Both directed routes must be documented");
 if(!catalog?.chains?.[source]||!catalog?.chains?.[destination])throw Error("Chain not configured");
 return found[0];
}
export function quoteCalldata(domain,recipient,amount){
 if(!Number.isSafeInteger(domain)||domain<=0||domain>4294967295||
  !ADDRESS.test(recipient||""))throw Error("Invalid destination domain or recipient");
 return selector("quoteILN(uint32,bytes32,uint256)")+
  word(domain)+addrWord(recipient)+word(amount);
}
export function bridgeCalldata(domain,recipient,amount){
 return selector("bridge(uint32,bytes32,uint256)")+
  word(domain)+addrWord(recipient)+word(amount);
}
function unpackQuote(data){
 if(typeof data!=="string"||!/^0x[0-9a-f]{256}$/i.test(data))
  throw Error("Invalid source Gateway quote");
 const words=Array.from({length:4},(_,i)=>BigInt("0x"+data.slice(2+i*64,66+i*64)));
 if(words[0]===0n||words[2]!==words[0]+words[1])
  throw Error("Source quote fee or total invalid");
 return {validatorFee:words[0],routerNative:words[1],value:words[2],tokenAmount:words[3]};
}
const readAddress=(data)=>{
 if(typeof data!=="string"||!/^0x[0-9a-f]{64}$/i.test(data)||
    BigInt(data)>>160n!==0n)throw Error("Malformed source contract address");
 return "0x"+data.slice(-40).toLowerCase();
};
async function verifyGateway(provider,route,domain){
 const methods=["warpRouter()","warpToken()","routeId()","destinationDomain()"];
 const [router,token,routeId,outDomain]=await Promise.all(methods.map(sig=>
  request(provider,"eth_call",[{to:route.gateway,data:selector(sig)},"latest"])));
 if(!eq(readAddress(router),route.sourceRouter)||
    !eq(routeId,route.routeId)||BigInt(outDomain)!==BigInt(domain)||
    !eq(readAddress(token),route.sourceToken||"0x"+"0".repeat(40)))
  throw Error("On-chain Gateway bindings differ from documented route; no wallet transaction sent");
}
async function sourceGasAffordable(provider,account,price){
 const [nativeBalance,gasPrice]=await Promise.all([
  request(provider,"eth_getBalance",[account,"latest"]),request(provider,"eth_gasPrice")]);
 if(!QTY.test(nativeBalance||"")||!QTY.test(gasPrice||""))
  throw Error("Native source balance or gas price unavailable");
 // Gas estimate is run by the wallet before asking for an actual signature.
 // The wallet remains final authority for gas and effective fee estimates.
 return {balance:BigInt(nativeBalance),gasPrice:BigInt(gasPrice)};
}
function preflightGas(estimated,gasPrice,value,balance){
 if(!QTY.test(estimated||""))throw Error("Cannot estimate transaction gas");
 const required=BigInt(estimated)*gasPrice*13n/10n+BigInt(value);
 if(balance<required)throw Error("Insufficient native gas/value for this transaction");
}
export async function waitForWalletReceipt(provider,hash,{attempts=25,delayMs=3000}={}){
 if(!HASH.test(hash||""))throw Error("Malformed MetaMask transaction hash");
 for(let i=0;i<attempts;i++){
  const receipt=await request(provider,"eth_getTransactionReceipt",[hash]);
  if(receipt){
   if(!eq(receipt.transactionHash,hash)||!["0x0","0x1"].includes(receipt.status))
    throw Error("Malformed wallet transaction receipt");
   return receipt;
  }
  if(i<attempts-1)await new Promise(done=>setTimeout(done,delayMs));
 }
 return null;
}
export async function startTransfer({catalog,account,asset,source,destination,amount,
 provider,onBroadcast}){
 if(!ADDRESS.test(account||""))throw Error("Connect a valid wallet");
 const route=requirePair(catalog,asset,source,destination);
 const src=catalog.chains[source],dst=catalog.chains[destination];
 const decimals=catalog.assets[asset].metadata?.decimals;
 const units=amountToUnits(amount,decimals);
 if(source!=="xgrchain"&&destination!=="xgrchain")
  throw Error("Two-hop transfers must be completed one hop at a time");
 // Source gas plus destination gas must exist before locking/burning.
 const destinationBalance=await publicRead(dst.rpcUrls?.[0],"eth_getBalance",[account,"latest"]);
 if(!QTY.test(destinationBalance||"")||BigInt(destinationBalance)===0n)
  throw Error("Destination wallet needs native gas BEFORE locking tokens");
 await rpcChain(provider,src,{allowSwitch:true});
 await verifyGateway(provider,route,dst.domainId);
 const quoteData=await request(provider,"eth_call",[{to:route.gateway,
  from:account,data:quoteCalldata(dst.domainId,account,units)},"latest"]);
 const quote=unpackQuote(quoteData);
 if(route.sourceToken){
  if(quote.tokenAmount!==units)throw Error("Unexpected ERC-20 token debit");
  const balance=await request(provider,"eth_call",[{to:route.sourceToken,
   data:selector("balanceOf(address)")+addrWord(account)},"latest"]);
  if(BigInt(balance)<units)throw Error("Insufficient source token balance");
  const allowance=await request(provider,"eth_call",[{to:route.sourceToken,
   data:selector("allowance(address,address)")+addrWord(account)+addrWord(route.gateway)},"latest"]);
  if(BigInt(allowance)<units){
   const approve={from:account,to:route.sourceToken,value:"0x0",
    data:selector("approve(address,uint256)")+addrWord(route.gateway)+word(units)};
   const gas=await request(provider,"eth_estimateGas",[approve]);
   const cash=await sourceGasAffordable(provider,account);
   preflightGas(gas,cash.gasPrice,0n,cash.balance);
   const approvalHash=await request(provider,"eth_sendTransaction",[approve]);
   const approvalReceipt=await waitForWalletReceipt(provider,approvalHash);
   if(!approvalReceipt)throw Error("Token approval pending. Wait before starting transfer again");
   if(approvalReceipt.status!=="0x1")throw Error("Token approval failed. No tokens were bridged");
   const confirmed=await request(provider,"eth_call",[{to:route.sourceToken,
    data:selector("allowance(address,address)")+addrWord(account)+addrWord(route.gateway)},"latest"]);
   if(BigInt(confirmed)<units)throw Error("Confirmed approval is insufficient for transfer");
  }
 }else if(quote.tokenAmount!==0n)throw Error("Native transfer unexpectedly requires ERC-20 approval");
 const tx={from:account,to:route.gateway,data:bridgeCalldata(dst.domainId,account,units),
  value:hex(quote.value)};
 const estimate=await request(provider,"eth_estimateGas",[tx]);
 const cash=await sourceGasAffordable(provider,account);
 preflightGas(estimate,cash.gasPrice,quote.value,cash.balance);
 const txHash=await request(provider,"eth_sendTransaction",[tx]);
 if(!HASH.test(txHash||""))throw Error("Wallet did not return a transaction hash");
 onBroadcast?.({txHash,sourceChain:source,routeName:route.name});
 return {txHash,sourceChain:source,routeName:route.name,feeWei:String(quote.validatorFee)};
}
export async function resumeDelivery({catalog,account,record,provider,
 fetcher=globalThis.fetch,onBroadcast}){
 if(!ADDRESS.test(account||"")||!record||!eq(record.account,account)||
  !HASH.test(record.txHash||"")||!HASH.test(record.messageId||""))
  throw Error("No wallet-owned confirmed transfer to continue");
 const current=await findWalletSourceTx({catalog,account,sourceChain:record.sourceChain,
  txHash:record.txHash,fetcher});
 if(current.status==="delivered")return {status:"delivered"};
 if(current.status!=="awaiting-proof")
  throw Error("Source confirmation or destination availability is unclear; do not sign");
 if(!eq(current.messageId,record.messageId)||!current.routeName)
  throw Error("Unverified original transfer");
 const query=new URLSearchParams({route:current.routeName,messageId:current.messageId});
 const response=await fetcher("/api/xeta/v1/transfer/recovery?"+query,{credentials:"omit",
  cache:"no-store",headers:{accept:"application/json"}});
 const proof=await response.json().catch(()=>null);
 if(!response.ok||!proof?.ok)throw Error("Proof service unavailable; source transfer remains safe");
 if(proof.status==="ALREADY_DELIVERED")return {status:"delivered"};
 if(proof.status!=="READY_UNSIGNED_CALL")
  return {status:"waiting",notice:"Validator proof is not ready yet. You can safely try again."};
 const route=requirePair(catalog,current.asset,current.sourceChain,current.destinationChain),
   dst=catalog.chains[current.destinationChain],
   mailbox=catalog.infrastructure[current.destinationChain]?.xitaV315?.components?.mailbox?.address;
 if(!eq(proof.messageId,current.messageId)||!eq(proof.destinationMailbox,mailbox)||
  !eq(proof.destinationMailbox,route.destinationMailbox??mailbox)||
  !ADDRESS.test(mailbox||"")||
  BigInt(proof.destinationChainId??0)!==BigInt(dst.chainId)||
  typeof proof.data!=="string"||!/^0x[0-9a-f]{8}(?:[0-9a-f]{2})+$/i.test(proof.data)||
  !proof.data.toLowerCase().startsWith(selector("process(bytes,bytes)").toLowerCase())||
  proof.value!=="0x0")throw Error("Source-bound destination proof mismatch");
 await rpcChain(provider,dst,{allowSwitch:true});
 // Recheck replay state immediately before signing, never trust an HTTP status.
 const delivered=await request(provider,"eth_call",[{to:mailbox,
  data:selector("delivered(bytes32)")+current.messageId.slice(2)},"latest"]);
 if(BigInt(delivered)!==0n)return {status:"delivered"};
 const tx={from:account,to:mailbox,data:proof.data,value:"0x0"};
 await request(provider,"eth_call",[tx,"latest"]); // Full BLS/Merkle/ISM simulation.
 const gas=await request(provider,"eth_estimateGas",[tx]);
 const cash=await sourceGasAffordable(provider,account);
 preflightGas(gas,cash.gasPrice,0n,cash.balance);
 const txHash=await request(provider,"eth_sendTransaction",[tx]);
 if(!HASH.test(txHash||""))throw Error("No destination transaction hash returned");
 onBroadcast?.({txHash,sourceChain:current.sourceChain});
 const receipt=await waitForWalletReceipt(provider,txHash);
 if(!receipt)return {status:"pending",txHash};
 if(receipt.status!=="0x1")return {status:"failed",txHash};
 const after=await findWalletSourceTx({catalog,account,sourceChain:record.sourceChain,
  txHash:record.txHash,fetcher});
 return {status:after.status==="delivered"?"delivered":"pending",txHash};
}
