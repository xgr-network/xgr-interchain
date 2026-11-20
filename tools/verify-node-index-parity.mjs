// Read-only migration gate. Do not remove XITA's canonical source readers until
// this reports exact identity parity and complete Node source-index coverage.
// All transport calls are to ONE XGR RPC, never directly to an external chain.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {indexedRoutes} from "../services/indexer/transfer-index.mjs";
import {transferReaderPool} from "../services/indexer/transfer-index-store.mjs";

const ROOT=resolve(fileURLToPath(new URL("..",import.meta.url)));
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const lower=s=>String(s||"").toLowerCase();
const NODE_CHAIN_NAMES={xgrchain:"xgr"};
const MAX_PAGES=10000, PAGE_SIZE=100;
export function nodeChainName(source){return NODE_CHAIN_NAMES[source]||source;}

export function makeNodeIndexRpc({url,fetcher=globalThis.fetch}={}){
 if(typeof url!=="string")throw Error("XITA_XGR_INDEX_RPC_URL is required");
 const parsed=new URL(url);
 if(!["https:","http:"].includes(parsed.protocol)||
   parsed.username||parsed.password||parsed.hash||
   (parsed.protocol==="http:"&&!["127.0.0.1","localhost","::1"].includes(parsed.hostname)))
  throw Error("XGR index RPC must use HTTPS or loopback HTTP");
 let nextId=0;
 return async(method,params)=>{
  if(!/^(?:xgr_getILN(?:Indexed(?:Coverage|Operations|SourceReceipt|Delivery|Escrow|Gas)|IndexerStatus)|eth_(?:chainId|blockNumber|getCode|getBalance|getBlockByNumber|getTransactionByHash|getTransactionReceipt|call))$/.test(method))
   throw Error("Unexpected XGR index RPC method");
  const requestId=++nextId;
  const response=await fetcher(url,{method:"POST",
   headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:requestId,method,params}),
   signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("XGR index RPC HTTP "+response.status);
  const msg=await response.json();
  if(msg?.id!==requestId||msg?.error||msg?.result===undefined)
   throw Error("XGR index RPC did not return canonical result");
  return msg.result;
 };
}

