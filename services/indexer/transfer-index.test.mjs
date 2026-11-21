import test from "node:test";
import assert from "node:assert/strict";
import {selector} from "../../apps/web/keccak.js";
import {OPERATION_TOPIC} from "../../apps/web/wallet-transfers.js";
import {bridgeAmountFromTransaction,readRouteWindow,readSourceWindow,
 checkedDelivery,validateIndexedGatewayLog,canonicalRpc,rpcCandidates,candidateRpc,bindVerifiedTransferRpc,PROCESS_ID_TOPIC} from "./transfer-index.mjs";
import {routeIndexCoverage,indexedTransferRow,readWalletTransferIndex} from "./transfer-index-store.mjs";
import {commitWindow,catchUpRoute,catchUpSource,refreshPendingDeliveries,recentActiveIndexerSources,
 dueIndexerSourceChains,groupedSourceRoutes} from "./transfer-index-worker.mjs";
const address=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
const hex=n=>"0x"+BigInt(n).toString(16);
const word=n=>BigInt(n).toString(16).padStart(64,"0");
const SOURCE="sample-source",DEST="sample-destination";
const route={sourceChain:SOURCE,routeName:"source_to_dest",name:"source_to_dest",
 destinationChain:DEST,gateway:address("a"),routeId:hash("1"),
 deploymentBlock:100,asset:"T",assetId:hash("9"),destinationMailbox:address("b"),
 sourceConfig:{chainId:1643,confirmations:2,rpcUrls:["https://rpc.invalid/src"]},
 destinationConfig:{chainId:8453,domainId:456,confirmations:12,rpcUrls:["https://rpc.invalid/dst"]}};
