// Read-only, token-agnostic escrow snapshot producer. Requires SELECT-only DB.
// One snapshot iteration; no custody keys, writes to EVM or DB, or transfer ops.
import {readFileSync,writeFileSync,renameSync,unlinkSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {indexedRoutes} from "./transfer-index.mjs";
import {transferReaderPool} from "./transfer-index-store.mjs";
import {getCoinGeckoPrices} from "./coingecko.mjs";
import {escrowDescriptor,indexedTvlPosition,reconcileEscrow,priceEscrow,verifiedEvidence} from "./tvl-verifier.mjs";
import {verifiedTvlHistory,appendVerifiedTvlHistory} from "./tvl-history.mjs";
import {indexedGrossFlow24h,indexedGrossFlowLifetime} from "./indexed-flow-24h.mjs";
import {appendVerifiedMovedHistory} from "./total-moved-history.mjs";
import {routeIndexCoverage} from "./transfer-index-store.mjs";
import {indexedEscrowDeltas,combineEscrowHistory} from "./historical-escrow-series.mjs";
import {isDeployedAsset} from "../../apps/web/listing-visibility.js";

const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const RESULT=process.env.XITA_METRICS_EVIDENCE||"/var/lib/xita/verified-tvl.json";
const HISTORY=process.env.XITA_TVL_HISTORY||"/var/lib/xita/verified-tvl-history.json";
const MOVED_HISTORY=process.env.XITA_TOTAL_MOVED_HISTORY||"/var/lib/xita/verified-total-moved-history.json";
const WORD=/^0x[0-9a-f]{64}$/i, HEX=/^0x[0-9a-f]+$/i;
const ERC20_BALANCE="0x70a08231", ERC20_DECIMALS="0x313ce567",ROUTER_TOKEN="0xfc0c546a",NATIVE_PENDING="0x"; // computed via selector below
import {selector} from "../../apps/web/keccak.js";
const PENDING=selector("totalPendingNativeXGR()");
const wordAddress=a=>a.slice(2).toLowerCase().padStart(64,"0");
const codeInt=x=>WORD.test(x||"")?BigInt(x):null;
const fmt=n=>"0x"+BigInt(n).toString(16);
async function rpc(chain,method,params=[],fetcher=fetch){
 const urls=(chain?.rpcUrls||[]).filter(u=>typeof u==="string"&&u.startsWith("https://"));
 if(!Number.isSafeInteger(chain.chainId)||!urls.length)throw Error("No trusted RPC");
 let last;
 for(const url of urls){try{
   const response=await fetcher(url,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(9000)});
   if(!response.ok)throw Error("RPC "+response.status);
   const data=await response.json();
   if(data.error||data.result===undefined||data.result===null)throw Error("Invalid RPC response");
   return data.result;
  }catch(e){last=e;}}
 throw Error("All RPC endpoints unavailable: "+String(last?.message||"unknown"));
}
async function ledgerSnapshot(pool){
 const {rows}=await pool.query(`SELECT
  COALESCE((SELECT json_agg(c) FROM xita_transfer_index_cursors c),'[]') AS cursors,
  COALESCE((SELECT json_agg(g) FROM (
   SELECT asset,asset_id,source_chain,destination_chain,route_id,gateway,delivered,
    COUNT(*)::text AS operation_count,
    COUNT(*) FILTER (WHERE amount_raw IS NULL OR amount_raw<=0 OR source_block_hash IS NULL)::text AS bad_count,
    COALESCE(SUM(amount_raw),0)::text AS amount_raw,MAX(source_block_number)::text AS max_source_block
   FROM xita_transfer_operations
   GROUP BY asset,asset_id,source_chain,destination_chain,route_id,gateway,delivered
  ) g),'[]') AS groups`);
 return rows[0];
}
export async function scanTokenEscrow({catalog,asset,pool,read=rpc,priceSnapshot,now=Date.now(),routeList=null,ledger=null}){
 const d=escrowDescriptor(catalog,asset);
 if(d.status!=="ready")return d;
 if(!d.coingeckoId)return {status:"unavailable",reason:"coingecko-id-unavailable"};
 const routes=routeList||indexedRoutes(catalog);
 // The SQL is a fixed query, untrusted symbols are never concatenated into SQL.
 const observations=ledger||await ledgerSnapshot(pool);
 const readChecked=async(method,params=[])=>read(d.chainConfig,method,params);
 const chainId=await readChecked("eth_chainId");
 if(!HEX.test(chainId)||BigInt(chainId)!==BigInt(d.chainConfig.chainId))
  return {status:"unavailable",reason:"escrow-chain-id-mismatch"};
 const head=await readChecked("eth_blockNumber");
 const code=await readChecked("eth_getCode",[d.router,"latest"]);
 let balance,tokenAddress=null,tokenDecimals=null,tokenCode=null,pendingBalance="0x0";
 if(d.kind==="native"){
  balance=await readChecked("eth_getBalance",[d.router,"latest"]);
  const pending=await readChecked("eth_call",[{to:d.router,data:PENDING},"latest"]);
  if(!WORD.test(pending))return {status:"unavailable",reason:"invalid-native-reserve"};
  pendingBalance="0x"+BigInt(pending).toString(16);
 }else{
  const token=await readChecked("eth_call",[{to:d.router,data:ROUTER_TOKEN},"latest"]);
  if(!WORD.test(token))return {status:"unavailable",reason:"invalid-router-token"};
  tokenAddress="0x"+token.slice(-40);
  tokenCode=await readChecked("eth_getCode",[d.token,"latest"]);
  const decimals=await readChecked("eth_call",[{to:d.token,data:ERC20_DECIMALS},"latest"]);
  if(!WORD.test(decimals)||BigInt(decimals)>36n)return {status:"unavailable",reason:"invalid-erc20-decimals"};
  tokenDecimals=Number(BigInt(decimals));
  const held=await readChecked("eth_call",[{to:d.token,data:ERC20_BALANCE+wordAddress(d.router)},"latest"]);
  if(!WORD.test(held))return {status:"unavailable",reason:"invalid-erc20-balance"};
  balance="0x"+BigInt(held).toString(16);
 }
 const proof=reconcileEscrow({catalog,descriptor:d,indexedRoutes:routes,
  cursors:observations.cursors,groups:observations.groups.filter(g=>g.asset===asset),
  routerCode:code,routerBalance:balance,tokenAddress,tokenDecimals,tokenCode,
  pendingBalance,observedHead:head,now});
 if(proof.status!=="verified")return proof;
 return priceEscrow(proof,priceSnapshot?.records?.[d.coingeckoId],{now});
}
export async function tvlSnapshot({catalog,pool,read=rpc,prices=getCoinGeckoPrices,now=Date.now()}){
 const [snap,ledger]=await Promise.all([prices(catalog),ledgerSnapshot(pool)]);
 const routes=indexedRoutes(catalog),proofs={},flows={},lifetimeFlows={},positions={},historicalAssets=[];
 const expectedHistorical=names.filter(id=>isDeployedAsset(catalog.assets[id],catalog)).length;
 const names=Object.keys(catalog.assets||{});
 for(const asset of names)try{
  const descriptor=escrowDescriptor(catalog,asset);
  if(descriptor.status!=="ready")continue;
  const price=snap.records?.[descriptor.coingeckoId];
  const position=indexedTvlPosition({catalog,descriptor,indexedRoutes:routes,...ledger,now});
  const indexed=priceEscrow(position,price,{now});
  if(indexed.status==="verified")positions[asset]={
   assetId:indexed.assetId,netLockedRaw:indexed.netLockedRaw,
   wrappedByChainRaw:indexed.wrappedByChainRaw,lockedUsd:indexed.lockedUsd
  };
  // The periodic physical check is restricted to the XGR hub. Foreign
  // collateral estimates are published only as indexed ledger positions.
  if(descriptor.chainConfig.chainId!==1643){
   proofs[asset]={status:"unavailable",reason:"physical-vault-not-checked"};
  }else{
   proofs[asset]=await scanTokenEscrow({catalog,asset,pool,read,priceSnapshot:snap,now,routeList:routes,ledger});
  }
  try{
   const needed=routes.filter(r=>descriptor.escrowRoutes.some(e=>e.source===r.sourceChain&&e.routeId.toLowerCase()===r.routeId.toLowerCase()));
   const coverage=routeIndexCoverage(catalog,ledger.cursors,{now,maxAgeMs:120000,routeList:needed});
   // Query only current SQL index: NEVER repeat historical RPC reads for volume.
   const events=await pool.query({text:`SELECT asset,asset_id,source_chain,destination_chain,route_id,gateway,
       message_id,source_block_hash,amount_raw::text AS amount_raw,delivered,
       source_block_at,escrow_outflow_observed_at,source_indexed_at,delivery_checked_at
     FROM xita_transfer_operations WHERE asset=$1 AND
       (source_chain=$2 OR destination_chain=$2)`,values:[asset,descriptor.chain]});
   flows[asset]=indexedGrossFlow24h({descriptor,rows:events.rows,coverage,
     price:snap.records?.[descriptor.coingeckoId],now});
   lifetimeFlows[asset]=indexedGrossFlowLifetime({descriptor,rows:events.rows,coverage});
   historicalAssets.push(indexedEscrowDeltas({descriptor,rows:events.rows,coverage,
    position,price,now}));
  }catch(e){flows[asset]={status:"unavailable",reason:"indexed-flow-read-unavailable"};
   lifetimeFlows[asset]={status:"unavailable",reason:"indexed-flow-read-unavailable"};}
 }catch(e){proofs[asset]={status:"unavailable",reason:"read-or-verification-error"};}
 return {...verifiedEvidence(catalog,proofs,now,flows),lifetimeFlows,
  reconstructedHistory:expectedHistorical===historicalAssets.length?
   combineEscrowHistory(historicalAssets,{now}):{status:"unavailable",reason:"asset-history-incomplete"},
  indexedTvl:{kind:"xita-indexed-tvl-v1",positions}};
}
function atomic(path,payload){
 const tmp=path+".tmp."+process.pid;
 try{writeFileSync(tmp,JSON.stringify(payload)+"\n",{mode:0o600});renameSync(tmp,path);}
 finally{if(existsSync(tmp))unlinkSync(tmp);}
}
export async function runTVL({interval=60000}={}){
 const pool=await transferReaderPool();
 if(!pool)throw Error("XITA_INDEXER_DATABASE_URL required");
 let run=true;process.once("SIGTERM",()=>run=false);process.once("SIGINT",()=>run=false);
 while(run){
  try{
   const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
   const prices=await getCoinGeckoPrices(catalog);
   const snap=await tvlSnapshot({catalog,pool,prices:async()=>prices});
   // Persist only snapshots whose COMPLETE TVL reconciles to verified vaults.
   // Retention, deduplication and monotone timestamps live in tvl-history.mjs.
   appendVerifiedTvlHistory(HISTORY,snap,catalog);
   // Cumulative display persistence must not interrupt the existing live TVL
   // or 24h index snapshots if the optional history file is unavailable.
   try{appendVerifiedMovedHistory(MOVED_HISTORY,snap,catalog,prices);}
   catch(e){console.error("[xita-tvl] total-moved history unavailable",String(e.message||e).slice(0,100));}
   // Do not expose unbounded per-operation raw values in the public evidence.
   const {lifetimeFlows:ignored,...publicSnap}=snap;
   atomic(RESULT,publicSnap);
   console.log("[xita-tvl] verified assets:",Object.keys(snap.assets).join(",")||"none");
  }catch(e){
   if(existsSync(RESULT))unlinkSync(RESULT);
   console.error("[xita-tvl] evidence unavailable",String(e.message||e).slice(0,160));
  }
  if(run)await new Promise(done=>setTimeout(done,interval));
 }
 await pool.end();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 runTVL().catch(e=>{console.error(e.message);process.exitCode=1;});
