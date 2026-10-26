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
import {pollLocalQuorum,quorumPollDecision} from "./xgr-quorum-poll.mjs";
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
  o.route_name,o.asset,o.source_tx_hash FROM xita_transfer_operations o
 WHERE o.source_chain=$1 AND o.message_id=$2 AND o.delivered IS FALSE`,
 values:[item.source_chain,item.message_id]});
 if(!origin.rows.length)return null;
 return {...origin.rows[0],attempts:Number(item.attempts),previousReason:item.reason,
  lastFullCheckAt:item.last_checked_at,leaseToken:token};
}
export async function observeProofJob({pool,catalog,job,runner=runRecoveryProcess,
 quorumPoll=pollLocalQuorum,now=Date.now}={}){
 if(!pool||!catalog||!job||!HASH.test(job.message_id||"")||
    !HASH.test(job.source_tx_hash||""))
  throw Error("Observer requires a finalized canonical source operation");
 let decision,lightweight=false;
 try{
  // Withdrawal or mismatch of a deployed route is an explicit configuration
  // failure, never a missing validator signature.
  let configured;
  try{
   configured=resolveRecoveryRoute(catalog,job.route_name,job.message_id,
    job.asset,job.source_tx_hash);
  }catch(error){
   throw Object.assign(error,{code:"PROOF_CONFIG_MISMATCH"});
  }
  if(configured.route.source!==job.source_chain)
   throw Object.assign(Error("Route mismatch"),{code:"PROOF_CONFIG_MISMATCH"});
  // Poll only the local XGRChain quorum journal while signatures are pending.
  // Existing source safety evidence remains canonical in the SQL operation.
  // A positive status never signs: it triggers the original full verifier.
  if(["PROOF_PENDING","PROOF_QUORUM_UNAVAILABLE"].includes(job.previousReason)){
   const route=ilnValidatorRouteName(configured.route.source==="xgrchain"?1643:
    catalog.chains[configured.route.source].domainId,
    catalog.chains[configured.route.destination].domainId,configured.route.routeId);
   const status=await quorumPoll({route,messageId:job.message_id});
   const decisionType=quorumPollDecision(status,{
    lastFullCheckMs:Date.parse(job.lastFullCheckAt||"")||0,now:now()});
   if(decisionType==="wait"){
    lightweight=true;
    decision={state:"waiting",reason:job.previousReason,stage:"quorum"};
   }
  }
  if(!lightweight){
   const outcome=await runner(configured,{timeoutMs:35000});
   decision=classifyProofObservation(outcome);
  }
 }catch(error){
  decision=classifyProofObservation(null,error);
 }
 const attempt=job.attempts+1,seconds=lightweight?10:
  decision.state==="waiting"?10:proofRetrySeconds(decision.state,attempt);
 const result=await pool.query({text:`UPDATE xita_transfer_proof_observations
 SET state=$4,reason=$5,stage=$6,attempts=attempts+1,
 lease_token=NULL,lease_until=NULL,
 last_checked_at=CASE WHEN $8::boolean THEN last_checked_at ELSE NOW() END,
 next_check_at=NOW()+($7::integer * INTERVAL '1 second'),updated_at=NOW()
 WHERE source_chain=$1 AND message_id=$2 AND lease_token=$3
 RETURNING message_id`,
 values:[job.source_chain,job.message_id,job.leaseToken,
 decision.state,decision.reason,decision.stage,seconds,lightweight]});
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
