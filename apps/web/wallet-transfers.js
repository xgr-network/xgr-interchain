// XITA wallet activity: reconstruct transfer identity only from confirmed,
// canonical Gateway and Mailbox logs. No write, custody, private storage,
// assumed delivery or reliance on a privileged relayer.
import {keccak256,selector} from "./keccak.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const HEX=/^0x(?:[0-9a-f]{2})*$/i;
const QTY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const lower=x=>String(x||"").toLowerCase();
const isAddress=x=>ADDRESS.test(x||"")&&!/^0x0{40}$/i.test(x);
export const OPERATION_TOPIC=keccak256("ILNOperation(bytes32,bytes32,uint32,uint256)");
export const DISPATCH_TOPIC=keccak256("Dispatch(address,uint32,bytes32,bytes)");
export const INTERCHAIN_FEE_TOPIC=keccak256("InterchainFeeCharged(bytes32,address,address,bytes32,uint32,bytes32,uint32,bytes32,bytes32,uint256,uint256,uint256,uint256,uint256)");
export const ONWARD_JOURNEY_TOPIC=keccak256("OnwardJourneyDispatched(bytes32,bytes32,address,bytes32,uint32,bytes32,uint256,uint256,uint256)");
export const ONWARD_SELECTOR=selector("continueJourney(bytes32,address,bytes32,uint32,bytes32,uint256)");
// A verified adapter only augments the public Gateway event; its data never
// authorizes mint, unlock, receipt finality or customer-asset movement.
const EXECUTE_SELECTOR=selector("execute((address,address,bytes32,uint32,bytes32,uint32,bytes32,bytes32,uint256,uint256,uint256,uint256,uint64),bytes)");
const ZERO_ROUTE="0x"+"0".repeat(64);
const GATEWAY_RECEIPT=/^deployments\/receipts\/[a-z0-9-]+\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/;
const hexAddress=x=>/^0x[0-9a-f]{64}$/i.test(x||"")&&BigInt(x)>>160n===0n?
 "0x"+x.slice(-40).toLowerCase():null;