function rpc(methodMap){
 return async (chain,method,args)=>{
  const fn=methodMap[method];
  if(!fn)throw Error("Unexpected RPC "+method);
  return fn(chain,args);
 };
}
test("decode canonical Gateway.bridge amount without rounding or trusting arbitrary calldata",()=>{
 const sender=address("e");
 const input=selector("bridge(uint32,bytes32,uint256)")+word(456)+
  sender.slice(2).padStart(64,"0")+word(12000000000000000000n);
 const tx={to:route.gateway,input};
 assert.equal(bridgeAmountFromTransaction(tx,route),"12000000000000000000");
 assert.equal(bridgeAmountFromTransaction({...tx,to:address("f")},route),null);
 assert.equal(bridgeAmountFromTransaction({...tx,input:"0xbad"},route),null);
 assert.equal(bridgeAmountFromTransaction({...tx,
   input:selector("bridge(uint32,bytes32,uint256)")+word(999)+
   sender.slice(2).padStart(64,"0")+word(10)},route),null);
});
test("a finalized source scan only accepts canonical Gateway operation logs",async()=>{
 const topic=hash("c");
 const log={address:route.gateway,topics:[OPERATION_TOPIC,route.routeId,topic,hash("2")],
  transactionHash:hash("d"),blockHash:hash("e"),blockNumber:hex(101),logIndex:"0x0",data:word(2)};
 const reader=rpc({
  eth_chainId:()=>hex(1643),
  eth_blockNumber:()=>hex(110),
  eth_getLogs:()=>[log],
  eth_getBlockByNumber:(_,[height])=>({number:height==="latest"?hex(108):height,hash:hash("e")})
 });
 const result=await readRouteWindow({route,cursor:null,rpc:reader,limit:4});
 assert.equal(result.from,100);
 assert.equal(result.to,103);
 assert.equal(result.finalizedHead,108);
 assert.equal(result.events.length,1);
 assert.equal(result.events[0].messageId,topic);
 assert.throws(()=>validateIndexedGatewayLog({...log,removed:true},route,100,103),/Untrusted/);
 assert.throws(()=>validateIndexedGatewayLog({...log,address:address("f")},route,100,103),/Untrusted/);
});
test("known endpoint block hash mismatch forces reindex, not silent cursor advance",async()=>{
 const reader=rpc({
  eth_chainId:()=>hex(1643),
  eth_blockNumber:()=>hex(110),
  eth_getBlockByNumber:(_,[height])=>({number:height==="latest"?hex(108):height,hash:hash("f")})
 });
 const result=await readRouteWindow({route,cursor:{scannedTo:106,scannedHash:hash("e")},
  rpc:reader});
 assert.equal(result.reorg,true);
 assert.equal(result.from,100);
});
test("destination delivery uses pinned Base safe block, not latest",async()=>{
 let at=null;
 const reader=rpc({
  eth_chainId:()=>hex(8453),
  eth_getBlockByNumber:(_,[height])=>({number:height==="safe"?hex(200):height,hash:hash("e")}),
  eth_call:(_,[call,block])=>{at=block;assert.equal(call.to,route.destinationMailbox);return "0x"+word(1);}
 });
 const result=await checkedDelivery({route,messageId:hash("d"),rpc:reader});
 assert.equal(result.delivered,true);
 assert.equal(result.finalizedHead,200);
 assert.equal(at,hex(200));
 await assert.rejects(()=>checkedDelivery({route,messageId:hash("d"),
  rpc:rpc({eth_chainId:()=>hex(999)})}),/mismatch/);
});
test("wallet index requires every configured route cursor current and reconciled",()=>{
 const now=new Date("2026-01-01T10:00:00Z").getTime();
 const routes=[route],base={
  source_chain:SOURCE,route_name:route.routeName,gateway:route.gateway,
  route_id:route.routeId,deployment_block:100,scanned_to:208,finalized_head:208,
  updated_at:new Date(now).toISOString()};
 assert.equal(routeIndexCoverage({},[base],{routeList:routes,now}).complete,true);
 assert.equal(routeIndexCoverage({},[],{routeList:routes,now}).complete,false);
 assert.equal(routeIndexCoverage({},[{...base,scanned_to:207}],{routeList:routes,now}).complete,false);
 assert.equal(routeIndexCoverage({},[{...base,updated_at:new Date(now-999999).toISOString()}],
  {routeList:routes,now}).complete,false);
});
test("DB row with unknown delivery is never advertised as pending mint",()=>{
 const row={source_chain:SOURCE,destination_chain:DEST,route_name:route.name,
  route_id:route.routeId,gateway:route.gateway,source_tx_hash:hash("3"),
  message_id:hash("4"),account:address("d"),asset:"T",source_block_number:"101",
  amount_raw:null,validator_fee_wei:null,delivered:null};
 assert.equal(indexedTransferRow(row).status,"delivery-unknown");
 assert.equal(indexedTransferRow({...row,delivered:false}).status,"awaiting-proof");
 assert.equal(indexedTransferRow({...row,delivered:true}).status,"delivered");
});
test("wallet API filters by normalized address and counts open events beyond pagination",async()=>{
 const now=Date.now(),wallet=address("d");
 const cursors=[{source_chain:SOURCE,route_name:route.name,gateway:route.gateway,route_id:route.routeId,
  deployment_block:100,scanned_to:111,finalized_head:111,
  updated_at:new Date(now).toISOString()}];
 const row={source_chain:SOURCE,destination_chain:DEST,route_name:route.name,
  route_id:route.routeId,gateway:route.gateway,source_tx_hash:hash("3"),
  message_id:hash("4"),account:wallet,asset:"T",source_block_number:"101",
  amount_raw:"42",validator_fee_wei:"10",delivered:false};
 const seen=[];
 const pool={query:async arg=>{
  const text=typeof arg==="string"?arg:arg.text;seen.push(arg);
  if(text.includes("FROM xita_transfer_index_cursors"))return {rows:cursors};
  if(text.includes("COUNT(*) FILTER"))return {rows:[{open:"7",unknown:"2"}]};
  return {rows:[row]};
 }};
 const out=await readWalletTransferIndex({},wallet.toUpperCase().replace("0X","0x"),
  {pool,routeList:[route],now,limit:1,onlyPending:true});
 assert.equal(out.status,"complete");
 assert.equal(out.openCount,7);
 assert.equal(out.unknownCount,2);
 assert.equal(out.items[0].status,"awaiting-proof");
 assert.equal(out.truncated,true);
 assert.equal(seen.find(x=>typeof x==="object"&&x.values?.length===4).values[0],wallet);
});
test("atomically persist verified canonical event and cursor, roll back on mismatched message",async()=>{
 const calls=[];
 const client={query:async arg=>{
  const text=typeof arg==="string"?arg:arg.text;
  calls.push(text);
  if(text.includes("FOR UPDATE"))return {rows:[]};
  if(text.includes("INSERT INTO xita_transfer_operations"))return {rows:[{message_id:hash("4")}]};
  return {rows:[]};
 },release:()=>{}};
 const pool={connect:async()=>client};
 const event={txHash:hash("3"),messageId:hash("4"),blockHash:hash("7"),
  logIndex:0,blockNumber:100};
 const w={from:100,to:100,events:[event],hash:hash("7"),finalizedHead:100};
 const row={sourceChain:SOURCE,destinationChain:DEST,routeName:route.name,routeId:route.routeId,
 gateway:route.gateway,asset:"T",assetId:hash("9"),account:address("d"),
 destinationMailbox:route.destinationMailbox,sourceTxHash:hash("3"),
 messageId:hash("4"),amountRaw:"1",validatorFeeWei:"1",delivered:false};
 const out=await commitWindow({pool,route,window:w,records:[row]});
 assert.equal(out.indexed,1);
 assert.equal(calls.at(-1),"COMMIT");
 const bad={...row,messageId:hash("f")};
 await assert.rejects(()=>commitWindow({pool,route,window:w,records:[bad]}),
  /do not match/);
 assert.equal(calls.at(-1),"ROLLBACK");
});

test("Base event index falls back to the second archive-qualified RPC",async()=>{
 const a="https://gateway.tenderly.co/public/base",b="https://base.gateway.tenderly.co";
 const chain={chainId:8453,name:"base",rpcUrls:[a,b]},probes=[];
 const reader=canonicalRpc({baseUrls:"",archiveProbe:async url=>{
   probes.push(url);return {ok:true};
  },fetcher:async(url,{body})=>{
   const {method}=JSON.parse(body);
   if(method==="eth_chainId")return{ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:"0x2105"})};
   if(url===a)return{ok:false,json:async()=>({error:{code:-32000}})};
   return{ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:[]})};
  }});
 assert.deepEqual(await reader(chain,"eth_getLogs",[{}]),[]);
 assert.deepEqual(probes,[a,b]);
 assert.deepEqual(rpcCandidates(chain,{baseUrls:a}),[a,b]);
});
test("failed archive RPCs never silently index an empty block range",async()=>{
 const chain={name:"base",chainId:8453,rpcUrls:["https://bad.example","https://also-bad.example"]};
 const reader=canonicalRpc({baseUrls:"",archiveProbe:async()=>({ok:false,error:"archive denied"}),
  fetcher:async()=>({ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:"0x2105"})})});
 await assert.rejects(()=>reader(chain,"eth_getLogs",[{}]),/All base RPC endpoints failed/);
 for(const url of ["http://localhost:8545","https://alice:secret@host.example","https://host.example/#bad"])
  assert.throws(()=>rpcCandidates({chainId:8453,rpcUrls:[url]},{baseUrls:""}),/Invalid/);
});

