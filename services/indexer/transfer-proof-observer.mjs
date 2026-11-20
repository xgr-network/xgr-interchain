// Durable, READ-ONLY XITA proof observer. No wallets, gas, private keys,
// eth_sendTransaction or destination Mailbox.process execution.
// A new browser, two open tabs or an observer restart see the SAME DB journal.
// The original Gateway operation remains the immutable source of truth.
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {transferWriterPool} from "./transfer-index-store.mjs";
import {resolveRecoveryRoute,runRecoveryProcess,ilnValidatorRouteName} from "./transfer-recovery.mjs";
import {pollLocalQuorum,requestIndexedQuorum} from "./xgr-quorum-poll.mjs";
const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const HASH=/^0x[0-9a-f]{64}$/i;
const REASON=/^PROOF_[A-Z0-9_]{3,48}$/;
const STAGE=/^[a-z][a-z0-9-]{1,54}$/;
export const proofRetrySeconds=(state,attempts=0)=>state==="ready"?90:
 state==="delivery-observed"?120:
 state==="waiting"?Math.min(180,30*Math.max(1,Math.min(attempts,6))):
 Math.min(300,20*2**Math.min(4,Math.max(0,attempts-1)));
export function classifyProofObservation(outcome,error=null){
 if(error){
  return {state:"unavailable",reason:REASON.test(error.code||"")?error.code:"PROOF_NOT_READY",
   stage:STAGE.test(error.stage||"")?error.stage:null};
 }
 switch(outcome?.status){
  case "READY_UNSIGNED_CALL":return {state:"ready",reason:null,stage:"unsigned-call-ready"};
  case "ALREADY_DELIVERED":return {state:"delivery-observed",reason:null,stage:"mailbox-recheck"};
  case "FRESH_QUORUM_REQUIRED":return {state:"waiting",reason:"PROOF_QUORUM_UNAVAILABLE",stage:"quorum"};
  case "PENDING":return {state:"waiting",reason:"PROOF_PENDING",stage:"validator-proof"};
  default:return {state:"unavailable",reason:"PROOF_NOT_READY",stage:null};
 }
}
export async function enqueueProofObservations(pool,{limit=200}={}){
 if(!Number.isInteger(limit)||limit<1||limit>500)throw Error("Unsafe observer enqueue limit");
 // A source is queued ONLY after finality-aware index verification and an
 // independently observed, explicitly false destination Mailbox state.
 const v=await pool.query({text:`INSERT INTO xita_transfer_proof_observations(source_chain,message_id)
 SELECT o.source_chain,o.message_id FROM xita_transfer_operations o
 WHERE o.delivered IS FALSE
 AND NOT EXISTS (SELECT 1 FROM xita_transfer_proof_observations j
   WHERE j.source_chain=o.source_chain AND j.message_id=o.message_id)
 ORDER BY o.source_indexed_at ASC LIMIT $1
 ON CONFLICT (source_chain,message_id) DO NOTHING`,values:[limit]});
 return v.rowCount??0;
}
export async function claimProofObservation(pool,{token=randomUUID()}={}){
 if(!/^[0-9a-f-]{36}$/i.test(token))throw Error("Invalid observer lease token");
 // Lease is transactional, per canonical message, and recoverable after a
 // process crash. PostgreSQL SKIP LOCKED avoids duplicate concurrent jobs.
 const leased=await pool.query({text:`WITH due AS (
 SELECT j.source_chain,j.message_id FROM xita_transfer_proof_observations j
 JOIN xita_transfer_operations o USING(source_chain,message_id)
 WHERE o.delivered IS FALSE
 AND j.next_check_at<=NOW()
 AND (j.lease_until IS NULL OR j.lease_until<NOW())
 ORDER BY j.next_check_at ASC,j.updated_at ASC
 FOR UPDATE OF j SKIP LOCKED LIMIT 1
 )
 UPDATE xita_transfer_proof_observations j SET state='checking',
 lease_token=$1,lease_until=NOW()+INTERVAL '75 seconds',updated_at=NOW()
 FROM due WHERE j.source_chain=due.source_chain AND j.message_id=due.message_id
 RETURNING j.source_chain,j.message_id,j.attempts,j.reason,j.last_checked_at`,values:[token]});
 const item=leased.rows[0];
 if(!item)return null;
 // The FK deletes the job when a finalized source event is reorg-retracted.
 const origin=await pool.query({text:`SELECT o.source_chain,o.message_id,
  o.route_name,o.asset,o.source_tx_hash,o.source_block_number FROM xita_transfer_operations o
 WHERE o.source_chain=$1 AND o.message_id=$2 AND o.delivered IS FALSE`,
 values:[item.source_chain,item.message_id]});
 if(!origin.rows.length)return null;
 return {...origin.rows[0],attempts:Number(item.attempts),previousReason:item.reason,
  lastFullCheckAt:item.last_checked_at,leaseToken:token};
}
// The indexer is only a discovery source. Never infer a validator vote from
// its SQL data. Admission carries ONLY a source transaction locator; every
// validator independently authenticates complete source evidence.
export async function observeProofJob({pool,catalog,job,runner=runRecoveryProcess,
 quorumPoll=pollLocalQuorum,quorumRequest=requestIndexedQuorum}={}){
 if(!pool||!catalog||!job||!HASH.test(job.message_id||"")||
    !HASH.test(job.source_tx_hash||"")||
    !Number.isSafeInteger(Number(job.source_block_number))||
    Number(job.source_block_number)<1)
  throw Error("Observer requires an indexed canonical source operation");
 let decision;
 try{
  let configured;
  try{
   configured=resolveRecoveryRoute(catalog,job.route_name,job.message_id,
    job.asset,job.source_tx_hash);
  }catch(error){
   throw Object.assign(error,{code:"PROOF_CONFIG_MISMATCH"});
  }
  if(configured.route.source!==job.source_chain)
   throw Object.assign(Error("Source chain mismatch"),{code:"PROOF_CONFIG_MISMATCH"});
  const chain=catalog.chains[configured.route.source];
  const target=catalog.chains[configured.route.destination];
  const route=ilnValidatorRouteName(chain.domainId,target.domainId,configured.route.routeId);
  // A local RPC status query is inexpensive and does not query the origin
  // chain. Never fall back to a full source-proof recovery for a missing vote.
  const status=await quorumPoll({route,messageId:job.message_id});
  if(status==="AVAILABLE_UNVERIFIED"){
   // Only an existing cryptographic quorum permits the original full,
   // unsigned delivery builder. It still checks destination state and BLS.
   const outcome=await runner(configured,{timeoutMs:35000});
   decision=classifyProofObservation(outcome);
  }else if(status==="NOT_FOUND"||status==="EXPIRED_RETRY"){
   // The existing node queue is idempotent. No source RPCs are consulted
   // here, and a pending/retrying status never causes an admission flood.
   await quorumRequest({route,messageId:job.message_id,
    sourceBlock:Number(job.source_block_number),sourceTxHash:job.source_tx_hash});
   decision={state:"waiting",reason:"PROOF_PENDING",stage:"quorum"};
  }else if(["PENDING","PARTIAL_QUORUM","RETRYING_VALIDATION"].includes(status)){
   decision={state:"waiting",reason:"PROOF_PENDING",stage:"quorum"};
  }else{
   throw Object.assign(Error("Unrecognized local quorum state"),{code:"PROOF_NOT_READY"});
  }
 }catch(error){
  decision=classifyProofObservation(null,error);
 }
 // The DB lease prevents concurrent duplicates. Local-only polling every
 // 30s is sufficient; failed local RPCs back off and never cause source reads.
 const attempt=job.attempts+1;
 const seconds=decision.state==="waiting"?30:proofRetrySeconds(decision.state,attempt);
 const fullCheck=decision.state==="ready"||decision.state==="delivery-observed"||
   decision.stage==="unsigned-call-ready"||decision.stage==="mailbox-recheck";
 const result=await pool.query({text:`UPDATE xita_transfer_proof_observations
 SET state=$4,reason=$5,stage=$6,attempts=attempts+1,
 lease_token=NULL,lease_until=NULL,
 last_checked_at=CASE WHEN $8::boolean THEN NOW() ELSE last_checked_at END,
 next_check_at=NOW()+($7::integer * INTERVAL '1 second'),updated_at=NOW()
 WHERE source_chain=$1 AND message_id=$2 AND lease_token=$3
 RETURNING message_id`,
 values:[job.source_chain,job.message_id,job.leaseToken,
 decision.state,decision.reason,decision.stage,seconds,fullCheck]});
 return {...decision,seconds,updated:result.rows.length===1};
}
export async function tickProofObserver({pool,catalog,runner=runRecoveryProcess}){
 const enqueued=await enqueueProofObservations(pool);
 // At most two independent, leased read-only proof preparations concurrently.
 // The shared DB can keep serving wallet reads; no destination TX is sent.
 const jobs=await Promise.all([claimProofObservation(pool),claimProofObservation(pool)]);
 const present=jobs.filter(Boolean);
 const results=await Promise.all(present.map(job=>observeProofJob({pool,catalog,job,runner})));
 return {enqueued,observed:present.length>0,
  jobs:present.map((job,i)=>({sourceChain:job.source_chain,state:results[i].state,
   reason:results[i].reason,updated:results[i].updated}))};
}
export async function runProofObserver({intervalMs=15000}={}){
 const pool=await transferWriterPool();
 let running=true;
 const stop=()=>{running=false;};
 process.once("SIGTERM",stop);process.once("SIGINT",stop);
 try{
  while(running){
   const began=Date.now();
   try{
    const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
    const outcome=await tickProofObserver({pool,catalog});
    for(const job of outcome.jobs||[])if(job.state==="unavailable")
     console.warn("[xita-proof-observer]",job.sourceChain,job.reason);
   }catch(error){
    // Missing SQL migration or DB permission is an operational problem,
    // never an excuse to mark any transfer failed or delivered.
    console.error("[xita-proof-observer] read-only observer unavailable",
     String(error?.code||error?.message||error).slice(0,180));
   }
   if(running)await new Promise(resolve=>setTimeout(resolve,Math.max(2500,intervalMs-(Date.now()-began))));
  }
 }finally{await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 runProofObserver().catch(error=>{console.error(error);process.exitCode=1;});
