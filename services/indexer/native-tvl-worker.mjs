// Standalone, read-only finalized XGR native escrow/price verifier.
// No wallet keys, transaction writes, DB writes, minting, or archive-state eth_call.
// Only use with dedicated read-only DB role and vetted RPC URLs.
import {readFileSync,writeFileSync,renameSync,unlinkSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {indexedRoutes} from "./transfer-index.mjs";
import {transferReaderPool} from "./transfer-index-store.mjs";
import {getCoinGeckoPrices} from "./coingecko.mjs";
import {reconcileNativeEscrow,pricedNativeEscrow} from "./native-tvl.mjs";
import {keccak256} from "../../apps/web/keccak.js";

const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const RESULT=process.env.XITA_METRICS_EVIDENCE||"/var/lib/xita/native-tvl-evidence.json";
const Q=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
function safeBlock(value){
 if(!Q.test(value||"")||BigInt(value)>BigInt(Number.MAX_SAFE_INTEGER))throw Error("invalid RPC block");
 return Number(BigInt(value));
}
export async function rpcRead(chain,method,params=[],fetcher=fetch){
 const urls=chain?.rpcUrls?.filter(url=>typeof url==="string"&&url.startsWith("https://"))||[];
 if(!urls.length||!Number.isSafeInteger(chain.chainId))throw Error("trusted chain RPC not configured");
 let last;
 for(const url of urls){
  try{
   const response=await fetcher(url,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(8500)});
   if(!response.ok)throw Error("HTTP "+response.status);
   const data=await response.json();
   if(data?.error||data?.result===undefined||data?.result===null)throw Error("RPC failure");
   return data.result;
  }catch(error){last=error;}
 }
 throw Error("All configured RPC reads failed: "+String(last?.message||"unknown"));
}
export async function verifyXGRLiquidity({catalog,pool,read=rpcRead,prices=getCoinGeckoPrices,now=Date.now()}){
 const source=catalog?.chains?.xgrchain;
 if(!source)return {status:"unavailable",reason:"missing-canonical-chain"};
 const routeList=indexedRoutes(catalog).filter(r=>r.asset==="XGR");
 // Use a single pinned RPC endpoint and verify chainId; no historical state.
 const chainId=await read(source,"eth_chainId",[]);
 if(safeBlock(chainId)!==source.chainId)throw Error("XGR RPC chain ID mismatch");
 const head=safeBlock(await read(source,"eth_blockNumber",[]));
 const observations=await Promise.all([
  pool.query("SELECT source_chain,route_name,gateway,route_id,deployment_block,scanned_to,finalized_head,updated_at FROM xita_transfer_index_cursors"),
  pool.query("SELECT asset,source_chain,route_id,gateway,message_id,source_block_hash,source_block_number,amount_raw::text AS amount_raw,delivered FROM xita_transfer_operations"),
 ]);
 const router=catalog.assets?.XGR?.deployment?.representations?.find(r=>r.chain==="xgrchain"&&r.component==="nativeRouter");
 if(!router?.address)return {status:"unavailable",reason:"native-router-not-deployed"};
 const [code,balance]=await Promise.all([
  read(source,"eth_getCode",[router.address,"latest"]),
  read(source,"eth_getBalance",[router.address,"latest"])
 ]);
 const confirmedHead=head-Math.max(1,Number(source.confirmations||1));
 const xgrCursors=observations[0].rows.filter(c=>c.source_chain==="xgrchain");
 // Avoid claiming a finalized snapshot while unindexed live blocks exist.
 if(xgrCursors.some(c=>Number(c.scanned_to)<confirmedHead))
  return {status:"unavailable",reason:"source-finality-index-lag"};
 const proof=reconcileNativeEscrow({catalog,cursors:observations[0].rows,
  operations:observations[1].rows,routeList,routerAddress:router.address,
  routerCode:code,routerBalance:balance,observedAt:new Date(now).toISOString(),now});
 if(proof.status!=="verified")return proof;
 const snapshot=await prices(catalog);
 const market=snapshot?.records?.[catalog.assets.XGR.profile?.market?.coingeckoId];
 if(!market||Math.abs(now-Date.parse(market.asOf))>300000)
  return {status:"unavailable",reason:"fresh-coingecko-price-unavailable"};
 return pricedNativeEscrow(proof,market);
}
export function publicationEvidence(catalog,proof,now=Date.now()){
 if(proof?.status!=="verified"||!Number.isFinite(Date.parse(proof.asOf))||
  now-Date.parse(proof.asOf)>120000||now<Date.parse(proof.asOf)-30000)return null;
 const digest=keccak256(JSON.stringify({assetId:proof.assetId,lockedUsd:proof.lockedUsd,
  router:proof.escrowRouter,codeHash:proof.codeHash,at:proof.asOf,priceAsOf:proof.priceAsOf}));
 return {XGR:{assetId:proof.assetId,lockedUsd:proof.lockedUsd,
  verified:true,complete:true,valuationVerified:true,proofDigest:digest,asOf:proof.asOf}};
}
export function metricsEvidence(catalog,proof){
 if(proof?.status!=="verified")return null;
 return {schemaVersion:1,kind:"xita-asset-metrics-v1",assets:{
  XGR:{assetId:"XGR",verified:true,asOf:proof.asOf,
    market:{status:"market-data",source:"coingecko",priceUsd:proof.priceUsd,
     marketCapUsd:null,circulating:0,asOf:proof.priceAsOf},
    custody:{status:"verified",complete:true,lockedUsd:Number(proof.lockedUsd),
      vaults:[{verified:true,chain:"xgrchain",router:proof.escrowRouter,
       netLockedRaw:proof.netLockedRaw,valueUsd:Number(proof.lockedUsd)}]},
    movement:{status:"unavailable"}}}};
}
export function writeEvidenceAtomic(path,payload){
 const tmp=path+".tmp."+process.pid;
 try{
  writeFileSync(tmp,JSON.stringify(payload)+"\n",{mode:0o600});
  renameSync(tmp,path);
 }finally{if(existsSync(tmp))unlinkSync(tmp);}
}
export async function runNativeTVL({intervalMs=60000}={}){
 const pool=await transferReaderPool();
 if(!pool)throw Error("XITA_INDEXER_DATABASE_URL required");
 let running=true;process.once("SIGTERM",()=>{running=false;});
 process.once("SIGINT",()=>{running=false;});
 while(running){
  let verified=null;
  try{
   const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
   const proof=await verifyXGRLiquidity({catalog,pool});
   if(proof.status==="verified"){
    verified={...metricsEvidence(catalog,proof),nativeTvl:{proof,positions:publicationEvidence(catalog,proof)}};
    console.log("[xita-tvl] verified native XGR escrow",proof.netLockedRaw);
   }else console.warn("[xita-tvl]",proof.reason);
  }catch(error){console.error("[xita-tvl] unavailable",String(error.message||error).slice(0,200));}
  if(verified)writeEvidenceAtomic(RESULT,verified);
  else if(existsSync(RESULT))unlinkSync(RESULT);
  if(running)await new Promise(ok=>setTimeout(ok,intervalMs));
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 runNativeTVL().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