test("bounded backfill advances every committed window and stops at finality",async()=>{
 let end=100,calls=0;
 const out=await catchUpRoute({route:{routeName:"xgr_to_base"},batches:4,scan:async()=>{
  calls++;end+=150;return {indexed:0,scannedTo:end,finalizedHead:700};
 }});
 assert.equal(out.scannedTo,700);assert.equal(calls,4);
 await assert.rejects(()=>catchUpRoute({route:{routeName:"a"},batches:9,scan:async()=>{}}),/Unsafe/);
 let once=0;
 const current=await catchUpRoute({route:{routeName:"base_to_xgr"},batches:4,scan:async()=>{
  once++;return {indexed:1,scannedTo:500,finalizedHead:500};
 }});
 assert.equal(once,1);assert.equal(current.indexed,1);
});

test("known Base tx hash checks skip archive-only gate but still fail over and verify identity",async()=>{
 const a="https://gateway.tenderly.co/public/base",b="https://base.gateway.tenderly.co";
 const calls=[],chain={name:"base",chainId:8453,rpcUrls:[a,b]};
 const reader=candidateRpc({baseUrls:"",fetcher:async(url,{body})=>{
  const {method}=JSON.parse(body);calls.push([url,method]);
  if(method==="eth_chainId")return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:"0x2105"})};
  if(url===a)return {ok:false,json:async()=>({error:{code:-32000}})};
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:{transactionHash:"0x"+"a".repeat(64)}})};
 }});
 const response=await reader(chain,"eth_getTransactionReceipt",["0x"+"a".repeat(64)]);
 assert.equal(response.transactionHash,"0x"+"a".repeat(64));
 assert.ok(calls.some(c=>c[0]===b&&c[1]==="eth_getTransactionReceipt"));
 assert.ok(!calls.some(c=>c[1]==="eth_getLogs"),"No archive probe on a known hash");
});

test("verified transfer RPC routing supports every source and destination backup",async()=>{
 const r={sourceConfig:{chainId:8453,rpcUrls:["https://s.one","https://s.two"]},
  destinationConfig:{chainId:1643,rpcUrls:["https://d.one","https://d.two"]}};
 const read=bindVerifiedTransferRpc(r,async(chain)=>chain.chainId);
 assert.equal(await read("https://s.two","eth_call",[]),8453);
 assert.equal(await read("https://d.two","eth_call",[]),1643);
 assert.throws(()=>read("https://unknown","eth_call",[]),/Unknown or ambiguous/);
 const shared={...r,destinationConfig:{...r.destinationConfig,rpcUrls:["https://s.two"]}};
 assert.throws(()=>bindVerifiedTransferRpc(shared,async()=>1)("https://s.two","eth_call",[]),/Unknown or ambiguous/);
});

test("candidate RPC reads confirmed TX from fallback after primary returns null",async()=>{
 const read=candidateRpc({baseUrls:"",fetcher:async(url,{body})=>{
  const {method}=JSON.parse(body);
  const result=method==="eth_chainId"?"0x2105":url.endsWith("/first")?null:{transactionHash:hash("d")};
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result})};
 }});
 const chain={name:"base",chainId:8453,rpcUrls:["https://source.test/first","https://source.test/second"]};
 assert.equal((await read(chain,"eth_getTransactionReceipt",[hash("d")])).transactionHash,hash("d"));
});

test("Arbitrum indexer converts safe block timestamp without fractional BigInt",async()=>{
 const log={address:route.gateway,topics:[OPERATION_TOPIC,route.routeId,hash("c"),hash("2")],
  transactionHash:hash("d"),blockHash:hash("e"),blockNumber:hex(101),logIndex:"0x0",data:"0x"+word(2)};
 const reader=rpc({
  eth_chainId:()=>hex(1643),eth_blockNumber:()=>hex(110),
   eth_getBlockByNumber:(_,[tag])=>({number:tag==="latest"?hex(108):tag,hash:hash("e")}),eth_getLogs:()=>[log],
  eth_getBlockByNumber:(_,[height])=>({number:height==="latest"?hex(108):height,hash:hash("e"),timestamp:hex(1792667400)})
 });
 const result=await readRouteWindow({route,cursor:null,rpc:reader,limit:4});
 assert.equal(result.events.length,1);
 assert.equal(result.events[0].sourceBlockAt,new Date(1792667400000).toISOString());
});

