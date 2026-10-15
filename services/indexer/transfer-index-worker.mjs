// Standalone finalized-chain event ingestion for the EXISTING XITA indexer DB.
// It writes ONLY the derived xita_transfer_* read-model tables, no live assets.
// Canonical RPC observations are revalidated on reorg and every delivery scan.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";
import {indexedRoutes,readRouteWindow,verifiedTransfer,checkedDelivery,canonicalRpc} from "./transfer-index.mjs";
import {transferWriterPool} from "./transfer-index-store.mjs";
const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const normalize=x=>String(x||"").toLowerCase();
export async function loadCursor(pool,route){
 const result=await pool.query({text:`SELECT source_chain,route_name,gateway,route_id,
 deployment_block,scanned_to,scanned_hash,finalized_head
 FROM xita_transfer_index_cursors WHERE source_chain=$1 AND route_name=$2`,
  values:[route.sourceChain,route.routeName]});
 if(result.rows.length>1)throw Error("Ambiguous transfer cursor");
 const c=result.rows[0];
 if(!c)return null;
 if(normalize(c.gateway)!==normalize(route.gateway)||normalize(c.route_id)!==normalize(route.routeId)||
   Number(c.deployment_block)!==route.deploymentBlock)return {stale:true};
 const scannedTo=Number(c.scanned_to);
 if(!Number.isSafeInteger(scannedTo)||scannedTo<route.deploymentBlock-1)
  throw Error("Invalid persisted transfer cursor");
 return {scannedTo,scannedHash:c.scanned_hash};
}
async function withTransaction(pool,fn){
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const value=await fn(client);
  await client.query("COMMIT");
  return value;
 }catch(error){
  await client.query("ROLLBACK").catch(()=>{});
  throw error;
 }finally{client.release();}
}
export async function resetIndexedRoute({pool,route}){
 await withTransaction(pool,async db=>{
  await db.query({text:"DELETE FROM xita_transfer_operations WHERE source_chain=$1 AND route_name=$2",
   values:[route.sourceChain,route.routeName]});
  await db.query({text:"DELETE FROM xita_transfer_index_cursors WHERE source_chain=$1 AND route_name=$2",
   values:[route.sourceChain,route.routeName]});
 });
}
export async function commitWindow({pool,route,window,records}){
 if(!Array.isArray(records)||records.length!==window.events.length||
   (window.to>=window.from&&!/^0x[0-9a-f]{64}$/i.test(window.hash||"")))
  throw Error("Index window is incomplete");
 return withTransaction(pool,async db=>{
  // Lock the route cursor so overlapping workers cannot commit stale windows.
  const cursorResult=await db.query({text:`SELECT scanned_to,scanned_hash FROM
   xita_transfer_index_cursors WHERE source_chain=$1 AND route_name=$2 FOR UPDATE`,
   values:[route.sourceChain,route.routeName]});
  const previous=cursorResult.rows[0],last=previous?Number(previous.scanned_to):route.deploymentBlock-1;
  if(last!==window.from-1)throw Error("Conflicting transfer index cursor; retry from chain");
  for(let i=0;i<window.events.length;i++){
   const event=window.events[i],record=records[i];
   if(!record||normalize(record.messageId)!==normalize(event.messageId)||
     normalize(record.sourceTxHash)!==normalize(event.txHash)||
     normalize(record.routeId)!==normalize(route.routeId)||
     normalize(record.gateway)!==normalize(route.gateway)||
     normalize(record.account)===""||
     record.sourceChain!==route.sourceChain||record.destinationChain!==route.destinationChain)
    throw Error("Canonical source event and validated operation do not match");
   const params=[
    record.sourceChain,record.messageId,record.sourceTxHash,event.blockNumber,
    event.blockHash,event.logIndex,record.account,record.asset,record.assetId,
    record.routeName,record.routeId,record.gateway,record.destinationChain,
    record.destinationMailbox,record.amountRaw,record.validatorFeeWei,
    record.delivered
   ];
   const row=await db.query({text:`INSERT INTO xita_transfer_operations(
    source_chain,message_id,source_tx_hash,source_block_number,source_block_hash,source_log_index,
    account,asset,asset_id,route_name,route_id,gateway,destination_chain,
    destination_mailbox,amount_raw,validator_fee_wei,delivered,delivery_checked_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
      CASE WHEN $17::boolean IS NULL THEN NULL ELSE NOW() END)
    ON CONFLICT(source_chain,message_id) DO UPDATE SET
      delivered=CASE WHEN xita_transfer_operations.delivered IS TRUE THEN TRUE
       ELSE EXCLUDED.delivered END,
      delivery_checked_at=CASE WHEN EXCLUDED.delivered IS NULL
       THEN xita_transfer_operations.delivery_checked_at ELSE NOW() END
    WHERE xita_transfer_operations.source_tx_hash=EXCLUDED.source_tx_hash AND
      xita_transfer_operations.source_block_hash=EXCLUDED.source_block_hash AND
      xita_transfer_operations.account=EXCLUDED.account AND
      xita_transfer_operations.route_id=EXCLUDED.route_id AND
      xita_transfer_operations.asset_id=EXCLUDED.asset_id
    RETURNING message_id`,values:params});
   if(row.rows.length!==1)throw Error("Conflicting immutable message provenance");
  }
  const scannedTo=window.to<window.from?window.from-1:window.to;
  const scannedHash=window.hash||previous?.scanned_hash||null;
  await db.query({text:`INSERT INTO xita_transfer_index_cursors(
   source_chain,route_name,gateway,route_id,deployment_block,
   scanned_to,scanned_hash,finalized_head,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())
   ON CONFLICT(source_chain,route_name) DO UPDATE SET
   gateway=EXCLUDED.gateway,route_id=EXCLUDED.route_id,
   deployment_block=EXCLUDED.deployment_block,scanned_to=EXCLUDED.scanned_to,
   scanned_hash=EXCLUDED.scanned_hash,finalized_head=EXCLUDED.finalized_head,
   updated_at=NOW()`,
   values:[route.sourceChain,route.routeName,route.gateway,route.routeId,
    route.deploymentBlock,scannedTo,scannedHash,window.finalizedHead]});
  return {indexed:records.length,scannedTo,finalizedHead:window.finalizedHead};
 });
}
export async function scanIndexedRoute({catalog,route,pool,rpc,limit=150}){
 let cursor=await loadCursor(pool,route);
 if(cursor?.stale){await resetIndexedRoute({pool,route});cursor=null;}
 let window=await readRouteWindow({route,cursor,rpc,limit});
 if(window.reorg){
  await resetIndexedRoute({pool,route});
  window=await readRouteWindow({route,cursor:null,rpc,limit});
  if(window.reorg)throw Error("Reorg reset failed");
 }
 const records=[];
 for(const log of window.events){
  const item=await verifiedTransfer({catalog,route,
   transactionHash:log.txHash,rpc});
  if(normalize(item.messageId)!==log.messageId)
   throw Error("Verified source receipt does not contain the indexed message");
  records.push(item);
 }
 return commitWindow({pool,route,window,records});
}
export async function refreshPendingDeliveries({pool,routes,rpc,limit=40}){
 const all=new Map(routes.map(r=>[r.sourceChain+":"+r.routeName,r]));
 const pending=await pool.query({text:`SELECT source_chain,route_name,message_id FROM
 xita_transfer_operations WHERE delivered IS DISTINCT FROM TRUE
 ORDER BY delivery_checked_at ASC NULLS FIRST LIMIT $1`,values:[limit]});
 let checked=0,delivered=0,unknown=0;
 for(const row of pending.rows){
  const route=all.get(row.source_chain+":"+row.route_name);
  if(!route){unknown++;continue;}
  try{
   const result=await checkedDelivery({route,messageId:row.message_id,rpc});
   if(result.delivered===null){unknown++;continue;}
   await pool.query({text:`UPDATE xita_transfer_operations SET
    delivered=$3,delivery_checked_at=NOW()
    WHERE source_chain=$1 AND message_id=$2
      AND delivered IS DISTINCT FROM TRUE`,
    values:[row.source_chain,row.message_id,result.delivered]});
   checked++;if(result.delivered)delivered++;
  }catch{unknown++;}
 }
 return {checked,delivered,unknown};
}
export async function tickTransferIndex({catalog,pool,rpc=canonicalRpc(),blockFor,limit=150}){
 const routes=indexedRoutes(catalog,{blockFor});
 const progress=[];
 for(const route of routes){
  try{progress.push({route:route.routeName,...await scanIndexedRoute({
   catalog,route,pool,rpc,limit})});}
  catch(error){progress.push({route:route.routeName,error:String(error.message||error).slice(0,250)})}
 }
 const destinations=await refreshPendingDeliveries({pool,routes,rpc}).catch(error=>({error:String(error.message||error)}));
 return {routes:progress,destinations};
}
export async function runTransferIndexWorker({intervalMs=12000}={}){
 const pool=await transferWriterPool();
 let running=true;
 process.once("SIGTERM",()=>{running=false;});
 process.once("SIGINT",()=>{running=false;});
 while(running){
  const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
  const start=Date.now();
  const result=await tickTransferIndex({catalog,pool});
  for(const route of result.routes)if(route.error)
   console.error("[xita-transfer-index]",route.route,route.error);
  else if(route.indexed)console.log("[xita-transfer-index]",route.route,"indexed",route.indexed);
  const wait=Math.max(500,intervalMs-(Date.now()-start));
  if(running)await new Promise(resolve=>setTimeout(resolve,wait));
 }
 await pool.end();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runTransferIndexWorker().catch(error=>{
  console.error("XITA transfer index worker failed:",String(error.message||error));
  process.exitCode=1;
 });
}
