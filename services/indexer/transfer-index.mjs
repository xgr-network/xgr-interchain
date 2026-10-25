import {verifiedNativeMailboxState,readNativeFinalityHead} from "../../apps/web/chain-finality.js";
// Persistent XITA transfer event index: only canonical chain observations.
// PostgreSQL contains a rebuildable, non-authoritative query accelerator. This
// module NEVER signs, mints, unlocks, computes custody TVL or sets activation.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {configuredGatewayRoutes,findWalletSourceTx,OPERATION_TOPIC,publicRead} from "../../apps/web/wallet-transfers.js";
import {selector} from "../../apps/web/keccak.js";
const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const norm=x=>String(x||"").toLowerCase();
const hex=n=>"0x"+BigInt(n).toString(16);
const MAX_EVENTS=150;
const BRIDGE_SELECTOR=selector("bridge(uint32,bytes32,uint256)");
const DELIVERED_SELECTOR=selector("delivered(bytes32)");
const safeUint=n=>HEX.test(n||"")&&BigInt(n)<=BigInt(Number.MAX_SAFE_INTEGER);
const number=n=>{if(!safeUint(n))throw Error("Unsafe RPC integer");return Number(BigInt(n))};
export function gatewayDeploymentBlock({catalog,route,read=readFileSync,root=ROOT}){
 const deployment=catalog?.assets?.[route.asset]?.deployment?.routeDeployments?.find(r=>
  r.routeName===route.name&&r.sourceChain===route.source&&r.destinationChain===route.destination);
 const path=deployment?.components?.gateway?.receiptPath;
 if(!/^deployments\/receipts\/[a-z0-9-]+\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/.test(path||""))
  throw Error("Missing immutable Gateway deployment receipt");
 const receipt=JSON.parse(read(resolve(root,path),"utf8"));
 if(receipt.kind!=="xita-v315-deployment-receipt"||receipt.component!=="gateway"||
    receipt.chain!==route.source||receipt.routeName!==route.name||
    norm(receipt.address)!==norm(route.gateway)||!safeUint(hex(receipt.blockNumber))||
    norm(receipt.provenance?.routeId)!==norm(route.routeId)||
    receipt.status!=="onchain-deployment-verified")
  throw Error("Gateway receipt does not match deployed route");
 return receipt.blockNumber;
}
export function indexedRoutes(catalog,{blockFor=gatewayDeploymentBlock}={}){
 const recognized=configuredGatewayRoutes(catalog);
 const records=deployedRoutes(catalog);
 return records.map(route=>{
  const source=recognized.find(r=>r.asset===route.asset&&r.routeName===route.name&&
    r.sourceChain===route.source&&r.destinationChain===route.destination);
  if(!source)throw Error("Configured gateway missing for canonical deployed route");
  const deployedBlock=blockFor({catalog,route});
  if(!Number.isSafeInteger(deployedBlock)||deployedBlock<0)throw Error("Unsafe deploy block");
  return {...source,deploymentBlock:deployedBlock,
   name:route.name,asset:route.asset,routeId:norm(route.routeId),
   gateway:norm(route.gateway),destinationMailbox:norm(source.destinationMailbox)};
 });
}
export function bridgeAmountFromTransaction(tx,route){
 if(!tx||!ADDRESS.test(route?.gateway||"")||norm(tx.to)!==norm(route.gateway)||
  !Number.isSafeInteger(route?.destinationConfig?.domainId))return null;
 const data=String(tx.input??tx.data??"").toLowerCase();
 if(!/^0x[0-9a-f]{200}$/.test(data)||!data.startsWith(BRIDGE_SELECTOR))return null;
 const args=data.slice(10);
 const domain=BigInt("0x"+args.slice(0,64)),
  recipient="0x"+args.slice(64,128),amount=BigInt("0x"+args.slice(128,192));
 if(domain!==BigInt(route.destinationConfig.domainId)||amount<=0n||amount>=2n**256n||
  recipient.slice(0,24)!=="0x"+"0".repeat(22))return null;
 return amount.toString();
}
export async function checkedDelivery({route,messageId,rpc}){
 if(!HASH.test(messageId||"")||typeof rpc!=="function")throw Error("Invalid delivery check");
 if(!ADDRESS.test(route.destinationMailbox||""))return {delivered:null,reason:"destination-not-deployed"};
 const id=await rpc(route.destinationConfig,"eth_chainId",[]);
 if(!HEX.test(id||"")||BigInt(id)!==BigInt(route.destinationConfig.chainId))
  throw Error("Destination RPC chain mismatch");
 return verifiedNativeMailboxState(
  (method,args)=>rpc(route.destinationConfig,method,args),
  route.destinationConfig.chainId,route.destinationMailbox,
  DELIVERED_SELECTOR+messageId.slice(2));
}
// Browser recovery may retry any configured source/destination RPC URL.
// A source backup must never silently be treated as the destination.
export function bindVerifiedTransferRpc(route,rpc){
 if(typeof rpc!=="function")throw Error("Missing verified transfer RPC");
 const sources=route?.sourceConfig?.rpcUrls||[];
 const destinations=route?.destinationConfig?.rpcUrls||[];
 return (url,method,params)=>{
  const source=sources.includes(url),destination=destinations.includes(url);
  if(source===destination)throw Error("Unknown or ambiguous chain RPC for verified transfer");
  return rpc(source?route.sourceConfig:route.destinationConfig,method,params);
 };
}
export async function verifiedTransfer({catalog,route,transactionHash,rpc}){
 if(!HASH.test(transactionHash||""))throw Error("Invalid canonical source tx");
 const tx=await rpc(route.sourceConfig,"eth_getTransactionByHash",[transactionHash]);
 if(!ADDRESS.test(tx?.from||""))throw Error("Missing canonical source wallet");
 const evidence=await findWalletSourceTx({catalog,account:tx.from,
  sourceChain:route.sourceChain,txHash:transactionHash,
  rpc:bindVerifiedTransferRpc(route,rpc)});
 if(!evidence.confirmed||!HASH.test(evidence.messageId||"")||
   norm(evidence.routeId)!==norm(route.routeId)||
   norm(evidence.gateway)!==norm(route.gateway)||
   ["source-failed","pending-source","confirming"].includes(evidence.status))
  throw Error("Source operation cannot be indexed before canonical confirmation");
 const delivered=await checkedDelivery({route,messageId:evidence.messageId,rpc})
  .catch(()=>({delivered:null}));
 return {
  sourceChain:route.sourceChain,messageId:norm(evidence.messageId),
  sourceTxHash:norm(transactionHash),
  account:norm(tx.from),asset:route.asset,assetId:norm(route.assetId),
  routeName:route.routeName,routeId:norm(route.routeId),
  gateway:norm(route.gateway),destinationChain:route.destinationChain,
  destinationMailbox:norm(route.destinationMailbox),
  amountRaw:evidence.amountRaw||bridgeAmountFromTransaction(tx,route),
  validatorFeeWei:evidence.validatorFeeWei,
  executionAdapter:evidence.executionAdapter||null,
  interchainFeeWei:evidence.interchainFeeWei||null,
  quoteNonce:evidence.quoteNonce||null,
  finalDestinationChain:evidence.finalDestinationChain||null,
  finalRecipient:evidence.finalRecipient||evidence.recipient||null,
  onwardRouteId:evidence.onwardRouteId||null,
  parentMessageId:evidence.parentMessageId||null,
  delivered:delivered.delivered,
 };
}
// Pure read-only RPC transport for the finalized indexer; caller controls endpoints,
// never a visitor-provided URL. No wallet or signer is involved.
// A rejected eth_getLogs is never treated as an empty canonical block range.
// Operator-only URLs can override the public catalog; never publish API keys.
export function rpcCandidates(chain,{baseUrls=process.env.XITA_BASE_ARCHIVE_RPC_URLS||""}={}){
 const raw=chain?.chainId===8453?
  [...String(baseUrls).split(",").map(s=>s.trim()).filter(Boolean),
   ...(chain?.rpcUrls||[])]:[...(chain?.rpcUrls||[])];
 const result=[];
 for(const url of raw){
  let parsed;
  try{parsed=new URL(url);}catch{throw Error("Invalid chain RPC URL");}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||
    parsed.hash||!parsed.hostname||url.length>500)
   throw Error("Invalid chain RPC URL");
  if(!result.includes(url))result.push(url);
 }
 if(!result.length||result.length>8)throw Error("Missing or excessive chain RPC URLs");
 return result;
}
// A normal historical scan qualifies a provider with its ACTUAL requested
// finalized block and log window. The old fixed-height Base archive preflight
// made several unrelated RPC calls per endpoint and was repeated on expiry.
// An optional injected probe is retained for targeted tests only.
export function canonicalRpc({fetcher=globalThis.fetch,archiveProbe=null,
 baseUrls=process.env.XITA_BASE_ARCHIVE_RPC_URLS||"",now=Date.now}={}){
 const validated=new Map(),retryByProvider=new Map();
 return async(chain,method,params)=>{
  if(!Number.isSafeInteger(chain?.chainId)||chain.chainId<1)
   throw Error("Invalid canonical chain config");
  let last=null,skipped=0;
  for(const url of rpcCandidates(chain,{baseUrls})){
   const key=String(chain.chainId)+"|"+url;
   const retry=retryByProvider.get(key);
   if(retry&&retry.until>now()){skipped++;continue;}
   let identityVerified=false;
   try{
    const ok=validated.get(key);
    if(!ok||ok.expire<=now()){
     const id=await publicRead(url,"eth_chainId",[],fetcher);
     if(typeof id!=="string"||!/^0x[0-9a-f]+$/i.test(id)||
       BigInt(id)!==BigInt(chain.chainId))throw Error("RPC chain identity mismatch");
     identityVerified=true;
     if(chain.chainId===8453&&typeof archiveProbe==="function"){
      const archive=await archiveProbe(url,{fetcher,ms:7000});
      if(!archive?.ok)throw Error("Base historical RPC unsupported: "+
       String(archive?.error||"not qualified").slice(0,100));
     }
     validated.set(key,{expire:now()+300000});
    }
    // Canonical completeness is checked by the caller. Never reinterpret
    // an eth_getLogs failure or unsupported range as an empty log set.
    const value=await publicRead(url,method,params,fetcher);
    retryByProvider.delete(key);
    return value;
   }catch(error){
    if(identityVerified||/identity mismatch/.test(String(error?.message||"")))
     validated.delete(key);
    last=error;
    const count=Math.min(5,(retry?.failures||0)+1);
    // 15/30/60/120 second bounded backoff on transport, 429 and missing
    // historical methods. It is per chain AND URL, never route-scoped.
    retryByProvider.set(key,{failures:count,
     until:now()+Math.min(120000,15000*2**(count-1))});
   }
  }
  throw Error("All "+String(chain.name||chain.chainId)+" RPC endpoints failed: "+
   (skipped>0?"provider cooldown; ":"")+
   String(last?.message||"retry after cooldown").slice(0,125));
 };
}
// A known TX hash needs receipt and block confirmation, not archive-length
// eth_getLogs. Separate this reader from the strict historical route scanner:
// Base public RPCs can serve individual receipts even when archive log probes
// are rate-limited. Both readers independently verify chain IDs and fail over.
export function candidateRpc({fetcher=globalThis.fetch,
 baseUrls=process.env.XITA_BASE_ARCHIVE_RPC_URLS||"",now=Date.now}={}){
 const identities=new Map;
 return async (chain,method,params)=>{
  if(!Number.isSafeInteger(chain?.chainId)||chain.chainId<1)
   throw Error("Invalid candidate source chain");
  let last=null,missing=false;
  for(const url of rpcCandidates(chain,{baseUrls})){
   try{
    const prev=identities.get(url);
    if(!prev||prev.chainId!==chain.chainId||prev.expire<=now()){
     const id=await publicRead(url,"eth_chainId",[],fetcher);
     if(!/^0x[0-9a-f]+$/i.test(id||"")||BigInt(id)!==BigInt(chain.chainId))
      throw Error("Candidate RPC chain ID mismatch");
     identities.set(url,{chainId:chain.chainId,expire:now()+300000});
    }
    const result=await publicRead(url,method,params,fetcher);
    // Receipt propagation can lag behind block finalization on one provider.
    // Before treating a missing source TX as pending, try verified backups.
    if(result===null&&["eth_getTransactionByHash","eth_getTransactionReceipt",
      "eth_getBlockByNumber"].includes(method)){missing=true;continue;}
    return result;
   }catch(error){identities.delete(url);last=error;}
  }
  if(missing)return null;
  throw Error("All candidate RPCs failed for "+String(chain.name||chain.chainId)+": "+
   String(last?.message||"unknown").slice(0,125));
 };
}
export function validateIndexedGatewayLog(log,route,from,to){
 if(!log||norm(log.address)!==norm(route.gateway)||
  norm(log.topics?.[0])!==norm(OPERATION_TOPIC)||
  norm(log.topics?.[1])!==norm(route.routeId)||
  !HASH.test(log.topics?.[2]||"")||
  !HASH.test(log.transactionHash||"")||!HASH.test(log.blockHash||"")||
  log.removed===true||!HEX.test(log.blockNumber||"")||
  number(log.blockNumber)<from||number(log.blockNumber)>to||
  !HEX.test(log.logIndex||""))
  throw Error("Untrusted Gateway event in finalized log range");
 return {blockNumber:number(log.blockNumber),logIndex:number(log.logIndex),
  blockHash:norm(log.blockHash),txHash:norm(log.transactionHash),
  messageId:norm(log.topics[2])};
}
export async function readRouteWindow({route,cursor,rpc,limit=150}){
 const id=await rpc(route.sourceConfig,"eth_chainId",[]);
 if(!HEX.test(id||"")||BigInt(id)!==BigInt(route.sourceConfig.chainId))
  throw Error("Source RPC chain mismatch");
 const finality=await readNativeFinalityHead(
  (method,args)=>rpc(route.sourceConfig,method,args),route.sourceConfig.chainId);
 const finalizedHead=finality.number;
 const from=(cursor?.scannedTo??(route.deploymentBlock-1))+1;
 if(cursor?.scannedHash){
  const previous=await rpc(route.sourceConfig,"eth_getBlockByNumber",[
   hex(cursor.scannedTo),false]);
  if(!previous||norm(previous.hash)!==norm(cursor.scannedHash))
   return {reorg:true,finalizedHead,from:route.deploymentBlock};
 }
 if(from>finalizedHead)
  return {from,to:from-1,finalizedHead,events:[],hash:cursor?.scannedHash||null};
 if(!Number.isSafeInteger(limit)||limit<1||limit>250)throw Error("Unsafe scan window");
 const to=Math.min(finalizedHead,from+limit-1);
 const logs=await rpc(route.sourceConfig,"eth_getLogs",[{
  address:route.gateway,topics:[OPERATION_TOPIC,route.routeId],
  fromBlock:hex(from),toBlock:hex(to)}]);
 if(!Array.isArray(logs)||logs.length>MAX_EVENTS)throw Error("RPC logs ambiguous or exceeding safe bounds");
 const identities=new Set,blockHashes=new Map,blockTimes=new Map;
 const events=[];
 for(const log of logs){
  const item=validateIndexedGatewayLog(log,route,from,to);
  const identity=item.txHash+":"+item.logIndex;
  if(identities.has(identity))throw Error("Duplicate Gateway operation event");
  identities.add(identity);
  let canonical=blockHashes.get(item.blockNumber);
  if(!canonical){
   const block=await rpc(route.sourceConfig,"eth_getBlockByNumber",[
    hex(item.blockNumber),false]);
   if(!block||number(block.number)!==item.blockNumber||!HASH.test(block.hash||""))
    throw Error("Gateway event block unavailable");
   canonical=norm(block.hash);blockHashes.set(item.blockNumber,canonical);
   if(HEX.test(block.timestamp||"")&&BigInt(block.timestamp)<=(BigInt(Number.MAX_SAFE_INTEGER)/1000n))
    blockTimes.set(item.blockNumber,new Date(Number(BigInt(block.timestamp))*1000).toISOString());
  }
  if(item.blockHash!==canonical)throw Error("Gateway log block is not canonical");
  item.sourceBlockAt=blockTimes.get(item.blockNumber)||null;
  events.push(item);
 }
 const end=await rpc(route.sourceConfig,"eth_getBlockByNumber",[hex(to),false]);
 if(!end||number(end.number)!==to||!HASH.test(end.hash||""))
  throw Error("Finalized endpoint block unavailable");
 return {from,to,finalizedHead,events,hash:norm(end.hash)};
}


