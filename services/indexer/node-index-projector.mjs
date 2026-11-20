// XGR Node -> PostgreSQL only. No external-chain RPC clients or log
// scanners; receipts are checked with the existing canonical wallet verifier.
// This process cannot submit, sign, unlock, mint or change chain state.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {indexedRoutes} from "./transfer-index.mjs";
import {storeVerifiedOperation} from "./transfer-index-write.mjs";
import {projectXgrIndexedSource} from "./xgr-node-index-source.mjs";
import {refreshNodeIndexedDeliveries} from "./xgr-node-index-delivery.mjs";
import {tickNodeIndexedGas,tickNodeIndexedOnwardGas} from "./xgr-node-index-gas.mjs";
import {makeNodeIndexRpc,nodeChainName} from "../../tools/verify-node-index-parity.mjs";
import {transferWriterPool} from "./transfer-index-store.mjs";

const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const ZERO_CURSOR="00000000000000000000";
const FEED_LIMIT=100;
const normal=s=>String(s||"").toLowerCase();
const validCursor=s=>typeof s==="string"&&/^[0-9]{20}$/.test(s);
const catalogDigest=catalog=>createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
const sleep=ms=>new Promise(done=>setTimeout(done,ms));

function canonicalSourceRoutes(catalog,sourceChain){
 return indexedRoutes(catalog).filter(r=>r.sourceChain===sourceChain);
}
export function matchNodeSourceRoute({routes,op,sourceChain}){
 if(!op||nodeChainName(sourceChain)!==op.source)return null;
 const matched=routes.filter(r=>r.sourceChain===sourceChain&&
  nodeChainName(r.destinationChain)===op.destination&&
  normal(r.routeId)===normal(op.routeId)&&
  normal(r.gateway)===normal(op.gateway));
 if(matched.length>1)throw Error("Ambiguous Node Gateway route identity");
 return matched[0]||null;
}
async function nodeCoverage(rpc,sourceChain){
 const source=nodeChainName(sourceChain);
 const c=await rpc("xgr_getILNIndexedCoverage",[source]);
 if(c?.version!==1||c.source!==source||c.complete!==true||
   c.state!=="complete"||c.sourceHeadKnown!==true||
   c.indexedKnown!==true||!Number.isSafeInteger(c.indexedTo)||
   !Number.isSafeInteger(c.sourceHead)||c.indexedTo!==c.sourceHead)
  throw Error("XGR Node source history incomplete: "+source);
 return c;
}
async function inTransaction(pool,fn){
 const db=await pool.connect();
 try{
  await db.query("BEGIN");
  const result=await fn(db);
  await db.query("COMMIT");
  return result;
 }catch(error){await db.query("ROLLBACK").catch(()=>{});throw error}
 finally{db.release()}
}
async function cursorState(pool,sourceChain,hash){
 return inTransaction(pool,async db=>{
  await db.query({text:`INSERT INTO xita_node_index_cursors
    (source_chain,feed_cursor,catalog_sha256) VALUES($1,$2,$3)
    ON CONFLICT(source_chain) DO NOTHING`,values:[sourceChain,ZERO_CURSOR,hash]});
  const result=await db.query({text:`SELECT feed_cursor,catalog_sha256,indexed_to
   FROM xita_node_index_cursors WHERE source_chain=$1 FOR UPDATE`,values:[sourceChain]});
  if(result.rows.length!==1)throw Error("Missing persisted Node source cursor");
  const row=result.rows[0];
  if(row.catalog_sha256!==hash){
   // Catalog addition requires a full (cheap, XGR-only) feed replay.
   await db.query({text:`UPDATE xita_node_index_cursors SET
    feed_cursor=$2,indexed_to=0,catalog_sha256=$3,updated_at=NOW()
    WHERE source_chain=$1`,values:[sourceChain,ZERO_CURSOR,hash]});
   return ZERO_CURSOR;
  }
  if(!validCursor(row.feed_cursor))throw Error("Invalid persisted Node feed cursor");
  return row.feed_cursor;
 });
}
export async function ingestNodeSourcePage({catalog,pool,rpc,sourceChain,
 pageLimit=FEED_LIMIT}={}){
 if(!catalog||!pool||typeof rpc!=="function"||
    !Number.isInteger(pageLimit)||pageLimit<1||pageLimit>100)
  throw Error("Invalid Node source projection");
 const routes=canonicalSourceRoutes(catalog,sourceChain);
 if(!routes.length)return {sourceChain,status:"not-configured",indexed:0};
 const coverage=await nodeCoverage(rpc,sourceChain);
 // A source-wide cursor does not establish that EACH configured Gateway is
 // registered in the Node observer. Require explicit fresh per-route health.
 const routeHealth=await rpc("xgr_getILNIndexerStatus",[]);
 if(routeHealth?.version!==2||routeHealth.workerAlive!==true||
    !Array.isArray(routeHealth.routes)||
    !Number.isSafeInteger(routeHealth.updatedUnix)||
    Math.abs(Date.now()/1000-routeHealth.updatedUnix)>120)
  throw Error("Node independent route observer is stale");
 for(const route of routes){
  const suffix="_"+route.routeId.slice(2).toLowerCase();
  const matched=routeHealth.routes.filter(r=>
   r.source===nodeChainName(sourceChain)&&
   r.destination===nodeChainName(route.destinationChain)&&
   typeof r.route==="string"&&r.route.toLowerCase().endsWith(suffix));
  if(matched.length!==1||!matched[0].sourceHeadKnown||
     !matched[0].scanCursorKnown||
     matched[0].state!=="ok"||
     matched[0].sourceHead<coverage.indexedTo||
     matched[0].scanCursor<coverage.indexedTo||
     !Number.isSafeInteger(matched[0].lastSuccessfulScanUnix)||
     Math.abs(Date.now()/1000-matched[0].lastSuccessfulScanUnix)>120)
   throw Error("Node missing complete observer coverage for "+route.routeName);
 }
 const hash=catalogDigest(catalog);
 const startCursor=await cursorState(pool,sourceChain,hash);
 const source=nodeChainName(sourceChain);
 const page=await rpc("xgr_getILNIndexedOperations",[source,
  startCursor===ZERO_CURSOR?"":startCursor,pageLimit]);
 if(page?.version!==1||page.source!==source||!Array.isArray(page.operations)||
   page.operations.length>pageLimit)
  throw Error("Invalid XGR Node source page");
 let previous=startCursor;
 const rows=[];
 const seen=new Set();
 for(const op of page.operations){
  if(op?.source!==source||op.evidenceStatus!=="UNTRUSTED_FINALITY_BOUNDED_HINT"||
    !validCursor(op.cursor)||op.cursor<=previous||
    !Number.isSafeInteger(op.sourceBlockNumber)||
    op.sourceBlockNumber>coverage.indexedTo||
    !/^0x[0-9a-f]{64}$/i.test(op.messageId||"")||
    !/^0x[0-9a-f]{64}$/i.test(op.sourceTxHash||"")||
    seen.has(normal(op.messageId)))
   throw Error("Non-monotonic or unfinalized Node source feed");
  seen.add(normal(op.messageId));
  previous=op.cursor;
  const route=matchNodeSourceRoute({routes,op,sourceChain});
  if(!route)continue; // permissionless routes outside this XITA catalog
  if(op.sourceBlockNumber<route.deploymentBlock)
   throw Error("Node operation predates immutable Gateway deployment");
  const evidence=await rpc("xgr_getILNIndexedSourceReceipt",[source,op.messageId]);
  const projected=await projectXgrIndexedSource({catalog,operation:op,
   evidence,xgrRpc:rpc});
  if(projected.route.sourceChain!==sourceChain||
    normal(projected.event.messageId)!==normal(op.messageId))
   throw Error("Node source identity failed XITA verification");
  rows.push(projected);
 }
 if(page.nextCursor&&(page.nextCursor!==previous||
     page.operations.length!==pageLimit))
  throw Error("Invalid Node source feed continuation");
 const endCursor=previous;
 await inTransaction(pool,async db=>{
  const status=await db.query({text:`SELECT feed_cursor,catalog_sha256,indexed_to
   FROM xita_node_index_cursors WHERE source_chain=$1 FOR UPDATE`,
   values:[sourceChain]});
  if(status.rows.length!==1||status.rows[0].feed_cursor!==startCursor||
     status.rows[0].catalog_sha256!==hash)
   throw Error("Concurrent Node index projection or catalog change");
  for(const {route,record,event} of rows){
   await storeVerifiedOperation(db,{route,record,event});
  }
  // Only ALL known events from the stable completed page were verified. A
  // full page may have another page: do not claim source-wide cursor coverage.
  const pageComplete=!page.nextCursor;
  if(pageComplete){
   for(const route of routes){
    if(coverage.indexedTo<route.deploymentBlock-1)
     throw Error("Node source index precedes route deployment");
    const saved=await db.query({text:`INSERT INTO xita_transfer_index_cursors
      (source_chain,route_name,gateway,route_id,deployment_block,
       scanned_to,scanned_hash,finalized_head,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,NULL,$6,NOW())
      ON CONFLICT(source_chain,route_id) DO UPDATE SET
       gateway=EXCLUDED.gateway,route_name=EXCLUDED.route_name,
       scanned_to=EXCLUDED.scanned_to,
       finalized_head=EXCLUDED.finalized_head,updated_at=NOW()
      WHERE xita_transfer_index_cursors.gateway=EXCLUDED.gateway
        AND xita_transfer_index_cursors.deployment_block=EXCLUDED.deployment_block
        AND xita_transfer_index_cursors.scanned_to<=EXCLUDED.scanned_to
      RETURNING route_id`,
     values:[sourceChain,route.routeName,route.gateway,route.routeId,
      route.deploymentBlock,coverage.indexedTo]});
    if(saved.rows.length!==1)throw Error("Node route cursor conflicts with deployed Gateway");
   }
  }
  await db.query({text:`UPDATE xita_node_index_cursors SET
    feed_cursor=$2,indexed_to=$3,updated_at=NOW()
    WHERE source_chain=$1 AND feed_cursor=$4`,values:[
     sourceChain,endCursor,pageComplete?coverage.indexedTo:
      Number(status.rows[0].indexed_to),startCursor]});
 });
 return {sourceChain,status:page.nextCursor?"catching-up":"current",
  indexed:rows.length,feedEntries:page.operations.length,
  feedCursor:endCursor,indexedTo:coverage.indexedTo};
}
export async function tickNodeIndexProjection({catalog,pool,rpc,gasProjection=null}={}){
 const routes=indexedRoutes(catalog);
 const sources=[...new Set(routes.map(r=>r.sourceChain))];
 const indexes=[];
 for(const sourceChain of sources){
  try{indexes.push(await ingestNodeSourcePage({catalog,pool,rpc,sourceChain}));}
  catch(error){indexes.push({sourceChain,
   error:String(error?.message||error).slice(0,200)})}
 }
 const delivery=await refreshNodeIndexedDeliveries({pool,routes,rpc})
  .catch(error=>({error:String(error?.message||error).slice(0,200)}));
 const gas=gasProjection?
  await gasProjection({catalog,pool,rpc}).catch(error=>({error:String(error?.message||error).slice(0,200)})):
  {status:"not-installed"};
 return {indexes,delivery,gas};
}
export async function runNodeIndexProjector({intervalMs=20000}={}){
 if(!Number.isInteger(intervalMs)||intervalMs<5000)throw Error("Invalid Node projection interval");
 const url=process.env.XITA_XGR_INDEX_RPC_URL;
 const rpc=makeNodeIndexRpc({url});
 const pool=await transferWriterPool();
 let lastGasAt=0;
 let running=true;
 process.once("SIGTERM",()=>{running=false});
 process.once("SIGINT",()=>{running=false});
 try{
  while(running){
   const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
   const now=Date.now();
   const gasProjection=now-lastGasAt>=60000?async args=>{
    const [delivery,onward]=await Promise.all([
     tickNodeIndexedGas(args),tickNodeIndexedOnwardGas(args)]);
    return {delivery,onward};
   }:null;
   if(gasProjection)lastGasAt=now;
   const result=await tickNodeIndexProjection({catalog,pool,rpc,gasProjection});
   for(const item of result.indexes){
    if(item.error)console.warn("[xita-node-index]",item.sourceChain,item.error);
    else if(item.indexed)console.log("[xita-node-index]",item.sourceChain,"indexed",item.indexed);
   }
   if(result.delivery.error)console.warn("[xita-node-delivery]",result.delivery.error);
   if(result.gas.error)console.warn("[xita-node-gas]",result.gas.error);
   if(running)await sleep(intervalMs);
  }
 }finally{await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runNodeIndexProjector().catch(error=>{
  console.error("XITA Node index projector stopped:",String(error.message||error));
  process.exitCode=1;
 });
}