// Tax evidence is committed only with the canonical initial paid operation.
test("direct transfers never write a commercial tax fee",async()=>{
 const queries=[],client={query:async arg=>{const q=typeof arg==="string"?arg:arg.text;queries.push(q);
  if(q.includes("FOR UPDATE"))return {rows:[]};
  if(q.includes("INSERT INTO xita_transfer_operations"))return {rows:[{message_id:hash("4")}]};
  return {rows:[]};},release:()=>{}};
 const operation={sourceChain:SOURCE,destinationChain:DEST,routeName:route.name,
  routeId:route.routeId,gateway:route.gateway,asset:"T",assetId:hash("9"),
  account:address("d"),destinationMailbox:route.destinationMailbox,
  sourceTxHash:hash("3"),messageId:hash("4"),amountRaw:"1",validatorFeeWei:"1",delivered:false};
 const event={txHash:hash("3"),messageId:hash("4"),blockHash:hash("7"),logIndex:0,blockNumber:100};
 await commitWindow({pool:{connect:async()=>client},route,window:{from:100,to:100,events:[event],hash:hash("7"),finalizedHead:100},records:[operation]});
 assert.ok(!queries.some(q=>q.includes("INSERT INTO xita_tax_charged_fees")));
});
test("successful finalized initial adapter fee is recorded once, without assuming delivery",async()=>{
 const queries=[],client={query:async arg=>{const q=typeof arg==="string"?arg:arg.text;queries.push(q);
  if(q.includes("FOR UPDATE"))return {rows:[]};
  if(q.includes("INSERT INTO xita_transfer_operations"))return {rows:[{message_id:hash("4")}]};
  return {rows:[],rowCount:0};},release:()=>{}};
 const paid={sourceChain:SOURCE,destinationChain:DEST,routeName:route.name,
  routeId:route.routeId,gateway:route.gateway,asset:"T",assetId:hash("9"),
  account:address("d"),destinationMailbox:route.destinationMailbox,
  sourceTxHash:hash("3"),messageId:hash("4"),amountRaw:"1",validatorFeeWei:"1",
  executionAdapter:address("e"),interchainFeeWei:"42",quoteNonce:"100",delivered:null};
 const event={txHash:hash("3"),messageId:hash("4"),blockHash:hash("7"),logIndex:0,blockNumber:100};
 await commitWindow({pool:{connect:async()=>client},route,window:{from:100,to:100,events:[event],hash:hash("7"),finalizedHead:100},records:[paid]});
 assert.equal(queries.filter(q=>q.includes("INSERT INTO xita_tax_charged_fees")).length,1);
 assert.equal(queries.at(-1),"COMMIT");
 assert.match(queries.find(q=>q.includes("INSERT INTO xita_tax_charged_fees")),/ON CONFLICT\(source_chain,message_id\) DO NOTHING/);
});

test("completed deliveries are never re-queried, while pending/null are scheduled",async()=>{
 const queries=[],pool={query:async q=>{
  queries.push(q);
  if(q.text.startsWith("SELECT o.source_chain,o.route_id,o.message_id"))
   return {rows:[]};
  throw Error("No finalized row may be changed");
 }};
 let calls=0;
 const outcome=await refreshPendingDeliveries({pool,routes:[route],
  rpc:async()=>{calls++;throw Error("Unexpected destination RPC");}});
 assert.deepEqual(outcome,{checked:0,delivered:0,unknown:0});
 assert.equal(calls,0);
 assert.equal(queries.length,1);
 assert.match(queries[0].text,/o[.]delivered IS DISTINCT FROM TRUE/);
 assert.match(queries[0].text,/delivery_attempted_at<=NOW\(\)-INTERVAL '60 seconds'/);
 assert.match(queries[0].text,/WHERE EXISTS/);
 assert.ok(queries[0].text.indexOf("o.delivered IS DISTINCT FROM TRUE")<
  queries[0].text.indexOf("LIMIT"),"filter before LIMIT");
});
test("delivery sweep shares a chain head but rechecks the pinned block for each result",async()=>{
 const pool={query:async ({text})=>({rows:text.startsWith("SELECT o.source_chain")?
  ["c","d"].map(id=>({source_chain:SOURCE,route_id:route.routeId,message_id:hash(id)})):[]})};
 const calls=[];
 const result=await refreshPendingDeliveries({pool,routes:[route],rpc:async (chain,method,args)=>{
  assert.equal(chain.chainId,8453);
  calls.push([method,args.at(-1)]);
  if(method==="eth_chainId")return hex(8453);
  if(method==="eth_call")return "0x"+word(1);
  return {number:args[0]==="safe"?hex(200):args[0],hash:hash("e")};
 }});
 assert.deepEqual(result,{checked:2,delivered:2,unknown:0});
 assert.deepEqual(calls,[
  ["eth_chainId",undefined],["eth_getBlockByNumber",false],["eth_getBlockByNumber",false],
  ["eth_call",hex(200)],["eth_getBlockByNumber",false],
  ["eth_call",hex(200)],["eth_getBlockByNumber",false]
 ]);
});
test("four source windows use one verified head and four Gateway queries",async()=>{
 let cursor=null;
 const pool={
  query:async()=>({rows:cursor?[{
   gateway:route.gateway,route_id:route.routeId,deployment_block:route.deploymentBlock,...cursor
  }]:[]}),
  connect:async()=>({release(){},query:async q=>{
   if(q.text?.startsWith("SELECT scanned_to"))return {rows:cursor?[cursor]:[]};
   if(q.text?.startsWith("INSERT INTO xita_transfer_index_cursors"))
    cursor={scanned_to:q.values[5],scanned_hash:q.values[6]};
   return {rows:[]};
  }})
 };
 const calls=[];
 await catchUpSource({routes:[route],pool,limit:2,rpc:async (_chain,method,args)=>{
  calls.push([method,args[0]]);
  if(method==="eth_chainId")return hex(1643);
  if(method==="eth_getLogs")return [];
  return {number:args[0]==="latest"?hex(120):args[0],hash:hash("e")};
 }});
 assert.equal(cursor.scanned_to,107);
 assert.equal(calls.filter(([m])=>m==="eth_chainId").length,1);
 assert.equal(calls.filter(([m,height])=>m==="eth_getBlockByNumber"&&height==="latest").length,1);
 assert.equal(calls.filter(([m])=>m==="eth_getLogs").length,4);
});
test("source cursor at a freshly checked head skips a duplicate pinned block read",async()=>{
 const calls=[];
 const reader=async (_chain,method,args)=>{
  calls.push([method,args[0]]);
  if(method==="eth_chainId")return hex(1643);
  assert.equal(method,"eth_getBlockByNumber");
  return {number:hex(120),hash:hash("e")};
 };
 for(const [scannedHash,reorgRoutes] of [[hash("e"),[]],[hash("f"),[route]]]){
  calls.length=0;
  const cursors=new Map([[route.routeId,{scannedTo:120,scannedHash}]]);
  const view=await readSourceWindow({routes:[route],cursors,rpc:reader});
  assert.deepEqual(view.reorgRoutes,reorgRoutes);
  assert.deepEqual(calls,[
   ["eth_chainId",undefined],["eth_getBlockByNumber","latest"],["eth_getBlockByNumber",hex(120)]
  ]);
 }
});

