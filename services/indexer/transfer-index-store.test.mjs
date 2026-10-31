import test from "node:test";
import assert from "node:assert/strict";
import {routeIndexCoverage,indexedTransferRow,linkIndexedJourneys,readWalletTransferIndex} from "./transfer-index-store.mjs";
const addr=n=>"0x"+n.repeat(40),hash=n=>"0x"+n.repeat(64);
test("same directional route name across different token projects NEVER shares a cursor",()=>{
 const routes=[
  {sourceChain:"xgrchain",destinationChain:"base",routeName:"xgr_to_base",
   routeId:hash("a"),gateway:addr("1"),deploymentBlock:10},
  {sourceChain:"xgrchain",destinationChain:"base",routeName:"xgr_to_base",
   routeId:hash("b"),gateway:addr("2"),deploymentBlock:20}
 ];
 const when=new Date("2026-10-15T10:00:00Z"),now=when.getTime();
 const cursors=routes.map((r,i)=>({
  source_chain:r.sourceChain,route_name:r.routeName,route_id:r.routeId,
  gateway:r.gateway,deployment_block:r.deploymentBlock,
  scanned_to:50+i,finalized_head:50+i,updated_at:when
 }));
 const verified=routeIndexCoverage({},cursors,{routeList:routes,now});
 assert.equal(verified.complete,true);
 assert.equal(verified.indexedRoutes,2);
 const swapped=[{...cursors[0],route_id:hash("b")},cursors[1]];
 const ambiguous=routeIndexCoverage({},swapped,{routeList:routes,now});
 assert.equal(ambiguous.complete,false);
 assert.equal(ambiguous.indexedRoutes,1);
});
test("unknown target delivered state remains UNKNOWN and never invents successful mint",()=>{
 const base={account:addr("a"),asset:"XGR",source_chain:"xgrchain",
  destination_chain:"base",route_name:"xgr_to_base",route_id:hash("f"),
  gateway:addr("1"),source_tx_hash:hash("c"),message_id:hash("d"),
  source_block_number:50,amount_raw:"100",validator_fee_wei:"1"};
 assert.equal(indexedTransferRow({...base,delivered:null}).status,"delivery-unknown");
 assert.equal(indexedTransferRow({...base,delivered:false}).status,"awaiting-proof");
 assert.equal(indexedTransferRow({...base,delivered:true}).status,"delivered");
});

test("confirmed first hop with signed onward route stays open, never claims completion",()=>{
 const r={account:addr("a"),asset:"XGR",source_chain:"base",
  destination_chain:"xgrchain",route_name:"base_to_xgr",route_id:hash("e"),
  gateway:addr("1"),source_tx_hash:hash("c"),message_id:hash("d"),
  source_block_number:88,amount_raw:"100",validator_fee_wei:"2",
  execution_adapter:addr("2"),interchain_fee_wei:"5",
  final_destination_chain:"polygon",final_recipient:addr("a"),
  onward_route_id:hash("f"),delivered:true};
 const item=indexedTransferRow(r);
 assert.equal(item.status,"awaiting-onward");
 assert.equal(item.delivered,true); // Means XGR delivery, not final Polygon.
 assert.equal(item.finalDestinationChain,"polygon");
 assert.equal(item.onwardRouteId,hash("f"));
 assert.equal(item.interchainFeeWei,"5");
 assert.equal(indexedTransferRow({...r,delivered:false}).status,"awaiting-proof");
 assert.equal(indexedTransferRow({...r,delivered:null}).status,"delivery-unknown");
});

test("only the exact canonical onward parent message and route completes a two-hop journey",()=>{
 const payer=addr("a"),firstId=hash("a"),nextId=hash("b");
 const parent={account:payer,asset:"XGR",routeId:hash("1"),messageId:firstId,
  assetId:hash("f"),sourceChain:"base",destinationChain:"xgrchain",
  finalDestinationChain:"polygon",finalRecipient:payer,
  onwardRouteId:hash("2"),amountRaw:"100",confirmed:true,delivered:true,status:"awaiting-onward"};
 const child={...parent,messageId:nextId,txHash:hash("c"),sourceChain:"xgrchain",
  destinationChain:"polygon",parentMessageId:firstId,routeId:parent.onwardRouteId,
  onwardRouteId:null,executionAdapter:addr("d"),confirmed:true,delivered:true};
 let linked=linkIndexedJourneys([parent],[child])[0];
 assert.equal(linked.status,"journey-delivered");
 assert.equal(linked.secondHopTxHash,hash("c"));
 assert.equal(linked.finalDelivered,true);
 for(const corrupt of [
  {routeId:hash("5")},{amountRaw:"99"},{account:addr("f")},
  {parentMessageId:hash("d")},{finalRecipient:addr("e")},
  {destinationChain:"base"},{executionAdapter:null}
 ]){
  linked=linkIndexedJourneys([parent],[{...child,...corrupt}])[0];
  assert.equal(linked.status,"awaiting-onward",
   "mismatched child must NEVER mark parent delivered");
 }
 for(const [flag,status] of [[false,"awaiting-final-proof"],
    [null,"final-delivery-unknown"],[true,"journey-delivered"]]){
  linked=linkIndexedJourneys([parent],[{...child,delivered:flag}])[0];
  assert.equal(linked.status,status);
 }
 linked=linkIndexedJourneys([parent],[child,{...child,messageId:hash("e")}])[0];
 assert.equal(linked.status,"journey-ambiguous");
});