// Source-scoped Gateway observation. All routes share one finality-qualified
// head and ONE eth_getLogs query per bounded window. The returned log is
// dispatched only to its exact (Gateway, routeId) pair. This read model is
// NOT a validator witness and cannot authorize BLS signing or custody.
export async function readSourceWindow({routes,cursors,rpc,limit=150,finality=null}={}){
 if(!Array.isArray(routes)||routes.length===0||routes.length>64||
   !(cursors instanceof Map)||typeof rpc!=="function"||
   !Number.isSafeInteger(limit)||limit<1||limit>250)
  throw Error("Invalid source observer inputs");
 const source=routes[0].sourceConfig;
 const chain=routes[0].sourceChain;
 if(!source||!Number.isSafeInteger(source.chainId))throw Error("Invalid source chain");
 const configured=JSON.stringify(source.rpcUrls||[]);
 const byPair=new Map(),gateways=new Set(),ids=new Set(),positions=new Map();
 let from=Number.MAX_SAFE_INTEGER;
 for(const route of routes){
  if(route.sourceChain!==chain||route.sourceConfig?.chainId!==source.chainId||
    JSON.stringify(route.sourceConfig?.rpcUrls||[])!==configured||
    !ADDRESS.test(route.gateway||"")||!HASH.test(route.routeId||"")||
    !Number.isSafeInteger(route.deploymentBlock)||route.deploymentBlock<1)
   throw Error("Inconsistent source Gateway route");
  const pair=norm(route.gateway)+"|"+norm(route.routeId);
  if(byPair.has(pair))throw Error("Duplicate source Gateway route identity");
  byPair.set(pair,route);
  gateways.add(norm(route.gateway));ids.add(norm(route.routeId));
  const cursor=cursors.get(route.routeId)||null;
  if(cursor?.stale)throw Error("Stale cursor requires separate recovery");
  const prior=cursor?.scannedTo??(route.deploymentBlock-1);
  if(!Number.isSafeInteger(prior)||prior<route.deploymentBlock-1)
   throw Error("Invalid durable source cursor");
  positions.set(route.routeId,prior);
  from=Math.min(from,prior+1);
 }
 const confirmed=finality||await readNativeFinalityHead(
  (method,args)=>rpc(source,method,args),source.chainId);
 if(!Number.isSafeInteger(confirmed?.number)||confirmed.number<1||
   !HASH.test(confirmed.hash||""))
  throw Error("Unverified shared source safe head");
 const byHeight=new Map(),reorgRoutes=[];
 // A previously committed route cursor must still pin to the canonical
 // block at that height; validate each DISTINCT height only once per batch.
 for(const route of routes){
  const cursor=cursors.get(route.routeId);
  if(!cursor?.scannedHash)continue;
  const height=positions.get(route.routeId);
  if(height>confirmed.number)throw Error("Durable cursor above safe source head");
  let block=byHeight.get(height);
  if(!block){
   block=await rpc(source,"eth_getBlockByNumber",[hex(height),false]);
   if(!block||number(block.number)!==height||!HASH.test(block.hash||""))
    throw Error("Recorded source cursor block unavailable");
   byHeight.set(height,block);
  }
  if(norm(block.hash)!==norm(cursor.scannedHash))reorgRoutes.push(route);
 }
 if(reorgRoutes.length)return {reorgRoutes,head:confirmed.number,finality:confirmed};
 for(const pos of positions.values())if(pos>confirmed.number)
  throw Error("Durable cursor beyond safe source head");
 const eventsByRoute=new Map(routes.map(r=>[r.routeId,[]]));
 if(from>confirmed.number)
  return {from,to:from-1,head:confirmed.number,finality:confirmed,
   hash:null,eventsByRoute,reorgRoutes:[]};
 const to=Math.min(confirmed.number,from+limit-1);
 const logs=await rpc(source,"eth_getLogs",[{
  address:[...gateways],topics:[OPERATION_TOPIC,[...ids]],
  fromBlock:hex(from),toBlock:hex(to)}]);
 if(!Array.isArray(logs)||logs.length>MAX_EVENTS*routes.length)
  throw Error("Incomplete or excessive shared Gateway log response");
 const seen=new Set(),timestampByHeight=new Map();
 for(const log of logs){
  if(!gateways.has(norm(log?.address))||
    norm(log?.topics?.[0])!==norm(OPERATION_TOPIC)||
    !ids.has(norm(log?.topics?.[1])))
   throw Error("Unexpected event outside source Gateway filter");
  const route=byPair.get(norm(log.address)+"|"+norm(log.topics[1]));
  if(!route)continue; // Cross-product of address and routeId topic filters.
  const item=validateIndexedGatewayLog(log,route,from,to);
  const identity=route.routeId+"|"+item.txHash+":"+item.logIndex;
  if(seen.has(identity))throw Error("Duplicate shared Gateway operation");
  seen.add(identity);
  if(item.blockNumber<route.deploymentBlock||
    item.blockNumber<=positions.get(route.routeId))continue;
  let block=byHeight.get(item.blockNumber);
  if(!block){
   block=await rpc(source,"eth_getBlockByNumber",[hex(item.blockNumber),false]);
   if(!block||number(block.number)!==item.blockNumber||
     !HASH.test(block.hash||""))
    throw Error("Shared Gateway event block unavailable");
   byHeight.set(item.blockNumber,block);
  }
  if(item.blockHash!==norm(block.hash))throw Error("Shared Gateway event not canonical");
  if(!timestampByHeight.has(item.blockNumber)){
   timestampByHeight.set(item.blockNumber,
    HEX.test(block.timestamp||"")&&
    BigInt(block.timestamp)<=BigInt(Number.MAX_SAFE_INTEGER)/1000n?
     new Date(Number(BigInt(block.timestamp))*1000).toISOString():null);
  }
  item.sourceBlockAt=timestampByHeight.get(item.blockNumber);
  eventsByRoute.get(route.routeId).push(item);
 }
 let end=byHeight.get(to);
 if(!end){
  end=await rpc(source,"eth_getBlockByNumber",[hex(to),false]);
  if(!end||number(end.number)!==to||!HASH.test(end.hash||""))
   throw Error("Shared source endpoint block unavailable");
 }
 return {from,to,head:confirmed.number,finality:confirmed,
  hash:norm(end.hash),eventsByRoute,reorgRoutes:[]};
}
