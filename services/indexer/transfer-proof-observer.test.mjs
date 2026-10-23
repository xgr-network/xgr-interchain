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
   route_name:"arb_to_xgr",asset:"XGR",source_tx_hash:hash("b")}]};
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
  attempts:0,leaseToken:"11111111-1111-1111-1111-111111111111"};
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