test("only RPC-observed unconfirmed source hints appear and cannot count as deliveries",async()=>{
 const wallet=addr("a"),txHash=hash("5");
 let stagedState="reported";
 const pool={query:async arg=>{
  const sql=typeof arg==="string"?arg:arg.text;
  if(sql.includes("xita_transfer_index_cursors"))return {rows:[]};
  if(sql.includes("COUNT(*) FILTER"))return {rows:[{open:"0",unknown:"0"}]};
  if(sql.includes("FROM xita_transfer_announcements a"))
   return {rows:[{source_chain:"xgrchain",source_tx_hash:txHash,
    account:wallet,state:stagedState}]};
  return {rows:[]};
 }};
 const params={pool,routeList:[],limit:5};
 let result=await readWalletTransferIndex({},wallet,params);
 assert.deepEqual(result.items,[],"Never publish an unverified browser claim");
 stagedState="observed";
 result=await readWalletTransferIndex({},wallet,params);
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].status,"pending-source");
 assert.equal(result.items[0].confirmed,false);
 assert.equal(result.items[0].messageId,null);
 assert.equal(result.openCount,0,"Unconfirmed source is not a mint/unlock");
});

test("wallet history prioritizes older unfinished transfers before newer completed history",async()=>{
 const wallet=addr("a"),calls=[];
 const pool={query:async arg=>{
  const sql=typeof arg==="string"?arg:arg.text;
  calls.push(sql);
  if(sql.includes("xita_transfer_index_cursors"))return {rows:[]};
  if(sql.includes("COUNT(*) FILTER"))return {rows:[{open:"1",unknown:"0"}]};
  if(sql.includes("FROM xita_transfer_announcements"))return {rows:[]};
  return {rows:[]};
 }};
 await readWalletTransferIndex({},wallet,{pool,routeList:[],limit:100});
 const sql=calls.find(x=>x.includes("FROM xita_transfer_operations p")&&x.includes("ORDER BY"));
 assert.ok(sql,"wallet query must have a deterministic worklist ordering");
 assert.match(sql,/ORDER BY CASE WHEN/);
 assert.match(sql,/p.delivered IS DISTINCT FROM TRUE/);
 const countSQL=calls.find(x=>x.includes("COUNT(*) FILTER"));
 assert.match(countSQL,/p.delivered IS DISTINCT FROM TRUE/,
  "Unknown destination delivery is still an unfinished obligation");
 assert.match(sql,/p.onward_route_id IS NOT NULL AND NOT/);
 assert.match(sql,/p.source_indexed_at DESC,p.source_tx_hash DESC LIMIT/);
});

