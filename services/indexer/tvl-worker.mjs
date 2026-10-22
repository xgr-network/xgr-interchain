// Read-only, token-agnostic escrow snapshot producer. Requires SELECT-only DB.
// One snapshot iteration; no custody keys, writes to EVM or DB, or transfer ops.
import {readFileSync,writeFileSync,renameSync,unlinkSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {indexedRoutes} from "./transfer-index.mjs";
import {transferReaderPool} from "./transfer-index-store.mjs";
import {getCoinGeckoPrices} from "./coingecko.mjs";
import {escrowDescriptor,reconcileEscrow,priceEscrow,verifiedEvidence} from "./tvl-verifier.mjs";
import {verifiedTvlHistory,appendVerifiedTvlHistory} from "./tvl-history.mjs";

const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const RESULT=process.env.XITA_METRICS_EVIDENCE||"/var/lib/xita/verified-tvl.json";
const HISTORY=process.env.XITA_TVL_HISTORY||"/var/lib/xita/verified-tvl-history.json";
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
export async function scanTokenEscrow({catalog,asset,pool,read=rpc,priceSnapshot,now=Date.now(),routeList=null}){
 const d=escrowDescriptor(catalog,asset);
 if(d.status!=="ready")return d;
 if(!d.coingeckoId)return {status:"unavailable",reason:"coingecko-id-unavailable"};
 const routes=routeList||indexedRoutes(catalog);
 // The SQL is a fixed query, untrusted symbols are never concatenated into SQL.
 const observations=await Promise.all([
  pool.query("SELECT source_chain,route_name,gateway,route_id,deployment_block,scanned_to,finalized_head,updated_at FROM xita_transfer_index_cursors"),
  pool.query({text:"SELECT asset,asset_id,source_chain,destination_chain,route_id,gateway,delivered,COUNT(*)::text AS operation_count,COUNT(*) FILTER (WHERE amount_raw IS NULL OR amount_raw<=0 OR source_block_hash IS NULL)::text AS bad_count,COALESCE(SUM(amount_raw),0)::text AS amount_raw,MAX(source_block_number)::text AS max_source_block FROM xita_transfer_operations WHERE asset=$1 GROUP BY asset,asset_id,source_chain,destination_chain,route_id,gateway,delivered",values:[asset]})
 ]);
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
  cursors:observations[0].rows,groups:observations[1].rows,
  routerCode:code,routerBalance:balance,tokenAddress,tokenDecimals,tokenCode,
  pendingBalance,observedHead:head,now});
 if(proof.status!=="verified")return proof;
 return priceEscrow(proof,priceSnapshot?.records?.[d.coingeckoId],{now});
}
export async function tvlSnapshot({catalog,pool,read=rpc,prices=getCoinGeckoPrices,now=Date.now()}){
 const snap=await prices(catalog),routes=indexedRoutes(catalog),proofs={},flows={};
 const names=Object.keys(catalog.assets||{});
 for(const asset of names)try{
  proofs[asset]=await scanTokenEscrow({catalog,asset,pool,read,priceSnapshot:snap,now,routeList:routes});
  if(proofs[asset].status!=="verified")continue;
  // No historical eth_getBlockByNumber or eth_getLogs for dashboard volume.
  // Unknown timing of previously indexed operations MUST NOT become "last 24h".
  flows[asset]={status:"unavailable",reason:"verified-movement-timestamps-not-yet-persisted"};
 }catch(e){proofs[asset]={status:"unavailable",reason:"read-or-verification-error"};}
 return verifiedEvidence(catalog,proofs,now,flows);
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
   const snap=await tvlSnapshot({catalog,pool});
   // Persist only snapshots whose COMPLETE TVL reconciles to verified vaults.
   // Retention, deduplication and monotone timestamps live in tvl-history.mjs.
   const history=appendVerifiedTvlHistory(HISTORY,snap,catalog);
   atomic(RESULT,snap);
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