test("finalized false stays open and next check retains bounded retry",async()=>{
 const queries=[],pool={query:async q=>{
  queries.push(q);
  if(q.text.startsWith("SELECT o.source_chain,o.route_id,o.message_id"))
   return {rows:[{source_chain:SOURCE,route_id:route.routeId,message_id:hash("d")}]};
  return {rows:[],rowCount:1};
 }};
 const reader=rpc({
  eth_chainId:()=>hex(8453),
  eth_getBlockByNumber:(_,[height])=>({number:height==="safe"?hex(200):height,hash:hash("e")}),
  eth_call:()=> "0x"+word(0)
 });
 const result=await refreshPendingDeliveries({pool,routes:[route],rpc:reader});
 assert.equal(result.checked,1);
 assert.equal(result.delivered,0);
 assert.match(queries[0].text,/o[.]delivered IS DISTINCT FROM TRUE/);
 const update=queries.find(q=>q.text.includes("destination_checked_block=$4"));
 assert.ok(update);
 assert.equal(update.values[2],false);
 assert.equal(update.values[3],200);
 assert.equal(update.values[4],hash("e"));
});
test("F-26: retired routes cannot starve active deliveries in a bounded sweep",async()=>{
 const orphanRows=Array.from({length:125},(_,i)=>({
  source_chain:SOURCE,route_id:hash("f"),message_id:hash((i%10).toString())
 }));
 const activeRow={source_chain:SOURCE,route_id:route.routeId,message_id:hash("d")};
 const history=[...orphanRows,activeRow],writes=[];
 let selected=0;
 const pool={query:async q=>{
  const sql=q.text;
  if(sql.startsWith("SELECT o.source_chain,o.route_id,o.message_id")){
   assert.match(sql,/FROM\s+xita_transfer_operations\s+o\s+WHERE EXISTS/);
    assert.match(sql,/o[.]delivered IS DISTINCT FROM TRUE/);
   assert.match(sql,/JOIN|\(VALUES\s+\(\$1::text,\$2::char\(66\)\)/);
   assert.ok(sql.indexOf("WHERE EXISTS")<sql.indexOf("LIMIT"),
    "filter must be applied before bounding the backlog");
   assert.deepEqual(q.values,[SOURCE,route.routeId,40]);
   const allowed=new Set;
   for(let i=0;i<q.values.length-1;i+=2)allowed.add(q.values[i]+":"+q.values[i+1]);
   const rows=history.filter(r=>allowed.has(r.source_chain+":"+r.route_id))
    .slice(0,q.values.at(-1));
   selected+=rows.length;
   return {rows};
  }
  writes.push(q);
  return {rows:[],rowCount:1};
 }};
 const reader=rpc({
  eth_chainId:()=>hex(8453),
  eth_getBlockByNumber:(_,[height])=>({number:height==="safe"?hex(200):height,hash:hash("e")}),
  eth_call:()=> "0x"+word(1)
 });
 const outcome=await refreshPendingDeliveries({pool,routes:[route],rpc:reader});
 assert.equal(selected,1);
 assert.deepEqual(outcome,{checked:1,delivered:1,unknown:0});
 assert.equal(writes.length,2,"only the active delivery status and attempt timestamp are updated");
 assert.ok(writes.every(q=>q.values[1]===activeRow.message_id));
});
test("F-26: an empty active route catalog does not alter historical delivery rows",async()=>{
 let calls=0;
 const outcome=await refreshPendingDeliveries({routes:[],limit:40,
  pool:{query:async()=>{calls++;throw Error("must not query historical rows")}},
  rpc:async()=>{throw Error("must not request delivery") }});
 assert.deepEqual(outcome,{checked:0,delivered:0,unknown:0});
 assert.equal(calls,0);
});
test("F-26: active route keys are selected as pairs, not independent lists",async()=>{
 let statement;
 const another={...route,sourceChain:"another-chain",routeId:hash("2")};
 await refreshPendingDeliveries({routes:[route,another],limit:5,
  pool:{query:async q=>{statement=q;return {rows:[]}}},
  rpc:async()=>{throw Error("no work expected")}});
 assert.deepEqual(statement.values,
  [SOURCE,route.routeId,"another-chain",another.routeId,5]);
 assert.match(statement.text,/\(\$1::text,\$2::char\(66\)\),\(\$3::text,\$4::char\(66\)\)/);
 assert.match(statement.text,/LIMIT \$5/);
});

test("shared observer scans two routes using one verified safe head and one Gateway query",async()=>{
 const r1={...route,sourceChain:"base",sourceConfig:{chainId:8453,rpcUrls:["https://rpc.example/a"]},
  routeId:hash("1"),gateway:address("a")};
 const r2={...r1,routeId:hash("2"),gateway:address("b")};
 const calls=[];
 const read=async(_chain,method,args)=>{
  calls.push([method,args]);
  if(method==="eth_chainId")return hex(8453);
  if(method==="eth_getBlockByNumber"){
   const h=args[0]==="safe"?105:Number(BigInt(args[0]));
   return {number:hex(h),hash:hash("f"),timestamp:hex(1792667400)};
  }
  if(method==="eth_getLogs")return [];
  throw Error("Unexpected RPC "+method);
 };
 const view=await readSourceWindow({routes:[r1,r2],cursors:new Map(),rpc:read,limit:4});
 assert.equal(view.from,100);
 assert.equal(view.to,103);
 assert.equal(view.eventsByRoute.size,2);
 assert.equal(calls.filter(([method])=>method==="eth_getLogs").length,1);
 assert.equal(calls.filter(([method,args])=>method==="eth_getBlockByNumber"&&args[0]==="safe").length,1);
 const filter=calls.find(([method])=>method==="eth_getLogs")[1][0];
 assert.deepEqual(filter.address,[r1.gateway,r2.gateway]);
 assert.deepEqual(filter.topics[1],[r1.routeId,r2.routeId]);
});
test("shared observer keeps lagging route independent of already advanced route",async()=>{
 const a={...route,sourceChain:"base",sourceConfig:{chainId:8453,rpcUrls:["https://rpc.example/a"]},
  gateway:address("a")};
 const b={...a,routeId:hash("2"),gateway:address("b")};
 let calls=0;
 const read=async(_chain,method,args)=>{
  if(method==="eth_chainId")return hex(8453);
  if(method==="eth_getBlockByNumber"){
   const n=args[0]==="safe"?120:Number(BigInt(args[0]));
   return {number:hex(n),hash:hash("e")};
  }
  if(method==="eth_getLogs"){calls++;return [];}
  throw Error("Unexpected method");
 };
 const cursors=new Map([[a.routeId,{scannedTo:115,scannedHash:hash("e")}],
  [b.routeId,{scannedTo:100,scannedHash:hash("e")}]]);
 const view=await readSourceWindow({routes:[a,b],cursors,rpc:read,limit:4});
 assert.equal(view.from,101);assert.equal(view.to,104);
 assert.equal(view.eventsByRoute.get(a.routeId).length,0);
 assert.equal(calls,1);
});
test("one canonical window captures both Gateway and Mailbox events",async()=>{
 const mailbox=address("b"),blockHash=hash("e"),messageId=hash("d");
 const gatewayEvent={address:route.gateway,topics:[OPERATION_TOPIC,route.routeId,hash("c"),hash("2")],
  transactionHash:hash("a"),blockNumber:hex(101),blockHash,logIndex:"0x0",data:word(2)};
 const deliveryEvent={...gatewayEvent,address:mailbox,topics:[PROCESS_ID_TOPIC,messageId],
  transactionHash:hash("b"),logIndex:"0x1",data:"0x"};
 let queried=0,body=deliveryEvent;
 const reader=rpc({
  eth_chainId:()=>hex(1643),
  eth_getBlockByNumber:(_,[height])=>({number:height==="latest"?hex(105):height,hash:blockHash}),
  eth_getLogs:(_,[filter])=>{
   queried++;
   assert.deepEqual(filter.address,[route.gateway,mailbox]);
   assert.deepEqual(filter.topics,[[OPERATION_TOPIC,PROCESS_ID_TOPIC]]);
   return [gatewayEvent,body];
  }
 });
 const params={routes:[route],cursors:new Map(),rpc:reader,limit:4,mailbox};
 const view=await readSourceWindow(params);
 assert.equal(queried,1);
 assert.equal(view.eventsByRoute.get(route.routeId).length,1);
 assert.deepEqual(view.deliveries,[{messageId,txHash:hash("b"),blockNumber:101,blockHash}]);
 body={...deliveryEvent,address:route.gateway};
 await assert.rejects(()=>readSourceWindow(params),/Invalid Mailbox/);
 body={...deliveryEvent,blockHash:hash("f")};
 await assert.rejects(()=>readSourceWindow(params),/not canonical/);
});
test("shared observer rejects failed logs and does not synthesize a successful window",async()=>{
 const a={...route,sourceChain:"base",sourceConfig:{chainId:8453,rpcUrls:["https://rpc.example/a"]}};
 const read=async(_chain,method,args)=>{
  if(method==="eth_chainId")return hex(8453);
  if(method==="eth_getBlockByNumber")return {number:args[0]==="safe"?hex(105):args[0],hash:hash("e")};
  if(method==="eth_getLogs")throw Error("RPC HTTP 429");
 };
 await assert.rejects(()=>readSourceWindow({routes:[a],cursors:new Map(),rpc:read}),/429/);
});
test("canonical provider cooldown prevents repeated identity and archive probes",async()=>{
 let now=100000,attempts=0;
 const chain={chainId:8453,name:"base",rpcUrls:["https://rpc1.test"]};
 const read=canonicalRpc({now:()=>now,baseUrls:"",fetcher:async()=>{
  attempts++;return {ok:false,status:429,json:async()=>({error:{code:429}})};
 }});
 await assert.rejects(()=>read(chain,"eth_getLogs",[{}]),/All base RPC endpoints failed/);
 const count=attempts;
 await assert.rejects(()=>read(chain,"eth_getLogs",[{}]),/cooldown/);
 assert.equal(attempts,count,"do not hammer the same provider while cooling down");
 now+=31000;
 await assert.rejects(()=>read(chain,"eth_getLogs",[{}]),/failed/);
 assert.ok(attempts>count);
});

test("release-reviewed Base and Arbitrum provider pools use four independent endpoints",async()=>{
 const {readFileSync}=await import("node:fs");
 const {resolve}=await import("node:path");
 const root=resolve(import.meta.dirname,"../..");
 const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
 for(const [name,expected] of Object.entries({
  base:["https://mainnet.base.org","https://gateway.tenderly.co/public/base","https://base-rpc.publicnode.com","https://base.drpc.org"],
  arbitrum:["https://arb1.arbitrum.io/rpc","https://arbitrum-one-rpc.publicnode.com","https://arbitrum.gateway.tenderly.co","https://arbitrum.drpc.org"]
 })){
  const config=JSON.parse(readFileSync(resolve(root,"config/chains",name,"chain.json"),"utf8"));
  assert.deepEqual(config.rpcUrls,expected);
  assert.deepEqual(catalog.chains[name].rpcUrls,expected);
  assert.deepEqual(rpcCandidates(catalog.chains[name],{baseUrls:""}),expected);
 }
});
test("four Base providers fail over on HTTP 429 without treating rejected logs as empty",async()=>{
 const urls=["https://mainnet.base.org","https://gateway.tenderly.co/public/base",
  "https://base-rpc.publicnode.com","https://base.drpc.org"];
 const calls=[];
 const read=canonicalRpc({baseUrls:"",fetcher:async(url,{body})=>{
  const {method}=JSON.parse(body);calls.push([url,method]);
  if(method==="eth_chainId")return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:"0x2105"})};
  if(url!==urls[2])return {ok:false,status:429};
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:[]})};
 }});
 const chain={name:"base",chainId:8453,rpcUrls:urls};
 assert.deepEqual(await read(chain,"eth_getLogs",[{address:"0x"+"1".repeat(40),fromBlock:"0x1",toBlock:"0x3"}]),[]);
 assert.deepEqual(calls.filter(x=>x[1]==="eth_getLogs").map(x=>x[0]),urls.slice(0,3));
});