export async function readCompleteNodeSource({source,rpc,maxPages=MAX_PAGES}){
 if(!/^[a-z][a-z0-9-]{0,39}$/.test(source)||typeof rpc!=="function")
  throw Error("Invalid node index source");
 const cover=await rpc("xgr_getILNIndexedCoverage",[source]);
 if(cover?.version!==1||cover.source!==source||cover.complete!==true||
   cover.state!=="complete"||cover.indexedKnown!==true||
   cover.sourceHeadKnown!==true||!Number.isSafeInteger(cover.sourceHead)||
   !Number.isSafeInteger(cover.indexedTo)||cover.indexedTo<cover.sourceHead)
  throw Error("Node index incomplete or stale for "+source);
 const operations=new Map();
 let cursor="",pages=0;
 while(true){
  if(++pages>maxPages)throw Error("Node index page budget exhausted");
  const data=await rpc("xgr_getILNIndexedOperations",[source,cursor,PAGE_SIZE]);
  if(data?.version!==1||data.source!==source||!Array.isArray(data.operations)||
     data.operations.length>PAGE_SIZE)throw Error("Malformed Node index page");
  let previous=cursor;
  for(const op of data.operations){
   if(op?.source!==source||op.evidenceStatus!=="UNTRUSTED_FINALITY_BOUNDED_HINT"||
      !HASH.test(op.messageId||"")||!HASH.test(op.sourceTxHash||"")||
      !HASH.test(op.routeId||"")||!ADDRESS.test(op.gateway||"")||
      !Number.isSafeInteger(op.sourceBlockNumber)||op.sourceBlockNumber<1||
      typeof op.cursor!=="string"||!/^[0-9]{20}$/.test(op.cursor)||
      op.cursor<=previous||operations.has(lower(op.messageId)))
    throw Error("Node index feed is not monotone or has ambiguous data");
   previous=op.cursor;
   operations.set(lower(op.messageId),op);
  }
  if(!data.nextCursor){
   break;
  }
  if(data.nextCursor!==previous||data.operations.length!==PAGE_SIZE)
   throw Error("Invalid Node index page cursor");
  cursor=data.nextCursor;
 }
 return {coverage:cover,operations};
}
export async function compareNodeIndexToXita({catalog,pool,rpc,sourceChain}){
 const routes=indexedRoutes(catalog).filter(r=>r.sourceChain===sourceChain);
 if(!routes.length)throw Error("No documented source routes for "+sourceChain);
 const nodeSource=nodeChainName(sourceChain);
 const node=await readCompleteNodeSource({source:nodeSource,rpc});
 const pairs=new Map(routes.map(r=>[lower(r.routeId),r]));
 const db=await pool.query({text:`SELECT source_chain,message_id,route_id,gateway,
   source_tx_hash,source_block_number FROM public.xita_transfer_operations
   WHERE source_chain=$1`,values:[sourceChain]});
 const cursors=await pool.query({text:`SELECT route_id,scanned_to
   FROM public.xita_transfer_index_cursors WHERE source_chain=$1`,
  values:[sourceChain]});
 const indexedSource=new Map([...node.operations].filter(([,op])=>
  pairs.has(lower(op.routeId))));
 let matched=0,missingInNode=0,missingInXita=0,mismatched=0,unknownRoutes=0;
 const seen=new Set();
 for(const row of db.rows){
  const route=pairs.get(lower(row.route_id));
  if(!route)continue;
  const id=lower(row.message_id);
  if(seen.has(id))throw Error("Duplicate XITA message identity");
  seen.add(id);
  const op=indexedSource.get(id);
  if(!op){missingInNode++;continue;}
  if(lower(op.routeId)!==lower(row.route_id)||
     lower(op.gateway)!==lower(row.gateway)||
     lower(op.sourceTxHash)!==lower(row.source_tx_hash)||
     Number(op.sourceBlockNumber)!==Number(row.source_block_number)){
   mismatched++;continue;
  }
  matched++;
 }
 for(const key of indexedSource.keys())if(!seen.has(key))missingInXita++;
 unknownRoutes=node.operations.size-indexedSource.size;
 let laggingRoutes=0;
 for(const cursor of cursors.rows){
  if(!pairs.has(lower(cursor.route_id)))continue;
  if(!Number.isSafeInteger(Number(cursor.scanned_to))||
     Number(cursor.scanned_to)>node.coverage.indexedTo)laggingRoutes++;
 }
 const complete=missingInNode===0&&missingInXita===0&&mismatched===0&&
  laggingRoutes===0;
 return {sourceChain,nodeSource,complete,
  nodeIndexedTo:node.coverage.indexedTo,nodeSourceHead:node.coverage.sourceHead,
  matched,missingInNode,missingInXita,mismatched,unknownRoutes,laggingRoutes};
}
async function main(){
 const source=process.argv[2];
 if(!source||!/^[a-z][a-z0-9-]{0,39}$/.test(source))
  throw Error("Usage: node tools/verify-node-index-parity.mjs <xita-source-chain>");
 const url=process.env.XITA_XGR_INDEX_RPC_URL;
 const rpc=makeNodeIndexRpc({url});
 const pool=await transferReaderPool();
 if(!pool)throw Error("Read-only XITA index database unavailable");
 try{
  const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
  const result=await compareNodeIndexToXita({catalog,pool,rpc,sourceChain:source});
  console.log(JSON.stringify(result,null,2));
  if(!result.complete)process.exitCode=2;
 }finally{await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{
  console.error("Node/XITA parity NOT PROVEN:",String(error.message||error));
  process.exitCode=2;
 });
}
