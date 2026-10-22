// Read-only, rate-bounded wallet TX discovery using the Etherscan V2 API
// (Arbiscan/BaseScan). Explorer results are NOT blockchain proofs.
// Every discoverable source tx must be checked against configured XITA
// Gateways, successful receipts, Mailbox Dispatch and finality via canonical RPC.
// This adds no contract, migration, signing, custody, or source TX side effects.
import {configuredGatewayRoutes,findWalletSourceTx} from "../../apps/web/wallet-transfers.js";
import {indexedRoutes,candidateRpc,bindVerifiedTransferRpc} from "./transfer-index.mjs";
const API="https://api.etherscan.io/v2/api";
const ADDRESS=/^0x[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i;
const low=x=>String(x||"").toLowerCase();
const PAGE_SIZE=100,MAX_CANDIDATES=8;
const CACHE_MS=120000,MAX_WALLET_CACHE=128,MAX_CONCURRENT_WALLETS=3;
const MAX_REQUESTS_PER_MINUTE=36;
const cache=new Map(),inflight=new Map(),outbound=[];
function permitted(){
 const now=Date.now();
 while(outbound.length&&outbound[0]<now-60000)outbound.shift();
 if(outbound.length>=MAX_REQUESTS_PER_MINUTE)return false;
 outbound.push(now);return true;
}
export function explorerSourceGroups(catalog,{routes=indexedRoutes(catalog)}={}){
 const groups=new Map();
 for(const route of routes){
  const chainId=route.sourceConfig?.chainId;
  if(route.sourceChain==="xgrchain"||!Number.isSafeInteger(chainId)||chainId<1||
   !ADDRESS.test(route.gateway||"")||!Number.isSafeInteger(route.deploymentBlock))
   continue;
  const existing=groups.get(route.sourceChain)||{sourceChain:route.sourceChain,chainId,
   fromBlock:route.deploymentBlock,routes:[],targets:new Set()};
  if(existing.chainId!==chainId)throw Error("Conflicting deployed source chain IDs");
  existing.fromBlock=Math.min(existing.fromBlock,route.deploymentBlock);
  existing.targets.add(low(route.gateway));
  if(ADDRESS.test(route.executionAdapter||""))existing.targets.add(low(route.executionAdapter));
  existing.routes.push(route);groups.set(route.sourceChain,existing);
 }
 return [...groups.values()].slice(0,6);
}
export async function etherscanAccountPage({chainId,account,action,fromBlock=0,key,
 fetcher=globalThis.fetch,allowRequest=permitted}={}){
 if(!ADDRESS.test(account||"")||!Number.isSafeInteger(chainId)||chainId<1||
  !["txlist","tokentx"].includes(action)||!Number.isSafeInteger(fromBlock)||
  fromBlock<0||typeof key!=="string"||key.length<8||key.length>240)
  throw Error("Invalid explorer discovery parameters");
 if(!allowRequest())throw Error("Explorer discovery rate budget exhausted");
 const url=new URL(API);
 for(const [k,v] of Object.entries({
  chainid:String(chainId),module:"account",action,address:low(account),
  startblock:String(fromBlock),endblock:"9999999999",
  page:"1",offset:String(PAGE_SIZE),sort:"desc",apikey:key
 }))url.searchParams.set(k,v);
 // Fixed HTTPS endpoint and chain ID from the verified local catalog.
 const reply=await fetcher(url.toString(),{method:"GET",credentials:"omit",
  cache:"no-store",headers:{accept:"application/json"},
  signal:AbortSignal.timeout(6000)});
 if(!reply?.ok)throw Error("Explorer API HTTP "+String(reply?.status||"unavailable"));
 const payload=await reply.json();
 if(payload?.status==="0"&&Array.isArray(payload.result)&&
  /no transactions found/i.test(String(payload.message||"")))return {rows:[],truncated:false};
 if(payload?.status!=="1"||!Array.isArray(payload.result)||payload.result.length>PAGE_SIZE)
  throw Error("Explorer API unavailable, unsupported chain or rate limited");
 return {rows:payload.result,truncated:payload.result.length===PAGE_SIZE};
}
export function candidateSourceHashes(account,group,{normal=[],token=[]}={}){
 if(!ADDRESS.test(account||"")||!(group?.targets instanceof Set))
  throw Error("Invalid wallet explorer candidates");
 const wallet=low(account),candidates=new Set();
 const collect=(entries,erc20=false)=>{
  for(const row of entries){
   if(!TX.test(row?.hash||"")||low(row?.from)!==wallet||
    !group.targets.has(low(row?.to)))continue;
   // Explorer claims are only locators. Even explorer "success" must be
   // rechecked with the canonical chain receipt and Gateway events.
   if(!erc20&&row?.isError==="1")continue;
   candidates.add(low(row.hash));
  }
 };
 collect(normal);collect(token,true);
 return [...candidates].slice(0,MAX_CANDIDATES);
}
export async function discoverExplorerWallet({
 catalog,account,key=process.env.XITA_ETHERSCAN_API_KEY,
 fetcher=globalThis.fetch,verify=null,groups=null
}={}){
 if(!ADDRESS.test(account||""))throw Error("Valid wallet required");
 if(!key)return {status:"not-configured",items:[],warnings:[],truncated:false};
 const sources=groups||explorerSourceGroups(catalog);
 if(!sources.length)return {status:"not-supported",items:[],warnings:[],truncated:false};
 const canonical=verify||async(group,txHash)=>{
  const chainRpc=candidateRpc({fetcher});
  return findWalletSourceTx({catalog,account,sourceChain:group.sourceChain,txHash,
   rpc:bindVerifiedTransferRpc(group.routes[0],chainRpc)});
 };
 const items=[],warnings=[],seen=new Set();
 let truncated=false,successfulChains=0;
 for(const group of sources){
  let normal,token;
  try{
   const pages=await Promise.all(["txlist","tokentx"].map(action=>
    etherscanAccountPage({chainId:group.chainId,account,action,
     fromBlock:group.fromBlock,key,fetcher})));
   normal=pages[0].rows;token=pages[1].rows;
   truncated ||= pages.some(x=>x.truncated);
   successfulChains++;
  }catch(error){
   warnings.push({sourceChain:group.sourceChain,
    reason:"Explorer discovery unavailable (plan, network or rate limit)"});
   continue;
  }
  for(const hash of candidateSourceHashes(account,group,{normal,token})){
   const identity=group.sourceChain+":"+hash;
   if(seen.has(identity))continue;
   seen.add(identity);
   if(seen.size>MAX_CANDIDATES*3){truncated=true;break}
   try{
    const verified=await canonical(group,hash);
    if(low(verified?.account)!==low(account)||low(verified?.txHash)!==hash||
     verified.sourceChain!==group.sourceChain||
     verified.status==="source-failed")continue;
    items.push(verified);
   }catch{
    // Explicitly unverified discovery only. NO messageId, NO route claims,
    // NO ability to continue, mint or sign based on explorer data.
    items.push({account:low(account),sourceChain:group.sourceChain,
     txHash:hash,asset:null,destinationChain:null,finalDestinationChain:null,
     confirmed:false,delivered:null,messageId:null,
     status:"explorer-discovered",unverified:true});
   }
  }
 }
 return {status:successfulChains===sources.length?"available":
  successfulChains>0?"partial":"unavailable",items,warnings,truncated};
}
export async function cachedExplorerWallet({catalog,account,
 key=process.env.XITA_ETHERSCAN_API_KEY,now=Date.now(),run=discoverExplorerWallet
}={}){
 if(!ADDRESS.test(account||""))throw Error("Invalid wallet");
 if(!key)return {status:"not-configured",items:[],warnings:[],truncated:false};
 const index=low(account),prior=cache.get(index);
 if(prior&&prior.key===key&&now-prior.at<CACHE_MS)return prior.result;
 if(inflight.has(index))return inflight.get(index);
 if(inflight.size>=MAX_CONCURRENT_WALLETS)
  return prior?.result||{status:"busy",items:[],warnings:[],truncated:false};
 const promise=run({catalog,account,key}).then(result=>{
  // Never erase a previously canonical-verified item on a temporary outage.
  if(result.status==="unavailable"&&prior?.result?.items?.length)return prior.result;
  cache.set(index,{key,at:Date.now(),result});
  if(cache.size>MAX_WALLET_CACHE)cache.delete(cache.keys().next().value);
  return result;
 }).finally(()=>{if(inflight.get(index)===promise)inflight.delete(index)});
 inflight.set(index,promise);
 return promise;
}
export function mergeVerifiedWalletHistory(indexed,discovered,{account,limit=100}={}){
 const wallet=low(account),items=[],seen=new Set();
 for(const item of [...(indexed?.items||[]),...(discovered?.items||[])]){
  const id=low(item?.sourceChain)+":"+low(item?.txHash);
  if(!ADDRESS.test(item?.account||"")||low(item.account)!==wallet||
   !TX.test(item.txHash||"")||seen.has(id))continue;
  seen.add(id);items.push(item);
 }
 // Always prefer the canonical DB projection to explorer hints on duplicates.
 items.sort((a,b)=>Number(b.confirmed===true)-Number(a.confirmed===true));
 const base=indexed||{kind:"xita-wallet-transfer-index-v1",status:"unavailable",
  wallet,items:[],coverage:{complete:false,requiredRoutes:0,indexedRoutes:0,routes:[]}};
 const anyExplorer=discovered?.items?.length>0;
 return {...base,status:base.status==="unavailable"&&anyExplorer?"partial":base.status,
  items:items.slice(0,limit),wallet,
  openCount:Math.max(Number.isSafeInteger(base.openCount)?base.openCount:0,
   items.filter(i=>i.confirmed===true&&
    !["delivered","journey-delivered","source-failed"].includes(i.status)).length),
  discovery:{status:discovered?.status||"not-configured",
   truncated:Boolean(discovered?.truncated),
   warnings:discovered?.warnings||[]}};
}