test("adaptive indexer polls every 60s idle and 20s for active source only",()=>{
 const chains=["base","bsc","xgrchain"],last=new Map(chains.map(chain=>[chain,1000]));
 const due=(now,activeSources)=>dueIndexerSourceChains({
  sourceChains:chains,activeSources:new Set(activeSources),lastScannedAt:last,now});
 assert.deepEqual([...due(12999,[])],[]);
 assert.deepEqual([...due(21000,["base"])],["base"]);
 assert.deepEqual([...due(41000,["base"])],["base"]);
 assert.deepEqual([...due(61000,[])],["base","bsc","xgrchain"]);
 assert.deepEqual([...due(61000,["base"])],["base","bsc","xgrchain"]);
 const first=dueIndexerSourceChains({sourceChains:chains,
  activeSources:new Set(),lastScannedAt:new Map(),now:100});
 assert.deepEqual([...first],chains,"cold startup must scan every source");
});
test("active indexer sources come from recent real rows or untrusted hints, never stale history",async()=>{
 const query=[];
 const pool={query:async q=>{
  query.push(q);return {rows:[{source_chain:"bsc"},{source_chain:"xgrchain"}]};
 }};
 const active=await recentActiveIndexerSources(pool);
 assert.deepEqual([...active],["bsc","xgrchain"]);
 assert.match(query[0].text,/first_reported_at >= NOW\(\)-INTERVAL '5 minutes'/);
 assert.match(query[0].text,/delivered IS DISTINCT FROM TRUE/);
 assert.match(query[0].text,/source_indexed_at >= NOW\(\)-INTERVAL '5 minutes'/);
 const missing=await recentActiveIndexerSources({query:async()=>{
  throw Object.assign(Error("migration unavailable"),{code:"42P01"});
 }});
 assert.equal(missing.size,0);
});
test("adaptive filter keeps one source-wide scan for all active Gateway routes",()=>{
 const base={sourceChain:"base",sourceConfig:{chainId:8453},routeId:hash("1")};
 const more={...base,routeId:hash("2")};
 const bsc={...base,sourceChain:"bsc",sourceConfig:{chainId:56}};
 const groups=groupedSourceRoutes([base,more,bsc],new Set(["base"]));
 assert.equal(groups.length,1);
 assert.deepEqual(groups[0],[base,more]);
 assert.equal(groupedSourceRoutes([base,more,bsc]).length,2);
});

