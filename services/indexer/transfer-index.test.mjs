import test from "node:test";
import assert from "node:assert/strict";
import {selector} from "../../apps/web/keccak.js";
import {OPERATION_TOPIC} from "../../apps/web/wallet-transfers.js";
import {bridgeAmountFromTransaction,readRouteWindow,readSourceWindow,
 checkedDelivery,validateIndexedGatewayLog,canonicalRpc,rpcCandidates,candidateRpc,bindVerifiedTransferRpc} from "./transfer-index.mjs";
import {routeIndexCoverage,indexedTransferRow,readWalletTransferIndex} from "./transfer-index-store.mjs";
import {commitWindow,catchUpRoute,refreshPendingDeliveries} from "./transfer-index-worker.mjs";
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
 assert.equal(seen.find(x=>typeof x==="object"&&x.values?.length===3).values[0],wallet);
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

test("M-02: finality-qualified false reopens a previously completed delivery",async()=>{
 const queries=[],pool={query:async q=>{
  queries.push(q);
  if(q.text.startsWith("SELECT source_chain,route_id,message_id"))return {
   rows:[{source_chain:SOURCE,route_id:route.routeId,message_id:hash("d")}]};
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
 assert.match(queries[0].text,/FROM\s+xita_transfer_operations\s+ORDER BY/);
 const update=queries.find(q=>q.text.includes("destination_checked_block=$4"));
 assert.ok(update);
 assert.equal(update.values[2],false);
 assert.equal(update.values[3],200);
 assert.equal(update.values[4],hash("e"));
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