test("wallet joins optional durable proof status only for its canonical indexed messages",async()=>{
 const wallet=addr("a"),message=hash("b"),tx=hash("c");
 const base={account:wallet,asset:"XGR",source_chain:"xgrchain",
  destination_chain:"base",route_name:"xgr_to_base",route_id:hash("f"),
  gateway:addr("1"),source_tx_hash:tx,message_id:message,
  source_block_number:50,amount_raw:"100",validator_fee_wei:"1",delivered:false};
 const calls=[];
 const pool={query:async arg=>{
  const q=typeof arg==="string"?{text:arg}:arg;
  calls.push(q);
  if(q.text.includes("FROM xita_transfer_index_cursors"))return {rows:[]};
  if(q.text.includes("COUNT(*) FILTER"))return {rows:[{open:"1",unknown:"0"}]};
  if(q.text.includes("FROM xita_transfer_announcements"))return {rows:[]};
  if(q.text.includes("FROM xita_transfer_proof_observations j"))
   return {rows:[{source_chain:"xgrchain",message_id:message,state:"waiting",
    reason:"PROOF_QUORUM_UNAVAILABLE",stage:"quorum",
    updated_at:"2026-10-23T10:00:00Z",last_checked_at:"2026-10-23T10:00:00Z"}]};
  if(q.text.includes("FROM xita_transfer_operations p"))return {rows:[base]};
  return {rows:[]};
 }};
 const result=await readWalletTransferIndex({},wallet,{pool,routeList:[]});
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].proofObservation.reason,"PROOF_QUORUM_UNAVAILABLE");
 const proofCall=calls.find(c=>c.text.includes("FROM xita_transfer_proof_observations j"));
 assert.deepEqual(proofCall.values,[wallet,[message]]);
 assert.match(proofCall.text,/o.account=\$1/);
 assert.match(proofCall.text,/o.delivered IS FALSE/);
});
test("wallet API remains available when optional proof migration is missing",async()=>{
 const wallet=addr("a"),message=hash("c");
 const row={account:wallet,asset:"XGR",source_chain:"xgrchain",
  destination_chain:"base",route_name:"xgr_to_base",route_id:hash("f"),
  gateway:addr("1"),source_tx_hash:hash("d"),message_id:message,
  source_block_number:70,amount_raw:"100",validator_fee_wei:"1",delivered:false};
 const pool={query:async arg=>{
  const q=typeof arg==="string"?arg:arg.text;
  if(q.includes("FROM xita_transfer_proof_observations j"))throw Object.assign(Error("missing"),{code:"42P01"});
  if(q.includes("xita_transfer_index_cursors"))return {rows:[]};
  if(q.includes("COUNT(*) FILTER"))return {rows:[{open:"1",unknown:"0"}]};
  if(q.includes("FROM xita_transfer_announcements"))return {rows:[]};
  if(q.includes("FROM xita_transfer_operations p"))return {rows:[row]};
  return {rows:[]};
 }};
 const got=await readWalletTransferIndex({},wallet,{pool,routeList:[]});
 assert.equal(got.items.length,1);
 assert.equal(got.items[0].proofObservation,undefined);
});
test("aggregate route health reveals no addresses or signing calldata",async()=>{
 const wallet=addr("a"),seen=[];
 const pool={query:async arg=>{
  const sql=typeof arg==="string"?arg:arg.text;seen.push(sql);
  if(sql.includes("xita_transfer_index_cursors"))return {rows:[]};
  if(sql.includes("FROM xita_transfer_proof_observations j"))
   return {rows:[{source_chain:"arbitrum",destination_chain:"xgrchain",
    route_name:"arb_to_xgr",state:"unavailable",reason:"PROOF_RPC_UNAVAILABLE",
    count:"2",last_checked_at:"2026-10-23T10:00:00Z"}]};
  return {rows:[]};
 }};
 const {readTransferIndexStats}=await import("./transfer-index-store.mjs");
 const stats=await readTransferIndexStats({}, {pool,routeList:[]});
 assert.deepEqual(stats.proofObserver.routes.map(x=>[x.route,x.reason,x.count]),
  [["arb_to_xgr","PROOF_RPC_UNAVAILABLE",2]]);
 assert.doesNotMatch(JSON.stringify(stats.proofObserver),new RegExp(wallet,"i"));
 assert.match(seen.find(q=>q.includes("FROM xita_transfer_proof_observations j")),/GROUP BY/);
});