test("candidate RPC cooldown stops repeated failures while other providers remain available",async()=>{
 let now=100000;
 const a="https://bsc-rpc.publicnode.com",b="https://bsc.drpc.org";
 const counts=new Map();
 const reader=candidateRpc({baseUrls:"",now:()=>now,fetcher:async(url,{body})=>{
  const method=JSON.parse(body).method;
  counts.set(url,(counts.get(url)||0)+1);
  if(url===a)return {ok:false,status:429};
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,
   result:method==="eth_chainId"?"0x38":{transactionHash:hash("a")}})};
 }});
 const chain={name:"bsc",chainId:56,rpcUrls:[a,b]};
 assert.equal((await reader(chain,"eth_getTransactionReceipt",[hash("a")])).transactionHash,hash("a"));
 const first=counts.get(a);
 assert.equal((await reader(chain,"eth_getTransactionReceipt",[hash("a")])).transactionHash,hash("a"));
 assert.equal(counts.get(a),first,"429 provider must not be contacted again within cooldown");
 now+=16000;
 assert.equal((await reader(chain,"eth_getTransactionReceipt",[hash("a")])).transactionHash,hash("a"));
 assert.ok(counts.get(a)>first,"provider may be tried after bounded cooldown");
});
test("candidate exhausted quota holds per-provider cooldown across calls",async()=>{
 let now=100000,requests=0;
 const chain={name:"bsc",chainId:56,rpcUrls:["https://bsc.drpc.org"]};
 const read=candidateRpc({baseUrls:"",now:()=>now,fetcher:async()=>{
  requests++;throw Error("quota exceeded");
 }});
 await assert.rejects(()=>read(chain,"eth_getTransactionReceipt",[hash("b")]),/failed/);
 await assert.rejects(()=>read(chain,"eth_getTransactionReceipt",[hash("b")]),/cooldown/);
 assert.equal(requests,1,"do not retry exhausted provider");
 now+=1800001;
 await assert.rejects(()=>read(chain,"eth_getTransactionReceipt",[hash("b")]),/failed/);
 assert.equal(requests,2);
});
test("candidate receipt propagation null still checks backup without false cooldown",async()=>{
 const a="https://bsc-rpc.publicnode.com",b="https://bsc.drpc.org";
 let first=0;
 const read=candidateRpc({baseUrls:"",fetcher:async(url,{body})=>{
  const {method}=JSON.parse(body);
  if(url===a)first++;
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,
   result:method==="eth_chainId"?"0x38":
    url===a?null:{transactionHash:hash("c")}})};
 }});
 const chain={name:"bsc",chainId:56,rpcUrls:[a,b]};
 await read(chain,"eth_getTransactionReceipt",[hash("c")]);
 await read(chain,"eth_getTransactionReceipt",[hash("c")]);
 assert.ok(first>=3,"valid null is not treated as provider outage");
});

