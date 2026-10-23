// PostgreSQL read model for finalized XITA Gateway messages. No private keys,
// no custody, no inferred mint/unlock and no USD TVL derived from event counts.
import {indexedRoutes} from "./transfer-index.mjs";
export {linkIndexedJourneys} from "../../apps/web/verified-journey.js";
import {linkIndexedJourneys} from "../../apps/web/verified-journey.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i, HASH=/^0x[0-9a-f]{64}$/i;
const lowercase=x=>String(x||"").toLowerCase();
let readerPool=null;
let writerPool=null;
async function makePool(url){
 const {Pool}=await import("pg");
 return new Pool({connectionString:url,max:3,connectionTimeoutMillis:2500,
  idleTimeoutMillis:20000,statement_timeout:8000});
}
export async function transferReaderPool(url=process.env.XITA_INDEXER_DATABASE_URL){
 if(!url)return null;
 if(!readerPool)readerPool=await makePool(url);
 return readerPool;
}
export async function transferWriterPool(url=process.env.XITA_TRANSFER_WORKER_DATABASE_URL){
 if(!url)throw Error("XITA_TRANSFER_WORKER_DATABASE_URL missing");
 if(!writerPool)writerPool=await makePool(url);
 return writerPool;
}
const iso=v=>v?new Date(v).toISOString():null;
export function routeIndexCoverage(catalog,cursors,{now=Date.now(),maxAgeMs=600000,routeList=null}={}){
 const routes=routeList||indexedRoutes(catalog);
 const rows=new Map(cursors.map(c=>[c.source_chain+":"+c.route_id,c]));
 const detail=routes.map(r=>{
  const c=rows.get(r.sourceChain+":"+r.routeId);
  const match=Boolean(c&&lowercase(c.gateway)===lowercase(r.gateway)&&
   lowercase(c.route_id)===lowercase(r.routeId)&&
   Number(c.deployment_block)===r.deploymentBlock);
  const scanned=match?Number(c.scanned_to):r.deploymentBlock-1;
  const head=match?Number(c.finalized_head):null;
  const freshness=match&&Number.isFinite(Date.parse(c.updated_at))&&
   Math.abs(now-Date.parse(c.updated_at))<=maxAgeMs;
  return {source:r.sourceChain,destination:r.destinationChain,route:r.routeName,
   scannedTo:scanned,finalizedHead:head,updatedAt:match?iso(c.updated_at):null,
   complete:Boolean(match&&freshness&&head!==null&&head>=r.deploymentBlock&&scanned>=head)};
 });
 return {complete:detail.length>0&&detail.every(r=>r.complete),
  indexedRoutes:detail.filter(r=>r.complete).length,requiredRoutes:detail.length,
  routes:detail};
}
export function indexedTransferRow(row){
 const delivered=row.delivered===true?true:row.delivered===false?false:null;
 return {account:lowercase(row.account),asset:row.asset,
  sourceChain:row.source_chain,destinationChain:row.destination_chain,
  routeName:row.route_name,routeId:lowercase(row.route_id),
  gateway:lowercase(row.gateway),txHash:lowercase(row.source_tx_hash),
  messageId:lowercase(row.message_id),confirmed:true,delivered,
  status:delivered===true?(row.onward_route_id?"awaiting-onward":"delivered"):
   delivered===false?"awaiting-proof":"delivery-unknown",
  sourceBlockNumber:Number(row.source_block_number),
  amountRaw:row.amount_raw===null?null:String(row.amount_raw),
  validatorFeeWei:row.validator_fee_wei===null?null:String(row.validator_fee_wei),
  executionAdapter:row.execution_adapter?lowercase(row.execution_adapter):null,
  interchainFeeWei:row.interchain_fee_wei==null?null:String(row.interchain_fee_wei),
  finalDestinationChain:row.final_destination_chain??null,
  finalRecipient:row.final_recipient?lowercase(row.final_recipient):null,
  onwardRouteId:row.onward_route_id?lowercase(row.onward_route_id):null,
  parentMessageId:row.parent_message_id?lowercase(row.parent_message_id):null};
}
// A source's destination delivery is NOT proof that a two-hop journey
// reached the final chain. Link only the uniquely confirmed second-hop
// adapter event (parentMessageId) and independently checked Mailbox result.
// Correlate only a FINALIZED completed second hop to a paid parent.
// The same predicate is used by the pending worklist and complete counts.
const matchingChildCondition=`c.source_chain='xgrchain'
 AND c.parent_message_id=p.message_id AND c.account=p.account
 AND c.asset=p.asset AND c.route_id=p.onward_route_id
 AND c.destination_chain=p.final_destination_chain
 AND c.final_recipient=p.final_recipient AND c.amount_raw=p.amount_raw
 AND c.execution_adapter IS NOT NULL`;
