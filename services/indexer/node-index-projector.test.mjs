import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {indexedRoutes} from "./transfer-index.mjs";
import {matchNodeSourceRoute,ingestNodeSourcePage} from "./node-index-projector.mjs";

const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url)));
const routes=indexedRoutes(catalog).filter(r=>r.sourceChain==="bsc");
const head=Math.max(10000,...routes.map(r=>r.deploymentBlock))+1000;
const digest=createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
const fresh=Math.floor(Date.now()/1000);
const cover={version:1,source:"bsc",complete:true,state:"complete",
 indexedKnown:true,sourceHeadKnown:true,indexedTo:head,sourceHead:head};
const health={version:2,workerAlive:true,updatedUnix:fresh,routes:routes.map(r=>({
 source:"bsc",destination:r.destinationChain==="xgrchain"?"xgr":r.destinationChain,
 route:"iln_56_1643_"+r.routeId.slice(2),state:"ok",
 sourceHeadKnown:true,scanCursorKnown:true,
 sourceHead:head,scanCursor:head,lastSuccessfulScanUnix:fresh
}))};
function sqlPool(overrides={}){
 const queries=[],row={feed_cursor:"00000000000000000000",
  catalog_sha256:digest,indexed_to:"0"};
 const client={
  query:async query=>{
   const sql=typeof query==="string"?query:query.text;
   queries.push(sql);
   if(sql.includes("SELECT feed_cursor,catalog_sha256,indexed_to"))
    return {rows:[{...row}]};
   if(sql.includes("INSERT INTO xita_transfer_index_cursors"))
    return {rows:[{route_id:routes[0]?.routeId}]};
   if(overrides.fail?.(sql))throw Error("transaction denied");
   return {rows:[],rowCount:1};
  },release:()=>{}
 };
 return {queries,connect:async()=>client};
}
test("canonical Node route matches only exact source, destination and Gateway",()=>{
 assert.ok(routes.length>0,"bsc must have a documented route");
 const r=routes[0];
 const op={source:"bsc",destination:r.destinationChain==="xgrchain"?"xgr":r.destinationChain,
  routeId:r.routeId,gateway:r.gateway};
 assert.equal(matchNodeSourceRoute({routes,op,sourceChain:"bsc"}),r);
 assert.equal(matchNodeSourceRoute({routes,op:{...op,gateway:"0x"+"f".repeat(40)},
  sourceChain:"bsc"}),null);
 assert.equal(matchNodeSourceRoute({routes,op:{...op,source:"base"},
  sourceChain:"bsc"}),null);
});
test("empty finalized Node page atomically establishes SQL cursor without foreign RPC",async()=>{
 const pool=sqlPool(),methods=[];
 const rpc=async(method,params)=>{
  methods.push(method);
  if(method==="xgr_getILNIndexedCoverage")return cover;
  if(method==="xgr_getILNIndexerStatus")return health;
  if(method==="xgr_getILNIndexedOperations"){
   assert.deepEqual(params,["bsc","",100]);
   return {version:1,source:"bsc",operations:[]};
  }
  throw Error("Unexpected RPC: "+method);
 };
 const result=await ingestNodeSourcePage({catalog,pool,rpc,sourceChain:"bsc"});
 assert.equal(result.status,"current");
 assert.equal(result.feedEntries,0);
 assert.ok(pool.queries.includes("BEGIN"));
 assert.ok(pool.queries.includes("COMMIT"));
 assert.ok(pool.queries.some(s=>s.includes("INSERT INTO xita_transfer_index_cursors")));
 assert.deepEqual(methods,["xgr_getILNIndexedCoverage","xgr_getILNIndexerStatus",
  "xgr_getILNIndexedOperations"]);
});
test("missing source route coverage is fail closed before SQL cursor advance",async()=>{
 const pool=sqlPool();
 await assert.rejects(()=>ingestNodeSourcePage({catalog,pool,sourceChain:"bsc",
  rpc:async method=>method==="xgr_getILNIndexedCoverage"?cover:
   {...health,routes:[]}
 }),/missing complete observer coverage/);
 assert.equal(pool.queries.length,0);
});
test("an SQL cursor failure rolls back atomically",async()=>{
 const pool=sqlPool({fail:sql=>sql.includes("INSERT INTO xita_transfer_index_cursors")});
 const rpc=async method=>method==="xgr_getILNIndexedCoverage"?cover:
  method==="xgr_getILNIndexerStatus"?health:
   {version:1,source:"bsc",operations:[]};
 await assert.rejects(()=>ingestNodeSourcePage({catalog,pool,rpc,
  sourceChain:"bsc"}),/transaction denied/);
 assert.ok(pool.queries.includes("ROLLBACK"));
});
