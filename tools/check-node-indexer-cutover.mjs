// Production cutover preflight: read-only XGR RPC + old SQL parity.
// No external-chain RPC, signing key, contract writes or systemctl changes.
// Exit nonzero on incomplete source history, open deliveries or escrow proof.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {indexedRoutes} from "../services/indexer/transfer-index.mjs";
import {transferReaderPool} from "../services/indexer/transfer-index-store.mjs";
import {compareNodeIndexToXita,makeNodeIndexRpc,nodeChainName}
 from "./verify-node-index-parity.mjs";
import {verifyIndexedDelivery} from "../services/indexer/xgr-node-index-delivery.mjs";
import {createNodeIndexedEscrowReader} from "../services/indexer/xgr-node-index-escrow.mjs";
import {tvlSnapshot} from "../services/indexer/tvl-worker.mjs";

const ROOT=resolve(fileURLToPath(new URL("..",import.meta.url)));
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const MAX_TRANSFER_ROWS=10000;
export async function checkNodeIndexerCutover({catalog,pool,rpc,verifyTvl=tvlSnapshot}={}){
 if(!catalog||!pool||typeof rpc!=="function")throw Error("Missing cutover dependencies");
 const routes=indexedRoutes(catalog);
 if(!routes.length)throw Error("No active receipt-reviewed routes");
 const sources=[...new Set(routes.map(r=>r.sourceChain))];
 const parity=[];
 for(const sourceChain of sources){
  const result=await compareNodeIndexToXita({catalog,pool,rpc,sourceChain});
  parity.push(result);
  if(!result.complete)throw Error("Unproven Node source parity: "+sourceChain);
 }
 const rows=await pool.query({text:`SELECT source_chain,message_id,route_id,
  destination_chain,destination_mailbox,delivered,
  destination_checked_block,destination_checked_hash
  FROM xita_transfer_operations ORDER BY source_indexed_at LIMIT $1`,
  values:[MAX_TRANSFER_ROWS+1]});
 if(rows.rows.length>MAX_TRANSFER_ROWS)throw Error("Unbounded transfer history");
 const byRoute=new Map(routes.map(r=>[r.sourceChain+"|"+r.routeId.toLowerCase(),r]));
 let delivered=0,pending=0,unknown=0;
 for(const row of rows.rows){
  const route=byRoute.get(row.source_chain+"|"+String(row.route_id).toLowerCase());
  if(!route)continue; // orphaned historic routes not active in catalog
  if(row.destination_chain!==route.destinationChain||
    !same(row.destination_mailbox,route.destinationMailbox))
   throw Error("Conflicting canonical destination route");
  const evidence=await rpc("xgr_getILNIndexedDelivery",[
   nodeChainName(row.source_chain),row.message_id]);
  const result=verifyIndexedDelivery({route,messageId:row.message_id,evidence});
  if(row.delivered===true){
   if(result.delivered!==true||
      Number(row.destination_checked_block)>result.finalizedHead)
    throw Error("Delivered transfer differs from Node finalized state");
   delivered++;
  }else if(row.delivered===false){
   if(result.delivered!==false)throw Error("Open transfer delivery parity mismatch");
   pending++;
  }else{
   // SQL UNKNOWN stays unknown; a Node observation is never fabricated.
   unknown++;
  }
 }
 const escrowRead=await createNodeIndexedEscrowReader({catalog,rpc});
 const tvl=await verifyTvl({catalog,pool,read:escrowRead});
 if(tvl?.kind!=="xita-asset-metrics-v1"||tvl.schemaVersion!==1||
    !tvl.custodyEvidence||
    !Object.keys(tvl.assets||{}).length)
  throw Error("Verified TVL from Node escrow snapshots unavailable");
 const missing=Object.entries(tvl.assets||{}).filter(([,v])=>
  v.status!=="verified");
 if(missing.length)throw Error("Node escrow custody/price parity incomplete: "+
  missing.map(([asset])=>asset).join(","));
 return {ready:true,sourceChains:sources.length,parity,
  delivered,pending,unknown,verifiedAssets:Object.keys(tvl.assets).length};
}
async function main(){
 const rpc=makeNodeIndexRpc({url:process.env.XITA_XGR_INDEX_RPC_URL});
 const pool=await transferReaderPool();
 if(!pool)throw Error("XITA_INDEXER_DATABASE_URL required");
 try{
  const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
  const result=await checkNodeIndexerCutover({catalog,pool,rpc});
  console.log(JSON.stringify(result,null,2));
 }finally{await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(err=>{
  console.error("NODE INDEX CUTOVER NOT APPROVED:",String(err?.message||err));
  process.exitCode=2;
 });
}