const completedChildPredicate=`((
 SELECT COUNT(*) FROM xita_transfer_operations c
 WHERE ${matchingChildCondition})=1
 AND EXISTS (SELECT 1 FROM xita_transfer_operations c
 WHERE ${matchingChildCondition} AND c.delivered IS TRUE))`;
// Exclude only a uniquely linked child from the wallet-facing journey count.
// The child remains in the immutable ledger and linked parent details.
const linkedChildPredicate=`p.parent_message_id IS NOT NULL AND p.source_chain='xgrchain'
 AND p.execution_adapter IS NOT NULL AND (
 SELECT COUNT(*) FROM xita_transfer_operations parent
 WHERE parent.message_id=p.parent_message_id
 AND parent.account=p.account AND parent.asset=p.asset
 AND parent.delivered IS TRUE AND parent.onward_route_id=p.route_id
 AND parent.final_destination_chain=p.destination_chain
 AND parent.final_recipient=p.final_recipient
 AND parent.amount_raw=p.amount_raw)=1
 AND (
 SELECT COUNT(*) FROM xita_transfer_operations sibling
 WHERE sibling.source_chain='xgrchain'
 AND sibling.parent_message_id=p.parent_message_id
 AND sibling.account=p.account AND sibling.asset=p.asset
 AND sibling.route_id=p.route_id
 AND sibling.destination_chain=p.destination_chain
 AND sibling.final_recipient=p.final_recipient
 AND sibling.amount_raw=p.amount_raw
 AND sibling.execution_adapter IS NOT NULL)=1`;
