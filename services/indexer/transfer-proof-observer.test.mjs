import test from "node:test";
import assert from "node:assert/strict";
import {classifyProofObservation,proofRetrySeconds,enqueueProofObservations,
 claimProofObservation,observeProofJob} from "./transfer-proof-observer.mjs";
const hash=n=>"0x"+n.repeat(64);
test("prepared proof remains unsigned: the journal never stores calldata",()=>{
 const result=classifyProofObservation({status:"READY_UNSIGNED_CALL",data:"0xabcd"});
 assert.deepEqual(result,{state:"ready",reason:null,stage:"unsigned-call-ready"});
 assert.equal(Object.hasOwn(result,"data"),false);
 assert.equal(classifyProofObservation({status:"ALREADY_DELIVERED"}).state,"delivery-observed");
 assert.equal(classifyProofObservation({status:"FRESH_QUORUM_REQUIRED"}).reason,"PROOF_QUORUM_UNAVAILABLE");
});
test("a transient RPC failure is not a failed transfer or missing funds",()=>{
 const result=classifyProofObservation(null,{code:"PROOF_RPC_UNAVAILABLE",stage:"source-receipt"});
 assert.deepEqual(result,{state:"unavailable",reason:"PROOF_RPC_UNAVAILABLE",stage:"source-receipt"});
 assert.equal(classifyProofObservation(null,{code:"ARBITRARY",stage:"<invalid>"}).reason,"PROOF_NOT_READY");
 assert.ok(proofRetrySeconds("unavailable",3)>proofRetrySeconds("unavailable",1));
});
test("the observer only enqueues canonically finalized and undelivered messages",async()=>{
 const pool={query:async q=>{
  assert.match(q.text,/o.delivered IS FALSE/);
  assert.match(q.text,/ON CONFLICT/);
  assert.deepEqual(q.values,[200]);
  return {rowCount:2};
 }};
 assert.equal(await enqueueProofObservations(pool),2);
});
test("concurrent observers claim a transactionally leased, crash-recoverable job",async()=>{
 let queries=0;
 const pool={query:async q=>{
  queries++;
  if(queries===1){
   assert.match(q.text,/FOR UPDATE OF j SKIP LOCKED/);
   assert.match(q.text,/lease_until/);
   return {rows:[{source_chain:"arbitrum",message_id:hash("a"),attempts:2}]};
  }
  assert.match(q.text,/o.delivered IS FALSE/);
  return {rows:[{source_chain:"arbitrum",message_id:hash("a"),
   route_name:"arb_to_xgr",asset:"XGR",source_tx_hash:hash("b"),source_block_number:"134450134"}]};
 }};
 const job=await claimProofObservation(pool,{token:"11111111-1111-1111-1111-111111111111"});
 assert.equal(job.leaseToken,"11111111-1111-1111-1111-111111111111");
 assert.equal(job.source_chain,"arbitrum");
 assert.equal(queries,2);
});
test("proof process failure persists only classified retry diagnostics and no signing data",async()=>{
 let called=false;
 const pool={query:async q=>{
  called=true;
  assert.match(q.text,/lease_token=\$3/);
  assert.equal(q.values[4],"PROOF_CONFIG_MISMATCH");
  return {rows:[{message_id:hash("a")}]};
 }};
 const job={source_chain:"arbitrum",message_id:hash("a"),
  source_tx_hash:hash("b"),route_name:"arb_to_xgr",asset:"XGR",
  source_block_number:"134450134",attempts:0,leaseToken:"11111111-1111-1111-1111-111111111111"};
 const outcome=await observeProofJob({pool,catalog:{},job,runner:()=>{throw Error("Must not run on mismatched route");}});
 assert.equal(outcome.state,"unavailable");assert.equal(outcome.updated,true);
 assert.equal(called,true);
});