function documentedExecutionAdapter(catalog,sourceChain){
 const core=catalog.infrastructure?.[sourceChain]?.xitaV315;
 const adapter=core?.components?.executionGateway;
 if(!isAddress(adapter?.address)||!HASH.test(adapter?.runtimeCodeKeccak256||"")||
    !GATEWAY_RECEIPT.test(adapter?.receiptPath||"")||
    !core?.receiptPaths?.includes(adapter.receiptPath))return null;
 return lower(adapter.address);
}
export function adapterFeeEvidence(log,route,payer,messageId){
 if(!accountMatches(log?.address,route.executionAdapter)||
   !Array.isArray(log?.topics)||log.topics.length!==4||
   lower(log.topics[0])!==lower(INTERCHAIN_FEE_TOPIC)||
   lower(log.topics[1])!==lower(messageId)||
   hexAddress(log.topics[2])!==lower(payer)||
   hexAddress(log.topics[3])!==lower(route.gateway)||
   !/^0x[0-9a-f]{704}$/i.test(log.data||""))return null;
 const words=Array.from({length:11},(_,i)=>"0x"+log.data.slice(2+i*64,66+i*64));
 if(lower(words[0])!==route.routeId||
  BigInt(words[1])!==BigInt(route.destinationConfig.domainId)||
  BigInt(words[3])===0n||BigInt(words[3])>4294967295n||
  BigInt(words[6])<=0n||BigInt(words[7])<=0n||
  BigInt(words[8])<BigInt(words[7])||BigInt(words[9])<=0n)return null;
 const recipient=hexAddress(words[2]),finalRecipient=hexAddress(words[4]);
 if(!recipient||!finalRecipient)return null;
 const lastDomain=Number(BigInt(words[3]));
 const final=Object.entries(route.catalogChains||{}).filter(([,v])=>v.domainId===lastDomain);
 if(final.length!==1)return null;
 const finalChain=final[0][0],onwardRouteId=lower(words[5]);
 if(finalChain!==route.destinationChain){
  if(route.destinationChain!=="xgrchain"||onwardRouteId===ZERO_ROUTE)return null;
  const leg=(route.catalogRoutes||[]).filter(x=>x.asset===route.asset&&
    x.sourceChain==="xgrchain"&&x.destinationChain===finalChain&&
    x.routeId===onwardRouteId);
  if(leg.length!==1)return null;
 }else if(onwardRouteId!==ZERO_ROUTE||finalRecipient!==recipient)return null;
 return {executionAdapter:route.executionAdapter,recipient,finalRecipient,
  finalDestinationChain:finalChain,onwardRouteId:finalChain===route.destinationChain?null:onwardRouteId,
  amountRaw:BigInt(words[6]).toString(),validatorFeeWei:BigInt(words[7]).toString(),
  bridgeNativeWei:BigInt(words[8]).toString(),interchainFeeWei:BigInt(words[9]).toString(),
  quoteNonce:BigInt(words[10]).toString()};
}
// Onward TX 3 is linked to TX 1's parent message by the hub adapter event.
// This event is evidence of the payer's intent, never a mint authorization.
export function onwardJourneyEvidence(log,route,payer,messageId){
 if(route.sourceChain!=="xgrchain"||
  !accountMatches(log?.address,route.executionAdapter)||
  !Array.isArray(log?.topics)||log.topics.length!==4||
  lower(log.topics[0])!==lower(ONWARD_JOURNEY_TOPIC)||
  !HASH.test(log.topics[1]||"")||
  lower(log.topics[2])!==lower(messageId)||
  hexAddress(log.topics[3])!==lower(payer)||
  !/^0x[0-9a-f]{384}$/i.test(log.data||""))return null;
 const words=Array.from({length:6},(_,i)=>"0x"+log.data.slice(2+i*64,66+i*64));
 if(lower(words[0])!==route.routeId||
   BigInt(words[1])!==BigInt(route.destinationConfig.domainId)||
   BigInt(words[3])<=0n||BigInt(words[4])<=0n||
   BigInt(words[5])<BigInt(words[4]))return null;
 const recipient=hexAddress(words[2]);
 if(!recipient||!accountMatches(recipient,payer))return null;
 return {executionAdapter:route.executionAdapter,
   parentMessageId:lower(log.topics[1]),
   recipient,amountRaw:BigInt(words[3]).toString(),
   validatorFeeWei:BigInt(words[4]).toString(),
   bridgeNativeWei:BigInt(words[5]).toString(),
   onwardExecution:true};
}
const deliveredSelector=selector("delivered(bytes32)");
const accountMatches=(a,b)=>isAddress(a)&&lower(a)===lower(b);
// No Base-specific wallet executor allowlist: on every source chain a mined
// wallet transaction is attributable only by its canonical receipt evidence.
// Unmined/failed intermediary calls remain unattributed.
export function configuredGatewayRoutes(catalog){
 const result=[];
 if(!catalog?.chains||!catalog?.infrastructure)return result;
 const adapterRoutes=[];
 for(const [asset,entry] of Object.entries(catalog.assets||{})){
  for(const instance of entry?.deployment?.routeDeployments||[]){
   adapterRoutes.push({asset,sourceChain:instance.sourceChain,
    destinationChain:instance.destinationChain,routeId:lower(instance.routeId)});
  }
 }
 for(const [asset,entry] of Object.entries(catalog.assets||{})){
  if(entry?.deployment?.present!==true)continue;
  for(const route of entry.deployment.routeDeployments||[]){
   const src=route?.sourceChain,dst=route?.destinationChain;
   if(src===dst|| (src!=="xgrchain"&&dst!=="xgrchain"))continue;
   const sourceChain=catalog.chains[src],destinationChain=catalog.chains[dst];
   const gateway=route?.components?.gateway?.address;
   const sourceMailbox=catalog.infrastructure[src]?.xitaV315?.components?.mailbox?.address;
   const destinationMailbox=catalog.infrastructure[dst]?.xitaV315?.components?.mailbox?.address;
   const sourceRouter=entry.deployment.representations?.find(r=>r.chain===src)?.address;
   if(!sourceChain||!destinationChain||!isAddress(gateway)||!isAddress(sourceMailbox)||
      !HASH.test(route?.routeId||"")||!Number.isSafeInteger(sourceChain.chainId)||
      !Number.isSafeInteger(destinationChain.domainId))continue;
   if(!entry?.routes?.routes?.some(r=>r.name===route.routeName&&
      r.sourceChain===src&&r.destinationChain===dst))continue;
   result.push({asset,assetId:entry.deployment.assetId,routeId:lower(route.routeId),
    sourceChain:src,destinationChain:dst,routeName:route.routeName,sourceConfig:sourceChain,
    destinationConfig:destinationChain,gateway:lower(gateway),
    sourceMailbox:lower(sourceMailbox),
    destinationMailbox:isAddress(destinationMailbox)?lower(destinationMailbox):null,
    sourceRouter:isAddress(sourceRouter)?lower(sourceRouter):null,
    executionAdapter:documentedExecutionAdapter(catalog,src),
    catalogChains:catalog.chains,catalogRoutes:adapterRoutes});
  }
 }
 return result.slice(0,48);
}
export function dispatchMessage(logData){
 if(typeof logData!=="string"||!HEX.test(logData)||logData.length<130)
  throw Error("Malformed Mailbox Dispatch bytes");
 const payload=logData.slice(2);
 const offset=BigInt("0x"+payload.slice(0,64));
 if(offset!==32n)throw Error("Invalid Dispatch ABI offset");
 const size=BigInt("0x"+payload.slice(64,128));
 if(size===0n||size>131072n)throw Error("Invalid Dispatch message length");
 const n=Number(size);
 if(payload.length<128+2*n)throw Error("Truncated Dispatch message");
 return Uint8Array.from({length:n},(_,i)=>parseInt(payload.slice(128+i*2,130+i*2),16));
}
// Browsers cannot assume remote RPC servers accept cross-origin POST/CSP.
// All website reads use the SAME-ORIGIN, strictly read-only API; the server
// resolves approved chain endpoints from the current receipt-backed catalog.
// No wallet signing/broadcast ever traverses this proxy.
export async function publicRead(url,method,params,fetcher=globalThis.fetch,{
 viaProxy=typeof window!=="undefined",signal=null
}={}){
 if(typeof url!=="string"||!url.startsWith("https://")||typeof fetcher!=="function")
  throw Error("Untrusted HTTPS RPC endpoint");
 const parsed=new URL(url);
 if(parsed.protocol!=="https:"||parsed.username||parsed.password)
  throw Error("Untrusted HTTPS RPC endpoint");
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(signal){
  if(signal.aborted)controller.abort();
  else signal.addEventListener("abort",abort,{once:true});
 }
 const timeout=setTimeout(abort,viaProxy?21000:7000);
 try{
  const endpoint=viaProxy?"/api/xeta/v1/rpc/read":url;
  const body=viaProxy?{rpcUrl:url,method,params}:{jsonrpc:"2.0",id:1,method,params};
  let response;
  try{
   response=await fetcher(endpoint,{method:"POST",credentials:"omit",cache:"no-store",
    headers:{"content-type":"application/json",accept:"application/json"},
    body:JSON.stringify(body),signal:controller.signal});
  }catch{
   throw Error(viaProxy?"XITA read-only RPC proxy unreachable; no wallet transaction sent":
    "Chain RPC request failed");
  }
  if(!response?.ok){
   let diagnostic="";
   if(viaProxy){
    try{
     const body=await response.json();
     if(/^RPC_[A-Z0-9_]{3,64}$/.test(body?.code||""))
      diagnostic=" / "+body.code;
     const attempts=Array.isArray(body?.attempts)?body.attempts:[];
     if(attempts.length){
      const reasons=attempts.slice(0,4).map(x=>x?.code)
       .filter(x=>/^RPC_[A-Z0-9_]{3,64}$/.test(x||""));
      if(reasons.length)diagnostic+=": "+reasons.join(", ");
     }
    }catch{/* Proxy can also be unavailable at the reverse-proxy layer. */}
   }
   throw Error(viaProxy?
    "XITA read-only RPC proxy unavailable (HTTP "+String(response?.status||"network")+
     diagnostic+"); no wallet transaction sent":"Chain RPC unavailable");
  }
  const reply=await response.json();
  if(reply?.jsonrpc!=="2.0"||reply.id!==1||reply.error||
      !Object.hasOwn(reply,"result"))throw Error("Invalid chain RPC response");
  return reply.result;
 }finally{
  clearTimeout(timeout);
  signal?.removeEventListener("abort",abort);
 }
}
// Read-only RPC failover is chain-agnostic. Every replacement endpoint is
// independently chain-ID verified BEFORE it can supply transaction/receipt
// evidence. A missing recent TX/receipt may also mean a provider is lagging.
function createReader(chain,fetcher,rpc){
 const configured=chain?.rpcUrls;
 if(!Number.isSafeInteger(chain?.chainId)||chain.chainId<=0||
    !Array.isArray(configured)||configured.length===0||configured.length>8)
  throw Error("Source or destination chain RPC configuration missing");
 const urls=[...new Set(configured)];
 for(const url of urls){
  let parsed;
  try{parsed=new URL(url)}catch{throw Error("Untrusted HTTPS RPC endpoint")}
  if(typeof url!=="string"||url.length>500||parsed.protocol!=="https:"||
     !parsed.hostname||parsed.username||parsed.password||parsed.hash)
   throw Error("Untrusted HTTPS RPC endpoint");
 }
 const call=(url,method,params)=>rpc?rpc(url,method,params):
  publicRead(url,method,params,fetcher);
 const checkIdentity=async(url)=>{
  const id=await call(url,"eth_chainId",[]);
  if(!QTY.test(id||"")||BigInt(id)!==BigInt(chain.chainId))
   throw Error("Source or destination RPC chain mismatch");
 };
 let current=null;
 const verify=async()=>{
  let last;
  for(const url of urls){
   try{await checkIdentity(url);current=url;return}
   catch(error){last=error}
  }
  throw Error("No chain-ID-verified source or destination RPC available: "+
   String(last?.message||"unknown").slice(0,120));
 };
 const read=async(method,params)=>{
  if(!current)await verify();
  let missing=false,last;
  const candidates=[current,...urls.filter(url=>url!==current)];
  for(const url of candidates){
   try{
    if(url!==current)await checkIdentity(url);
    const value=await call(url,method,params);
    // Not-found is nonfinal evidence. Before reporting pending, check
    // verified alternatives (which may have a fresher TX / receipt).
    if(value===null&&["eth_getTransactionByHash","eth_getTransactionReceipt"].includes(method)){
     missing=true;
     continue;
    }
    current=url;
    return value;
   }catch(error){last=error}
  }
  if(missing)return null;
  throw Error("All verified source or destination RPCs failed: "+
   String(last?.message||"unknown").slice(0,120));
 };
 return {read,verify};
}
const hex=x=>"0x"+BigInt(x).toString(16);
function validateOperation(log,route){
 return accountMatches(log?.address,route.gateway)&&
  Array.isArray(log.topics)&&log.topics.length===4&&
  lower(log.topics[0])===lower(OPERATION_TOPIC)&&
  lower(log.topics[1])===route.routeId&&HASH.test(log.topics[2]||"")&&
  HEX.test(log.data||"")&&log.data.length===66&&
  BigInt(log.topics[3])===BigInt(route.destinationConfig.domainId);
}
function validDispatch(log,route,id){
 if(!accountMatches(log?.address,route.sourceMailbox)||
  lower(log.topics?.[0])!==lower(DISPATCH_TOPIC)||log.topics.length!==4||
  BigInt(log.topics[2])!==BigInt(route.destinationConfig.domainId))return false;
 if(route.sourceRouter&&BigInt(log.topics[1])!==BigInt(route.sourceRouter))return false;
 const msg=dispatchMessage(log.data);
 return lower(keccak256(msg))===lower(id);
}
// An on-chain fee event identifies the original user even if their wallet
// delegates the outer transaction to an executor (e.g. EIP-7702). Without
// that payer-bound event, only a direct canonical Gateway call can be
// attributed to the wallet. A Gateway Dispatch alone does not prove whose
// assets an arbitrary intermediary bridged.
function verifiedFeeAdapterEvent(receiptLogs,route,payer,messageId){
 if(!route.executionAdapter)return {present:false,evidence:null};
 const linked=receiptLogs.filter(log=>{
  if(!accountMatches(log?.address,route.executionAdapter)||
     !Array.isArray(log.topics))return false;
  const topic=lower(log.topics[0]);
  return (topic===lower(INTERCHAIN_FEE_TOPIC)&&lower(log.topics[1])===messageId)||
    (topic===lower(ONWARD_JOURNEY_TOPIC)&&lower(log.topics[2])===messageId);
 });
 if(linked.length!==1)return {present:linked.length>0,evidence:null};
 const log=linked[0];
 const evidence=lower(log.topics[0])===lower(INTERCHAIN_FEE_TOPIC)?
  adapterFeeEvidence(log,route,payer,messageId):
  onwardJourneyEvidence(log,route,payer,messageId);
 return {present:true,evidence};
}
export async function findWalletSourceTx({catalog,account,sourceChain,txHash,fetcher,rpc}){
 if(!isAddress(account)||!HASH.test(txHash||""))throw Error("Connect wallet and enter a valid source transaction hash");
 const routes=configuredGatewayRoutes(catalog).filter(r=>r.sourceChain===sourceChain);
 if(!routes.length)throw Error("No verified deployed XITA Gateway for this source chain");
 const reader=createReader(routes[0].sourceConfig,fetcher,rpc);
 await reader.verify();
 const tx=await reader.read("eth_getTransactionByHash",[txHash]);
 if(!tx)throw Error("Source transaction not found yet; check chain and hash");
 if(tx.hash&&lower(tx.hash)!==lower(txHash))throw Error("Untrusted source transaction hash");
 if(!accountMatches(tx.from,account))throw Error("Source transaction is not from the connected wallet");
 const direct=routes.filter(r=>accountMatches(tx.to,r.gateway));
 const adapter=routes.filter(r=>r.executionAdapter&&accountMatches(tx.to,r.executionAdapter));
 const input=lower(tx.input??tx.data??"");
 const paidAdapter=adapter.length>0&&input.startsWith(EXECUTE_SELECTOR);
 const onwardAdapter=adapter.length>0&&sourceChain==="xgrchain"&&
  input.startsWith(ONWARD_SELECTOR);
 if(adapter.length&&(!/^0x[0-9a-f]+$/.test(input)||
    (!paidAdapter&&!onwardAdapter)))
  throw Error("Adapter source call has unexpected ABI selector");

 // No canonical operation or payer receipt exists for an unmined transaction.
 // In particular, never infer a wallet transfer from an unknown executor's
 // calldata or from a selector that merely contains a Gateway address.
 let pendingCandidates=[...direct,...adapter];
 if(adapter.length&&pendingCandidates.length>1){
  const routeId=input.length>=10+3*64?
    "0x"+input.slice(10+2*64,10+3*64):null;
  pendingCandidates=pendingCandidates.filter(r=>r.routeId===routeId);
 }
 const receipt=await reader.read("eth_getTransactionReceipt",[txHash]);
 if(receipt&&(!accountMatches(receipt.from,account)||
    !accountMatches(receipt.to,tx.to)||
    lower(receipt.transactionHash)!==lower(txHash)||
    !Array.isArray(receipt.logs)))
  throw Error("Untrusted source receipt");
 if(!receipt||receipt.status==="0x0"){
  if(pendingCandidates.length!==1)
   throw Error("Unconfirmed or failed intermediary transaction cannot be linked to a documented XITA Gateway");
  const route=pendingCandidates[0];
  return {account:lower(account),txHash:lower(txHash),sourceChain,
   destinationChain:route.destinationChain,asset:route.asset,routeName:route.routeName,
   routeId:route.routeId,gateway:route.gateway,confirmed:false,delivered:null,
   messageId:null,status:receipt?"source-failed":"pending-source"};
 }
 if(receipt.status!=="0x1"||!QTY.test(receipt.blockNumber||""))
  throw Error("Source receipt status or finality missing");
 const head=await reader.read("eth_blockNumber",[]);
 if(!QTY.test(head||""))throw Error("Current source block unavailable");
 const valid=[];
 for(const route of routes){
  // Always derive the confirmed route from the emitted Gateway and Mailbox
  // logs, not from the outer tx target, wallet-specific RPCs, or the UI route.
  const operations=receipt.logs.filter(log=>validateOperation(log,route));
  if(operations.length!==1)continue;
  const id=lower(operations[0].topics[2]);
  const dispatches=receipt.logs.filter(log=>{
   try{return validDispatch(log,route,id)}catch{return false}
  });
  if(dispatches.length!==1)continue;
  const {present,evidence}=verifiedFeeAdapterEvent(receipt.logs,route,account,id);
  if(present&&!evidence)continue;
  // A paid adapter call must carry its payer-bound fee evidence. A different
  // outer target is accepted only if that same evidence proves that this
  // wallet (rather than the intermediary) paid for the canonical bridge.
  if(!evidence&&!accountMatches(tx.to,route.gateway))continue;
  if(accountMatches(tx.to,route.executionAdapter)&&!evidence)continue;
  if(evidence&&BigInt(evidence.validatorFeeWei)!==BigInt(operations[0].data))
   continue;
  valid.push({route,messageId:id,validatorFeeWei:BigInt(operations[0].data).toString(),
   evidence});
 }
 if(valid.length!==1)
  throw Error("Missing or ambiguous verified Gateway operation or Mailbox Dispatch / Interchain Fee evidence");
 const {route,messageId,validatorFeeWei,evidence}=valid[0];
 const base={account:lower(account),txHash:lower(txHash),sourceChain,
  destinationChain:route.destinationChain,asset:route.asset,routeName:route.routeName,
  routeId:route.routeId,gateway:route.gateway,confirmed:false,delivered:null,
  messageId:null,status:"pending-source"};
 const confirmations=Math.max(1,Number(route.sourceConfig.confirmations||1));
 if(BigInt(head)-BigInt(receipt.blockNumber)+1n<BigInt(confirmations))
  return {...base,status:"confirming"};
 const found={...base,messageId,confirmed:true,validatorFeeWei,
  ...(evidence||{}),status:"delivery-unknown"};
 if(!route.destinationMailbox)return {...found,status:"destination-not-deployed"};
 try{
  const dest=createReader(route.destinationConfig,fetcher,rpc);
  await dest.verify();
  const response=await dest.read("eth_call",[{to:route.destinationMailbox,
   data:deliveredSelector+messageId.slice(2)},"latest"]);
  if(!/^0x[0-9a-f]{64}$/i.test(response||"")||
      ![0n,1n].includes(BigInt(response)))throw Error("Invalid destination delivery state");
  const delivered=BigInt(response)===1n;
  return {...found,delivered,status:delivered?
   (evidence?.onwardRouteId?"awaiting-onward":"delivered"):"awaiting-proof"};
 }catch{
  return {...found,status:"delivery-unknown"};
 }
}
export async function scanRecentWalletTransfers({catalog,account,fetcher,rpc,lookback=4096,max=12}){
 if(!isAddress(account))throw Error("Connect wallet before reading transfers");
 if(!Number.isSafeInteger(lookback)||lookback<1||lookback>4096||
    !Number.isSafeInteger(max)||max<1||max>30)throw Error("Invalid scan bounds");
 const routes=configuredGatewayRoutes(catalog);
 const txs=new Map(),warnings=[];
 for(const route of routes.slice(0,24)){
  try{
   const source=createReader(route.sourceConfig,fetcher,rpc);
   await source.verify();
   const head=await source.read("eth_blockNumber",[]);
   if(!QTY.test(head||""))throw Error("Malformed source head");
   const block=BigInt(head),first=block>=BigInt(lookback)?block-BigInt(lookback)+1n:0n;
   for(let from=first;from<=block;from+=256n){
    const end=from+255n>block?block:from+255n;
    const logs=await source.read("eth_getLogs",[{address:route.gateway,
      topics:[OPERATION_TOPIC,route.routeId],fromBlock:hex(from),toBlock:hex(end)}]);
    if(!Array.isArray(logs)||logs.length>100)throw Error("Gateway log scan exceeded safe range");
    for(const log of logs){
     if(!HASH.test(log.transactionHash||"")||txs.has(lower(log.transactionHash)))continue;
     // Never use log sender hints (event has no indexed wallet field).
     const tx=await source.read("eth_getTransactionByHash",[log.transactionHash]);
     if(accountMatches(tx?.from,account))txs.set(lower(log.transactionHash),route.sourceChain);
     if(txs.size>=max)break;
    }
    if(txs.size>=max)break;
   }
  }catch{warnings.push(route.sourceChain+" → "+route.destinationChain+" scan unavailable")}
  if(txs.size>=max)break;
 }
 const items=[];
 for(const [txHash,sourceChain] of txs){
  try{items.push(await findWalletSourceTx({catalog,account,sourceChain,txHash,fetcher,rpc}))}
  catch{warnings.push("Could not verify source transfer "+txHash.slice(0,10))}
 }
 return {items,lookback,limited:txs.size>=max,warnings,scannedRoutes:routes.length};
}