export async function readWalletTransferIndex(catalog,account,{
 pool=null,limit=100,onlyPending=false,now=Date.now(),routeList=null}={}){
 if(!ADDRESS.test(account||"")||!Number.isSafeInteger(limit)||limit<1||limit>100)
  throw Error("Invalid account or transfer index limit");
 const connected=pool||await transferReaderPool();
 if(!connected)return {kind:"xita-wallet-transfer-index-v1",status:"unavailable",
  wallet:lowercase(account),items:[],coverage:{complete:false,requiredRoutes:0,indexedRoutes:0,routes:[]}};
 const cursors=await connected.query(
  "SELECT source_chain,route_name,gateway,route_id,deployment_block,scanned_to,finalized_head,updated_at FROM xita_transfer_index_cursors"
 );
 const coverage=routeIndexCoverage(catalog,cursors.rows,{now,routeList});
 const rows=await connected.query({
  text:`SELECT account,asset,source_chain,destination_chain,route_name,route_id,gateway,
    source_tx_hash,message_id,source_block_number,amount_raw::text AS amount_raw,
    validator_fee_wei::text AS validator_fee_wei,delivered,
    execution_adapter,interchain_fee_wei::text AS interchain_fee_wei,
    final_destination_chain,final_recipient,onward_route_id,parent_message_id
    FROM xita_transfer_operations p
    WHERE p.account=$1 AND NOT (${linkedChildPredicate}) AND ($2::boolean IS FALSE OR p.delivered IS DISTINCT FROM TRUE
      OR (p.onward_route_id IS NOT NULL AND NOT ${completedChildPredicate}))
    -- Always surface unresolved work before older/newer completed transfers.
    -- A 100-row wallet page must not hide a pending bridge behind 100
    -- completed transactions. Do not infer delivery from pagination.
    ORDER BY CASE WHEN (p.delivered IS DISTINCT FROM TRUE OR
      (p.onward_route_id IS NOT NULL AND NOT ${completedChildPredicate}))
      THEN 0 ELSE 1 END,
      p.source_indexed_at DESC,p.source_tx_hash DESC LIMIT $3`,
  values:[lowercase(account),onlyPending,limit]
 });
 const totals=await connected.query({text:`SELECT
   COUNT(*) FILTER (WHERE p.delivered IS FALSE OR
     (p.delivered IS TRUE AND p.onward_route_id IS NOT NULL
      AND NOT ${completedChildPredicate}))::text AS open,
   COUNT(*) FILTER (WHERE p.delivered IS NULL)::text AS unknown
   FROM xita_transfer_operations p WHERE p.account=$1 AND NOT (${linkedChildPredicate})`,
  values:[lowercase(account)]});
 const rawItems=rows.rows.map(indexedTransferRow);
 const parents=rawItems.filter(item=>item.onwardRouteId&&item.delivered===true)
  .map(item=>item.messageId);
 let children=[];
 if(parents.length){
  const linked=await connected.query({text:`SELECT account,asset,
   source_chain,destination_chain,route_name,route_id,gateway,
   source_tx_hash,message_id,source_block_number,amount_raw::text AS amount_raw,
   validator_fee_wei::text AS validator_fee_wei,delivered,execution_adapter,
   interchain_fee_wei::text AS interchain_fee_wei,
   final_destination_chain,final_recipient,onward_route_id,parent_message_id
   FROM xita_transfer_operations
   WHERE account=$1 AND source_chain='xgrchain'
     AND parent_message_id::text = ANY($2::text[]) LIMIT 200`,
   values:[lowercase(account),parents]});
  children=linked.rows.map(indexedTransferRow);
 }
 // Optional persistent proof-observer state: read-only diagnostic metadata
 // for the already verified and account-scoped canonical source messages.
 // No journal status (even ready) authorizes signing or marks delivery.
 let linkedItems=linkIndexedJourneys(rawItems,children);
 const observedIds=[...new Set([...rawItems,...children].filter(item=>
   item.confirmed===true&&HASH.test(item.messageId||"")).map(item=>item.messageId))];
 if(observedIds.length){
  try{
   const proof=await connected.query({text:`SELECT j.source_chain,j.message_id,
    j.state,j.reason,j.stage,j.last_checked_at,j.updated_at
    FROM xita_transfer_proof_observations j
    JOIN xita_transfer_operations o USING(source_chain,message_id)
    WHERE o.account=$1 AND o.delivered IS FALSE
      AND j.message_id::text = ANY($2::text[])`,
    values:[lowercase(account),observedIds]});
   const byKey=new Map(proof.rows.map(row=>[row.source_chain+":"+lowercase(row.message_id),{
    state:row.state,reason:row.reason||null,stage:row.stage||null,
    checkedAt:iso(row.last_checked_at),updatedAt:iso(row.updated_at)
   }]));
   linkedItems=linkedItems.map(item=>{
    const own=byKey.get(item.sourceChain+":"+lowercase(item.messageId));
    const next=children.find(child=>item.secondHopTxHash&&
      lowercase(child.txHash)===lowercase(item.secondHopTxHash)&&
      lowercase(child.messageId)===lowercase(item.secondHopMessageId));
    const final=next&&byKey.get(next.sourceChain+":"+lowercase(next.messageId));
    return {...item,...(own?{proofObservation:own}:{}),
      ...(final?{finalProofObservation:final}:{})};
   });
  }catch(error){
   // Existing databases remain functional before SQL 008 is installed.
   if(!["42P01","42501"].includes(error?.code))throw error;
  }
 }
 // The staging table is untrusted. Display ONLY observed source TXs for which
 // the separate RPC worker verified tx.from and the canonical Gateway target.
 // Reported-only wallet claims are NEVER exposed in another wallet's history.
 // Missing migration must not break the existing canonical wallet API.
 let observed=[];
 try{
  const staged=await connected.query({text:`SELECT a.source_chain,a.source_tx_hash,
    a.account,a.state FROM xita_transfer_announcements a
    WHERE a.account=$1 AND a.state='observed'
      AND a.first_reported_at > NOW()-INTERVAL '48 hours'
      AND NOT EXISTS (SELECT 1 FROM xita_transfer_operations o
       WHERE o.source_chain=a.source_chain AND o.source_tx_hash=a.source_tx_hash)
    ORDER BY a.first_reported_at DESC LIMIT $2`,
   values:[lowercase(account),limit]});
  observed=staged.rows.filter(r=>r.state==="observed"&&
    ADDRESS.test(r.account||"")&&HASH.test(r.source_tx_hash||"")&&
   lowercase(r.account)===lowercase(account)).map(row=>({
    account:lowercase(account),sourceChain:row.source_chain,
    txHash:lowercase(row.source_tx_hash),status:"pending-source",
    confirmed:false,delivered:null,messageId:null,unverified:true
   }));
 }catch(error){
  if(!["42P01","42501"].includes(error?.code))throw error;
 }
 const main=onlyPending?linkedItems.filter(i=>
  !["delivered","journey-delivered"].includes(i.status)):linkedItems;
 const seen=new Set(main.map(r=>r.sourceChain+":"+r.txHash));
 // Newly observed wallet transactions must not be hidden behind the first
 // 100 older canonical rows while the historical backfill is still running.
 const items=[...observed.filter(r=>!seen.has(r.sourceChain+":"+r.txHash)),
  ...main].slice(0,limit);
 const summary=totals.rows[0]||{open:"0",unknown:"0"};
 return {kind:"xita-wallet-transfer-index-v1",
  status:coverage.complete?"complete":"partial",wallet:lowercase(account),
  coverage,items,openCount:Number(summary.open),
  unknownCount:Number(summary.unknown),
  truncated:rawItems.length===limit};
}
export async function readTransferIndexStats(catalog,{pool=null,now=Date.now(),routeList=null}={}){
 const connected=pool||await transferReaderPool();
 if(!connected)return {kind:"xita-transfer-index-stats-v1",
  status:"unavailable",coverage:{complete:false},hopEvents:null};
 const c=await connected.query("SELECT source_chain,route_name,gateway,route_id,deployment_block,scanned_to,finalized_head,updated_at FROM xita_transfer_index_cursors");
 const coverage=routeIndexCoverage(catalog,c.rows,{now,routeList});
 const sum=await connected.query(`SELECT asset,delivered,COUNT(*)::text AS count,
    SUM(amount_raw)::text AS amount_raw
    FROM xita_transfer_operations GROUP BY asset,delivered ORDER BY asset,delivered`);
 // Aggregate route diagnostics only: never expose accounts, tx/message hashes,
 // proof calldata, or interpret quorum/readiness as destination delivery.
 let proofObserver={status:"not-provisioned",routes:[]};
 try{
  const checks=await connected.query(`SELECT o.source_chain,o.destination_chain,
    o.route_name,j.state,j.reason,COUNT(*)::text AS count,
    MAX(j.last_checked_at) AS last_checked_at
    FROM xita_transfer_proof_observations j
    JOIN xita_transfer_operations o USING(source_chain,message_id)
    WHERE o.delivered IS FALSE
    GROUP BY o.source_chain,o.destination_chain,o.route_name,j.state,j.reason
    ORDER BY o.source_chain,o.destination_chain,o.route_name,j.state,j.reason`);
  proofObserver={status:"available",routes:checks.rows.map(row=>({
   source:row.source_chain,destination:row.destination_chain,route:row.route_name,
   state:row.state,reason:row.reason||null,count:Number(row.count),
   checkedAt:iso(row.last_checked_at)}))};
 }catch(error){
  if(!["42P01","42501"].includes(error?.code))throw error;
 }
 return {kind:"xita-transfer-index-stats-v1",status:coverage.complete?"complete":"partial",
  coverage,proofObserver,hopEvents:sum.rows.map(row=>({asset:row.asset,
   state:row.delivered===true?"delivered":row.delivered===false?"pending":"unknown",
   count:Number(row.count),amountRaw:row.amount_raw})),
  note:"Hop event counts and raw source amounts; NOT distinct journeys, TVL, or USD movement."};
}