test("bounded queue skips previously observed old events to prevent new-transfer starvation",async()=>{
 const pool={query:async q=>{
  assert.match(q.text,/NOT EXISTS \(SELECT 1 FROM xita_transfer_proof_observations j/);
  return {rowCount:0};
 }};
 assert.equal(await enqueueProofObservations(pool),0);
});

test("provisional destination delivery does not suppress future finalized-state checks",async()=>{
 const {readFileSync}=await import("node:fs");
 const schema=readFileSync(new URL("./sql/008_transfer_proof_observations.sql",import.meta.url),"utf8");
 assert.doesNotMatch(schema,/WHERE state <> 'delivery-observed'/);
 let text="";
 const pool={query:async statement=>{text=statement.text;return {rows:[]};}};
 assert.equal(await claimProofObservation(pool),null);
 assert.match(text,/o.delivered IS FALSE/);
 assert.doesNotMatch(text,/j.state <> 'delivery-observed'/);
});

test("pending BLS signatures poll XGR locally without invoking full Base recovery",async()=>{
 const {readFileSync}=await import("node:fs");
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const row={source_chain:"base",route_name:"base_to_xgr",asset:"XGR",
  message_id:hash("a"),source_tx_hash:hash("b"),source_block_number:"134450134",attempts:2,
  previousReason:"PROOF_PENDING",lastFullCheckAt:new Date().toISOString(),
  leaseToken:"11111111-1111-1111-1111-111111111111"};
 let localPolls=0,fullChecks=0;
 const pool={query:async q=>{
  assert.match(q.text,/last_checked_at=CASE WHEN/);
  assert.equal(q.values.at(-1),false);
  assert.equal(q.values[4],"PROOF_PENDING");
  return {rows:[{message_id:row.message_id}]};
 }};
 const result=await observeProofJob({pool,catalog,job:row,
  quorumPoll:async ({route,messageId})=>{
   localPolls++;
   assert.match(route,/^iln_8453_1643_/);
   assert.equal(messageId,row.message_id);
   return "PARTIAL_QUORUM";
  },
  runner:async()=>{fullChecks++;throw Error("Base/Arbitrum RPC must not be called");}
 });
 assert.equal(result.state,"waiting");
 assert.equal(result.seconds,30);
 assert.equal(localPolls,1);
 assert.equal(fullChecks,0);
});
test("local quorum availability triggers full independent validation, never automatic signature",async()=>{
 const {readFileSync}=await import("node:fs");
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const row={source_chain:"base",route_name:"base_to_xgr",asset:"XGR",
  message_id:hash("a"),source_tx_hash:hash("b"),source_block_number:"134450134",attempts:1,
  previousReason:"PROOF_PENDING",lastFullCheckAt:new Date().toISOString(),
  leaseToken:"11111111-1111-1111-1111-111111111111"};
 let checks=0;
 const pool={query:async q=>{
  assert.equal(q.values.at(-1),false);
  return {rows:[{message_id:row.message_id}]};
 }};
 const result=await observeProofJob({pool,catalog,job:row,
  quorumPoll:async()=> "AVAILABLE_UNVERIFIED",
  runner:async()=>{checks++;return {status:"PENDING"};}
 });
 assert.equal(checks,1);
 assert.equal(result.state,"waiting");
 assert.equal(result.reason,"PROOF_PENDING");
});

test("all supported source chains use the same indexer-to-local-quorum admission without source RPC",async()=>{
 const {readFileSync}=await import("node:fs");
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const {deployedRoutes}=await import("../../apps/web/route-availability.js");
 const all=deployedRoutes(catalog);
 const sources=[...new Set(all.map(x=>x.source))];
 assert.ok(sources.includes("bsc")&&sources.includes("base")&&sources.includes("xgrchain"));
 for(const source of sources){
  const route=all.find(x=>x.source===source);
  const job={source_chain:source,route_name:route.name,asset:route.asset,
   message_id:hash("a"),source_tx_hash:hash("b"),source_block_number:"134450134",
   attempts:0,leaseToken:"11111111-1111-1111-1111-111111111111"};
  let polls=0,requests=0,full=0;
  const pool={query:async q=>{
   assert.match(q.text,/lease_token=\$3/);
   assert.deepEqual(q.values.slice(0,3),[source,job.message_id,job.leaseToken]);
   assert.equal(q.values[4],"PROOF_PENDING");
   assert.equal(q.values[6],30);
   return {rows:[{message_id:job.message_id}]};
  }};
  const result=await observeProofJob({pool,catalog,job,
   quorumPoll:async ({route:routeName,messageId})=>{
    polls++;assert.equal(messageId,job.message_id);
    assert.equal(routeName,`iln_${catalog.chains[source].domainId}_${catalog.chains[route.destination].domainId}_${route.routeId.slice(2)}`);
    return "NOT_FOUND";
   },
   quorumRequest:async ({route:routeName,messageId,sourceBlock,sourceTxHash})=>{
    requests++;assert.ok(routeName.startsWith("iln_"));
    assert.equal(messageId,job.message_id);
    assert.equal(sourceBlock,134450134);
    assert.equal(sourceTxHash,job.source_tx_hash);
   },
   runner:async()=>{full++;throw Error("no origin chain RPC before quorum");}
  });
  assert.equal(result.state,"waiting",source);
  assert.equal(polls,1,source);
  assert.equal(requests,1,source);
  assert.equal(full,0,source);
 }
});
test("pending, retrying and partially collected quorums do not re-admit or query source",async()=>{
 const {readFileSync}=await import("node:fs");
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 for(const status of ["PENDING","PARTIAL_QUORUM","RETRYING_VALIDATION"]){
  let requests=0,recovery=0;
  const job={source_chain:"bsc",route_name:"bsc_to_xgr",asset:"XGR",
   message_id:hash("a"),source_tx_hash:hash("b"),source_block_number:"134450134",
   attempts:4,leaseToken:"11111111-1111-1111-1111-111111111111"};
  const result=await observeProofJob({pool:{query:async()=>({rows:[{message_id:job.message_id}]})},
   catalog,job,quorumPoll:async()=>status,quorumRequest:async()=>{requests++;},
   runner:async()=>{recovery++;}});
  assert.equal(result.state,"waiting");
  assert.equal(requests,0);
  assert.equal(recovery,0);
 }
});
test("local XGR RPC outage cannot fall through into remote proof recovery",async()=>{
 const {readFileSync}=await import("node:fs");
 const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const job={source_chain:"bsc",route_name:"bsc_to_xgr",asset:"XGR",
  message_id:hash("a"),source_tx_hash:hash("b"),source_block_number:"134450134",
  attempts:4,leaseToken:"11111111-1111-1111-1111-111111111111"};
 let rpc=0;
 const result=await observeProofJob({pool:{query:async()=>({rows:[{message_id:job.message_id}]})},
  catalog,job,quorumPoll:async()=>{throw Error("local offline");},
  quorumRequest:async()=>{rpc++;},runner:async()=>{rpc++;}});
 assert.equal(result.state,"unavailable");
 assert.equal(rpc,0);
});
test("the observer claims the exact finalized source block from SQL, not a user hint",async()=>{
 const pool={query:async q=>{
  if(q.text.includes("SKIP LOCKED"))return {rows:[{source_chain:"bsc",message_id:hash("a"),attempts:0}]};
  assert.match(q.text,/o.source_block_number/);
  return {rows:[{source_chain:"bsc",message_id:hash("a"),source_block_number:"134450134",
   route_name:"bsc_to_xgr",asset:"XGR",source_tx_hash:hash("b")}]};
 }};
 const value=await claimProofObservation(pool,{token:"11111111-1111-1111-1111-111111111111"});
 assert.equal(value.source_block_number,"134450134");
});