test("the indexer shares provider rate limits but keeps archive capability failures local",async()=>{
 const chain={name:"bsc",chainId:56,rpcUrls:["https://rpc.example"]};
 let now=100000, failure=429;
 const methods=[];
 const fetcher=async(_url,{body})=>{
  const {method}=JSON.parse(body);
  methods.push(method);
  if(method==="eth_getLogs")return {ok:false,status:failure};
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,
   result:method==="eth_chainId"?"0x38":{transactionHash:hash("a")}})};
 };
 const rateLimits=new Map();
 const options={now:()=>now,baseUrls:"",fetcher,rateLimits};
 const scan=canonicalRpc(options), candidate=candidateRpc(options);
 await assert.rejects(()=>scan(chain,"eth_getLogs",[]),/429/);
 await assert.rejects(()=>candidate(chain,"eth_getTransactionReceipt",[hash("a")]),/cooldown/);
 assert.deepEqual(methods,["eth_chainId","eth_getLogs"]);
 now+=16000;
 failure=403;
 await assert.rejects(()=>scan(chain,"eth_getLogs",[]),/403/);
 assert.equal((await candidate(chain,"eth_getTransactionReceipt",[hash("a")])).transactionHash,hash("a"));
});

test("only fresh, caught-up Mailbox coverage filters repeat delivery probes before the limit",async()=>{
 const now=200000;
 const recent={chain:"bsc",mailbox:route.destinationMailbox,from:100,to:105,
  checkedAt:now,caughtUp:true};
 const coverage=new Map([
  ["bsc",recent],
  ["base",{...recent,chain:"base",checkedAt:now-120001}],
  ["optimism",{...recent,chain:"optimism",caughtUp:false}]
 ]);
 let statement;
 await refreshPendingDeliveries({routes:[route],mailboxCoverage:coverage,now,
  pool:{query:async q=>{statement=q;return {rows:[]}}},
  rpc:async()=>{throw Error("no delivery call expected")}});
 assert.deepEqual(JSON.parse(statement.values[2]),[recent]);
 assert.match(statement.text,/o\.delivered IS FALSE AND c\.chain=o\.destination_chain/);
 assert.match(statement.text,/o\.destination_checked_block BETWEEN c\."from"-1 AND c\."to"/);
 assert.match(statement.text,/xita_indexed_mailbox_events e/);
 assert.match(statement.text,/LIMIT \$4/);
});

test("a JSON-RPC plan quota response pauses both indexer readers",async()=>{
 const chain={name:"bsc",chainId:56,rpcUrls:["https://rpc.example"]};
 const rateLimits=new Map();
 let now=100000,calls=0;
 const options={now:()=>now,baseUrls:"",rateLimits,fetcher:async()=>{
  calls++;
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,error:{code:-32000,
   message:"You've reached the usage limit for your current plan"}})};
 }};
 const scan=canonicalRpc(options), candidate=candidateRpc(options);
 await assert.rejects(()=>candidate(chain,"eth_getTransactionReceipt",[hash("a")]),/quota exhausted/);
 now+=120001;
 await assert.rejects(()=>scan(chain,"eth_getLogs",[]),/cooldown/);
 assert.equal(calls,1);
 now+=1800000;
 await assert.rejects(()=>scan(chain,"eth_getLogs",[]),/quota exhausted/);
 assert.equal(calls,2);
});

test("the indexer pins a scan to one provider until retry with a new head",async()=>{
 const endpoints=["https://first.example","https://second.example"];
 const chain={chainId:56,name:"bsc",rpcUrls:endpoints};
 const calls=[];
 const read=canonicalRpc({baseUrls:"",fetcher:async(url,{body})=>{
  const {method}=JSON.parse(body);
  calls.push([url,method]);
  if(url===endpoints[0]&&method==="eth_getLogs")return {ok:false,status:429};
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:1,result:
   method==="eth_chainId"?"0x38":method==="eth_getLogs"?[]:{number:"0x64",hash:hash("e")}})};
 }}).openScan();
 await read(chain,"eth_getBlockByNumber",["finalized",false]);
 await assert.rejects(()=>read(chain,"eth_getLogs",[]),/429/);
 assert.ok(calls.every(([url])=>url===endpoints[0]));
 assert.equal(read.retryOnAnotherProvider(),true);
 await read(chain,"eth_getBlockByNumber",["finalized",false]);
 await read(chain,"eth_getLogs",[]);
 assert.deepEqual(calls.slice(-3),[
  [endpoints[1],"eth_chainId"],[endpoints[1],"eth_getBlockByNumber"],[endpoints[1],"eth_getLogs"]
 ]);
});
