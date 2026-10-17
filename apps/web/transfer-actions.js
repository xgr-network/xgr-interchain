// Stateless, user-paid XITA v3.1.5 wallet calls.
// Confirmed gateway receipt + destination Mailbox.delivered are the ONLY
// transfer state. No browser WAL, localStorage, hidden relayer key or replay.
import {selector} from "./keccak.js";
import {deployedRoutes} from "./route-availability.js";
import {publicRead,findWalletSourceTx,configuredGatewayRoutes,ONWARD_SELECTOR} from "./wallet-transfers.js";
import {ensureNoPendingWalletTransaction} from "./wallet-nonce.js";
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
export function unitsToAmount(raw,decimals){
 if(typeof raw!=="string"||!/^[1-9][0-9]*$/.test(raw)||
    !Number.isInteger(decimals)||decimals<0||decimals>36)
  throw Error("Invalid verified raw token amount");
 const n=BigInt(raw),scale=10n**BigInt(decimals);
 if(n>=2n**256n)throw Error("Onward token amount overflow");
 const whole=(n/scale).toString();
 const fraction=(n%scale).toString().padStart(decimals,"0").replace(/0+$/,"");
 return fraction?whole+"."+fraction:whole;
}
// Exact ABI for the optional user-signed source-native commercial adapter.
const EXECUTE_SELECTOR=selector("execute((address,address,bytes32,uint32,bytes32,uint32,bytes32,bytes32,uint256,uint256,uint256,uint256,uint64),bytes)");
export function executeQuoteCalldata(q,signature){
 if(!q||!/^0x[0-9a-f]{130}$/i.test(signature||""))
  throw Error("Malformed EIP712 execution quote");
 const address=x=>{
  if(!ADDRESS.test(x||""))throw Error("Invalid execution quote address");
  return addrWord(x);
 };
 const bytes=x=>{
  if(!HASH.test(x||""))throw Error("Invalid execution bytes32");
  return x.slice(2).toLowerCase();
 };
 const terms=[address(q.payer),address(q.gateway),bytes(q.routeId),
  word(q.destinationDomain),bytes(q.recipient),
  word(q.finalDestinationDomain),bytes(q.finalRecipient),bytes(q.onwardRouteId),
  word(q.amount),word(q.bridgeValueWei),word(q.interchainFeeWei),
  word(q.nonce),word(q.issuedAt)];
 if(terms.some(t=>t.length!==64))throw Error("Malformed execution tuple");
 const bytesHex=signature.slice(2).toLowerCase();
 // The 13-word static Quote tuple and one offset word occupy 14*32=448
 // bytes before the dynamic signature length (65) and 96-byte padded data.
 return EXECUTE_SELECTOR+terms.join("")+word(448)+word(65)+
  bytesHex.padEnd(192,"0");
}
function checkInterchainQuote(result,{catalog,account,asset,source,destination,
 route,firstDestination,amountRaw,validatorNativeWei,adapter}){
 const q=result?.quote,t=result?.transaction;
 const finalDomain=catalog?.chains?.[destination]?.domainId;
 const now=Math.floor(Date.now()/1000);
 const intendedOnward=firstDestination===destination?"0x"+"0".repeat(64):
  deployedRoutes(catalog).find(r=>r.asset===asset&&r.source==="xgrchain"&&
   r.destination===destination)?.routeId;
 if(!q||!t||result.status!=="SIGNED_INTERCHAIN_FEE_QUOTE"||
  !/^0x[0-9a-f]{130}$/i.test(result.signature||"")||
  !ADDRESS.test(t.from||"")||!eq(t.from,account)||
  !eq(t.to,adapter)||!eq(result.executionAddress,adapter)||
  BigInt(t.chainId??0)!==BigInt(catalog.chains[source].chainId)||
  !/^0x[0-9a-f]+$/i.test(t.value||"")||
  !/^0x[0-9a-f]+$/i.test(t.data||"")||
  !t.data.startsWith(EXECUTE_SELECTOR)||
  !eq(t.data,executeQuoteCalldata(q,result.signature))||
  !eq(q.payer,account)||!eq(q.gateway,route.gateway)||
  !eq(q.routeId,route.routeId)||!eq(q.onwardRouteId,intendedOnward)||
  !eq(q.recipient,"0x"+addrWord(account))||
  !eq(q.finalRecipient,"0x"+addrWord(account))||
  BigInt(q.destinationDomain??0)!==BigInt(catalog.chains[firstDestination].domainId)||
  BigInt(q.finalDestinationDomain??0)!==BigInt(finalDomain??0)||
  BigInt(q.amount??-1)!==amountRaw||
  BigInt(q.bridgeValueWei??-1)!==validatorNativeWei||
  BigInt(q.interchainFeeWei??0)<=0n||
  BigInt(t.value)!==validatorNativeWei+BigInt(q.interchainFeeWei)||
  !Number.isSafeInteger(q.issuedAt)||q.issuedAt<=0||
  q.issuedAt>now+5||now-q.issuedAt>75||
  Number(result.expiresAt??0)<=now+5)
  throw Error("Commercial fee quote does not bind verified transfer, destination, or native amount");
 return {tx:{from:account,to:adapter,value:t.value,data:t.data},
  interchainFeeWei:String(q.interchainFeeWei)};
}
async function request(provider,method,params=[]){
 if(typeof provider?.request!=="function")throw Error("Connect MetaMask");
 return provider.request({method,params});
}
async function validateWalletAccount(provider,account){
 const accounts=await request(provider,"eth_accounts");
 if(!Array.isArray(accounts)||!accounts.some(x=>eq(x,account)))
  throw Error("Connected wallet changed. Reconnect the original wallet");
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
export function continueJourneyCalldata(parentId,gateway,routeId,domain,recipient,amount){
 if(!HASH.test(parentId||"")||!HASH.test(routeId||"")||
    !ADDRESS.test(gateway||""))throw Error("Invalid linked parent journey");
 return ONWARD_SELECTOR+parentId.slice(2)+addrWord(gateway)+routeId.slice(2)+
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
 provider,onBroadcast,fetcher=globalThis.fetch,commercial=null,
 onwardParentMessageId=null}){
 if(!ADDRESS.test(account||""))throw Error("Connect a valid wallet");
 const firstDestination=source!=="xgrchain"&&destination!=="xgrchain"?
  "xgrchain":destination;
 const route=requirePair(catalog,asset,source,firstDestination);
 const src=catalog.chains[source],dst=catalog.chains[firstDestination];
 const decimals=catalog.assets[asset].metadata?.decimals;
 const units=amountToUnits(amount,decimals);
 const adapter=configuredGatewayRoutes(catalog).find(r=>r.asset===asset&&
  r.sourceChain===source&&r.destinationChain===firstDestination&&
  eq(r.routeId,route.routeId))?.executionAdapter||null;
 const paidAdapter=commercial===false||onwardParentMessageId?null:adapter;
 const onwardAdapter=onwardParentMessageId?adapter:null;
 if(onwardParentMessageId&&(!HASH.test(onwardParentMessageId)||
     source!=="xgrchain"||!onwardAdapter||commercial!==false))
  throw Error("Verified hub continuation adapter required for linked second hop");
 if(commercial===true&&!paidAdapter)
  throw Error("GmbH Interchain Fee adapter is not deployed; use public protocol calls separately");
 if(firstDestination!==destination){
  const onward=deployedRoutes(catalog).filter(r=>r.asset===asset&&
   r.source==="xgrchain"&&r.destination===destination);
  if(onward.length!==1)throw Error("Final onward route not uniquely deployed");
  const hubAdapter=catalog.infrastructure?.xgrchain?.xitaV315?.components?.executionGateway;
  if(!paidAdapter||!hubAdapter?.address)
   throw Error("Two-hop transfer requires both deployed and verified fee/continuation adapters");
 }
 // Require public permissionless recovery proof infrastructure before
 // locking/burning source assets. This is an execution preflight, never a
 // separate administrator activation flag.
 const proofService=await fetcher("/api/xeta/v1/transfer/health",{
  credentials:"omit",cache:"no-store",headers:{accept:"application/json"}
 }).catch(()=>null);
 if(!proofService?.ok)throw Error("Destination recovery infrastructure unavailable; no tokens locked");
 const proofHealth=await proofService.json().catch(()=>null);
 if(!proofHealth?.ok||proofHealth.proofBuilder!=="installed")
  throw Error("Unsigned BLS/Merkle recovery is not ready; no tokens locked");
 // Do not lock a new source if a destination has neither the wallet's
 // own native gas nor a fresh, independently verified sponsor reserve.
 const destinations=[firstDestination,...(firstDestination===destination?[]:[destination])];
 let sponsor=null;
 for(const key of destinations){
  const target=catalog.chains[key];
  const identity=await publicRead(target.rpcUrls?.[0],"eth_chainId",[],fetcher);
  if(!QTY.test(identity||"")||BigInt(identity)!==BigInt(target.chainId))
   throw Error("Destination RPC chain ID differs from configured chain: "+key);
  const [bal,price]=await Promise.all([
   publicRead(target.rpcUrls?.[0],"eth_getBalance",[account,"latest"],fetcher),
   publicRead(target.rpcUrls?.[0],"eth_gasPrice",[],fetcher)
  ]);
  if(!QTY.test(bal||"")||!QTY.test(price||"")||BigInt(price)<=0n)
   throw Error("Invalid destination gas quote or wallet native balance: "+key);
  // A positive one-wei balance is NOT evidence that a Mailbox delivery
  // can be paid. Require the same conservative 1.2m-gas envelope as the
  // commercial estimator, or a current stage-specific sponsor reserve.
  const nativeGasFloor=BigInt(price)*1200000n*13n/10n;
  if(BigInt(bal)<nativeGasFloor){
   if(!paidAdapter)throw Error("Destination wallet needs native gas BEFORE locking tokens");
   if(!sponsor){
    const response=await fetcher("/api/xita/v1/managed/health",{
     cache:"no-store",credentials:"omit",headers:{accept:"application/json"}
    }).catch(()=>null);
    sponsor=response?.ok?await response.json().catch(()=>null):null;
   }
   if(sponsor?.ok!==true||sponsor.sponsorship?.chains?.[key]!==true)
    throw Error("Destination native gas absent and sponsorship not available on "+key);
  }
 }
 await validateWalletAccount(provider,account);
 await rpcChain(provider,src,{allowSwitch:true});
 await ensureNoPendingWalletTransaction({provider,account,chain:src,fetcher});
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
   data:selector("allowance(address,address)")+addrWord(account)+addrWord(paidAdapter||onwardAdapter||route.gateway)},"latest"]);
  if(BigInt(allowance)<units){
   const approve={from:account,to:route.sourceToken,value:"0x0",
    data:selector("approve(address,uint256)")+addrWord(paidAdapter||onwardAdapter||route.gateway)+word(units)};
   const gas=await request(provider,"eth_estimateGas",[approve]);
   const cash=await sourceGasAffordable(provider,account);
   preflightGas(gas,cash.gasPrice,0n,cash.balance);
   await validateWalletAccount(provider,account);
   await rpcChain(provider,src);
   await ensureNoPendingWalletTransaction({provider,account,chain:src,fetcher});
   const approvalHash=await request(provider,"eth_sendTransaction",[approve]);
   const approvalReceipt=await waitForWalletReceipt(provider,approvalHash);
   if(!approvalReceipt)throw Error("Token approval pending. Wait before starting transfer again");
   if(approvalReceipt.status!=="0x1")throw Error("Token approval failed. No tokens were bridged");
   const confirmed=await request(provider,"eth_call",[{to:route.sourceToken,
    data:selector("allowance(address,address)")+addrWord(account)+
     addrWord(paidAdapter||onwardAdapter||route.gateway)},"latest"]);
   if(BigInt(confirmed)<units)throw Error("Confirmed approval is insufficient for transfer");
  }
 }else if(quote.tokenAmount!==0n)throw Error("Native transfer unexpectedly requires ERC-20 approval");
 let tx={from:account,to:route.gateway,data:bridgeCalldata(dst.domainId,account,units),
  value:hex(quote.value)};
 if(onwardAdapter){
  tx={from:account,to:onwardAdapter,value:hex(quote.value),
   data:continueJourneyCalldata(onwardParentMessageId,route.gateway,route.routeId,
    dst.domainId,account,units)};
 }
 let interchainFeeWei=null;
 if(paidAdapter){
  // Request a fresh EIP-712 fee quote AFTER any slow ERC-20 approval.
  // The source lock and Interchain Fee are atomic in this ONE wallet TX.
  const quoteRequest={asset,source,destination,amountRaw:units.toString(),
   payer:account,recipient:account};
  const response=await fetcher("/api/xita/v1/managed/quote",{
   method:"POST",credentials:"omit",cache:"no-store",
   headers:{"content-type":"application/json",accept:"application/json"},
   body:JSON.stringify(quoteRequest)
  });
  if(!response?.ok)throw Error("Interchain Fee quote unavailable; no bridge was submitted");
  const result=await response.json();
  const validated=checkInterchainQuote(result,{catalog,account,asset,source,
   destination,route,firstDestination,amountRaw:units,
   validatorNativeWei:quote.value,adapter:paidAdapter});
  tx=validated.tx;interchainFeeWei=validated.interchainFeeWei;
 }
 // Simulate source-native payment and all adapter/internal Gateway calls
 // after required allowance changes but before requesting wallet signature.
 await request(provider,"eth_call",[tx,"latest"]);
 const estimate=await request(provider,"eth_estimateGas",[tx]);
 const cash=await sourceGasAffordable(provider,account);
 preflightGas(estimate,cash.gasPrice,BigInt(tx.value),cash.balance);
 await validateWalletAccount(provider,account);
 await rpcChain(provider,src);
 await ensureNoPendingWalletTransaction({provider,account,chain:src,fetcher});
 const txHash=await request(provider,"eth_sendTransaction",[tx]);
 if(!HASH.test(txHash||""))throw Error("Wallet did not return a transaction hash");
 onBroadcast?.({txHash,sourceChain:source,routeName:route.name});
 return {txHash,sourceChain:source,routeName:route.name,
  feeWei:String(quote.validatorFee),interchainFeeWei,finalDestinationChain:destination};
}
// Continue a fully verified spoke->XGR first hop by using the existing public
// Gateway bridge() as the SECOND user-signed transfer. No GmbH executor, no
// replayed source lock, no second commercial adapter fee, no browser WAL.
//
// Without a cryptographic journey-link emitted by the direct second Gateway,
// a previously observed same-asset/same-amount hop is ambiguous. Fail closed
// until the full finality-aware index is complete and duplicates are excluded.
export async function startVerifiedOnwardHop({
 catalog,account,record,provider,fetcher=globalThis.fetch,onBroadcast
}){
 if(!ADDRESS.test(account||"")||!record?.txHash||record.status!=="awaiting-onward")
  throw Error("Select a confirmed first-hop transfer before continuing");
 const first=await findWalletSourceTx({catalog,account,
  sourceChain:record.sourceChain,txHash:record.txHash,fetcher});
 if(first.status!=="awaiting-onward"||!first.delivered||
  !first.executionAdapter||first.destinationChain!=="xgrchain"||
  !first.onwardRouteId||!first.finalDestinationChain||
  !eq(first.recipient,account)||!eq(first.finalRecipient,account)||
  !/^[1-9][0-9]*$/.test(first.amountRaw||"")||
  !eq(first.messageId,record.messageId))
  throw Error("First-hop delivery or onward intent is not independently verified");
 const onward=deployedRoutes(catalog).filter(r=>
  r.source==="xgrchain"&&r.destination===first.finalDestinationChain&&
  r.asset===first.asset&&eq(r.routeId,first.onwardRouteId));
 if(onward.length!==1)throw Error("Signed onward Gateway is not uniquely deployed");
 // The XGR on-chain adapter is the authoritative once-per-parent ledger.
 // A bounded/offline indexer can never prove non-existence of a historical
 // transfer; this durable mapping and wallet pending nonce are the gates.
 const adapter=catalog.infrastructure?.xgrchain?.xitaV315?.components?.executionGateway;
 if(!ADDRESS.test(adapter?.address||"")||
   !onward[0].gateway||!eq(onward[0].routeId,first.onwardRouteId))
  throw Error("Verified hub adapter for onward route not documented");
 const hub=catalog.chains.xgrchain;
 const hubId=await publicRead(hub.rpcUrls?.[0],"eth_chainId",[],fetcher);
 if(!QTY.test(hubId||"")||BigInt(hubId)!==BigInt(hub.chainId))
  throw Error("XGRChain hub RPC mismatch");
 const already=await publicRead(hub.rpcUrls?.[0],"eth_call",[{
  to:adapter.address,data:selector("onwardParentUsed(address,bytes32)")+
    addrWord(account)+first.messageId.slice(2)
 },"latest"],fetcher);
 if(!/^0x[0-9a-f]{64}$/i.test(already||"")||
   ![0n,1n].includes(BigInt(already)))
  throw Error("Unverifiable durable onward nonce; do not send TX3");
 if(BigInt(already)===1n)
  throw Error("This parent message already has a user-signed XGR onward TX. "+
   "Refresh the chain index; never bridge the same parent twice");
 const decimals=catalog.assets[first.asset]?.metadata?.decimals;
 const amount=unitsToAmount(first.amountRaw,decimals);
 // startTransfer() independently rechecks router bindings, gas, allowances,
 // wallet nonce, proof readiness and the destination native balance.
 return startTransfer({catalog,account,asset:first.asset,source:"xgrchain",
  destination:first.finalDestinationChain,amount,provider,fetcher,onBroadcast,
  commercial:false,onwardParentMessageId:first.messageId});
}
// Poll only the immutable message ID from a confirmed source receipt.
// Never sends a wallet transaction; caller handles destination signing separately.
export async function awaitUnsignedDeliveryProof({query,fetcher=globalThis.fetch,
 attempts=9,delayMs=16500,onStatus,signal,sleep=ms=>new Promise(done=>setTimeout(done,ms))}){
 for(let i=0;i<attempts;i++){
  if(signal?.aborted)return {status:"paused",notice:"Automatic proof checks paused."};
  let response=null,proof=null;
  try{
   response=await fetcher("/api/xeta/v1/transfer/recovery?"+query,{credentials:"omit",
    cache:"no-store",headers:{accept:"application/json"},signal});
   proof=await response.json().catch(()=>null);
  }catch(error){if(signal?.aborted)return {status:"paused",notice:"Proof checks paused."};}
  if(response?.ok&&proof?.ok){
   if(proof.status==="READY_UNSIGNED_CALL")return {status:"ready",proof};
   if(proof.status==="ALREADY_DELIVERED")return {status:"delivered"};
   if(!["PENDING","PREPARING","FRESH_QUORUM_REQUIRED"].includes(proof.status))
    throw Error("Unexpected proof-builder result; destination signing blocked.");
  }
  const fatal=proof?.reason==="PROOF_CONFIG_MISMATCH";
  if(fatal)throw Error("Proof service configuration mismatch; contact XITA support. Source lock remains confirmed.");
  if(i===attempts-1)break;
  onStatus?.(proof?.status==="PREPARING"?"Preparing validator proof…":
    "Waiting for validator quorum and destination proof…");
  await sleep(delayMs);
 }
 return {status:"waiting",notice:"Validator proof not yet available. Your source lock is confirmed; XITA will not repeat it. Continue this delivery later."};
}
export async function resumeDelivery({catalog,account,record,provider,
 fetcher=globalThis.fetch,onBroadcast,waitForProof=false,onStatus,signal}){
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
 const query=new URLSearchParams({asset:current.asset,route:current.routeName,
  messageId:current.messageId,sourceTxHash:current.txHash});
 const prepared=await awaitUnsignedDeliveryProof({query,fetcher,
  attempts:waitForProof?9:1,onStatus,signal});
 if(prepared.status==="delivered")return {status:"delivered"};
 if(prepared.status!=="ready")return prepared;
 const proof=prepared.proof;
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
 await validateWalletAccount(provider,account);
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
 await validateWalletAccount(provider,account);
 await rpcChain(provider,dst);
 await ensureNoPendingWalletTransaction({provider,account,chain:dst,fetcher});
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