test("ambiguous competing onward hops remain visible instead of silently disappearing",async()=>{
 const wallet=addr("a"),parentMessage=hash("b");
 const parent={account:wallet,asset:"XGR",source_chain:"arbitrum",
  destination_chain:"xgrchain",route_name:"arb_to_xgr",route_id:hash("1"),
  gateway:addr("1"),source_tx_hash:hash("a"),message_id:parentMessage,
  source_block_number:100,amount_raw:"100",validator_fee_wei:"1",delivered:true,
  onward_route_id:hash("2"),final_destination_chain:"base",
  final_recipient:wallet,execution_adapter:addr("e")};
 const next={...parent,source_chain:"xgrchain",destination_chain:"base",
  route_name:"xgr_to_base",route_id:hash("2"),source_tx_hash:hash("c"),
  message_id:hash("d"),parent_message_id:parentMessage,delivered:false,
  onward_route_id:null,execution_adapter:addr("e")};
 const collision={...next,source_tx_hash:hash("e"),message_id:hash("f")};
 const calls=[];
 const pool={query:async arg=>{
  const sql=typeof arg==="string"?arg:arg.text;calls.push(sql);
  if(sql.includes("xita_transfer_index_cursors"))return {rows:[]};
  if(sql.includes("COUNT(*) FILTER"))return {rows:[{open:"3",unknown:"0"}]};
  if(sql.includes("FROM xita_transfer_operations p"))return {rows:[parent,next,collision]};
  if(sql.includes("FROM xita_transfer_operations\n"))return {rows:[next,collision]};
  return {rows:[]};
 }};
 const result=await readWalletTransferIndex({},wallet,{pool,routeList:[]});
 assert.equal(result.items.length,3);
 assert.equal(result.items[0].status,"journey-ambiguous");
 assert.equal(result.openCount,3);
 const sql=calls.find(x=>x.includes("FROM xita_transfer_operations p")&&x.includes("ORDER BY"));
 assert.match(sql,/COUNT\(\*\) FROM xita_transfer_operations sibling/);
 assert.match(sql,/sibling.parent_message_id=p.parent_message_id/);
 assert.match(sql,/AND NOT \(\(/);
 assert.match(sql,/COUNT\(\*\) FROM xita_transfer_operations c/);
});

test("transfer health coverage always includes token identity for same-name multi-assets",()=>{
 const routes=[{asset:"XGR",routeName:"base_to_xgr",sourceChain:"base",destinationChain:"xgrchain",routeId:"0x"+"a".repeat(64),gateway:"0x"+"1".repeat(40),deploymentBlock:10},
 {asset:"ARB",routeName:"base_to_xgr",sourceChain:"base",destinationChain:"xgrchain",routeId:"0x"+"b".repeat(64),gateway:"0x"+"2".repeat(40),deploymentBlock:20}];
 const coverage=routeIndexCoverage({},[],{routeList:routes});
 assert.deepEqual(coverage.routes.map(x=>x.asset),["XGR","ARB"]);
 assert.equal(coverage.requiredRoutes,2);
});

test("empty deployment catalog never exposes orphaned pending SQL operations",async()=>{
 const pool={query:()=>{throw Error("Old XITA SQL rows must not be queried without deployments");}};
 const {readTransferIndexStats}=await import("./transfer-index-store.mjs");
 const history=await readWalletTransferIndex({assets:{}},addr("a"),{pool});
 const stats=await readTransferIndexStats({assets:{}},{pool});
 assert.deepEqual(history.items,[]);
 assert.equal(history.openCount,0);
 assert.equal(history.coverage.requiredRoutes,0);
 assert.deepEqual(stats.hopEvents,[]);
 assert.deepEqual(stats.proofObserver.routes,[]);
});

test("active deployment routes get priority over retired route backlog (N-11)",async()=>{
 const wallet=addr("a"),active={sourceChain:"base",routeId:hash("b")};
 let query="",parameters=[];
 const pool={query:async arg=>{
  const sql=typeof arg==="string"?arg:arg.text;
  if(sql.includes("xita_transfer_index_cursors"))return {rows:[]};
  if(sql.includes("COUNT(*) FILTER"))return {rows:[{open:"0",unknown:"0"}]};
  if(sql.includes("FROM xita_transfer_operations p")&&sql.includes("ORDER BY")){
   query=sql;parameters=arg.values;return {rows:[]};
  }
  return {rows:[]};
 }};
 await readWalletTransferIndex({},wallet,{pool,routeList:[active],limit:5});
 assert.match(query,/p\.source_chain \|\| ':' \|\| trim\(p\.route_id\)/);
 assert.match(query,/ANY\(\$4::text\[\]\)/);
 assert.equal(parameters[2],5);
 assert.deepEqual(parameters[3],["base:"+hash("b")]);
});

test("canonical wallet projection distinguishes exactly matched zero grants from missing quote",async()=>{
 const wallet=addr("a"),source=hash("c"),msg=hash("d");
 const base={account:wallet,asset:"XGR",source_chain:"base",destination_chain:"xgrchain",
  route_name:"base_to_xgr",route_id:hash("f"),gateway:addr("1"),
  source_tx_hash:source,message_id:msg,source_block_number:100,
  amount_raw:"1",validator_fee_wei:"2",execution_adapter:addr("2"),
  interchain_fee_wei:"1000000000000",delivered:false};
 let intent="1",grants="0",queries=[];
 const pool={query:async arg=>{
  const sql=typeof arg==="string"?arg:arg.text;queries.push(sql);
  if(sql.includes("FROM xita_transfer_index_cursors"))return {rows:[]};
  if(sql.includes("COUNT(*) FILTER"))return {rows:[{open:"1",unknown:"0"}]};
  if(sql.includes("FROM xita_transfer_announcements"))return {rows:[]};
  if(sql.includes("FROM xita_transfer_proof_observations j"))return {rows:[]};
  if(sql.includes("FROM xita_transfer_operations p"))return {rows:[{
   ...base,sponsor_intent_matches:intent,sponsor_grant_count:grants}]};
  return {rows:[]};
 }};
 const read=async()=>readWalletTransferIndex({},wallet,{pool,routeList:[]});
 assert.equal((await read()).items[0].sponsorCommitmentEvidence,"no-grants");
 assert.ok(queries.some(q=>q.includes("xita_sponsor_quote_commitments")&&
  q.includes("i.quote_fee_wei=p.interchain_fee_wei")));
 grants="1";
 assert.equal((await read()).items[0].sponsorCommitmentEvidence,"committed-grants");
 grants="0";intent="0";
 assert.equal((await read()).items[0].sponsorCommitmentEvidence,"unverified");
 intent="2";
 assert.equal((await read()).items[0].sponsorCommitmentEvidence,"unverified");
});
