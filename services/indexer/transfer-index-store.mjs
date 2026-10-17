// PostgreSQL read model for finalized XITA Gateway messages. No private keys,
// no custody, no inferred mint/unlock and no USD TVL derived from event counts.
import {indexedRoutes} from "./transfer-index.mjs";
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
export function linkIndexedJourneys(items,children){
 const byParent=new Map;
 for(const child of children||[]){
  if(!HASH.test(child.parentMessageId||"")||child.sourceChain!=="xgrchain"||
     !HASH.test(child.messageId||""))continue;
  const key=child.parentMessageId;
  byParent.set(key,[...(byParent.get(key)||[]),child]);
 }
 return (items||[]).map(item=>{
  if(!item.onwardRouteId||item.delivered!==true)return item;
  const matches=(byParent.get(item.messageId)||[]).filter(child=>
    lowercase(child.account)===lowercase(item.account)&&
    child.asset===item.asset&&
    lowercase(child.routeId)===lowercase(item.onwardRouteId)&&
    child.destinationChain===item.finalDestinationChain&&
    lowercase(child.finalRecipient)===lowercase(item.finalRecipient)&&
    child.amountRaw===item.amountRaw&&
    child.executionAdapter!=null);
  if(matches.length>1)return {...item,status:"journey-ambiguous"};
  if(!matches.length)return {...item,status:"awaiting-onward"};
  const next=matches[0];
  return {...item,
   secondHopTxHash:next.txHash,secondHopMessageId:next.messageId,
   status:next.delivered===true?"journey-delivered":
    next.delivered===false?"awaiting-final-proof":"final-delivery-unknown",
   finalDelivered:next.delivered};
 });
}
// Correlate only a FINALIZED completed second hop to a paid parent.
// The same predicate is used by the pending worklist and complete counts.
const completedChildPredicate=`EXISTS (SELECT 1 FROM xita_transfer_operations c
 WHERE c.source_chain='xgrchain'
 AND c.parent_message_id=p.message_id AND c.account=p.account
 AND c.asset=p.asset AND c.route_id=p.onward_route_id
 AND c.destination_chain=p.final_destination_chain
 AND c.final_recipient=p.final_recipient AND c.amount_raw=p.amount_raw
 AND c.execution_adapter IS NOT NULL AND c.delivered IS TRUE)`;
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
    WHERE p.account=$1 AND ($2::boolean IS FALSE OR p.delivered IS DISTINCT FROM TRUE
      OR (p.onward_route_id IS NOT NULL AND NOT ${completedChildPredicate}))
    ORDER BY p.source_indexed_at DESC,p.source_tx_hash DESC LIMIT $3`,
  values:[lowercase(account),onlyPending,limit]
 });
 const totals=await connected.query({text:`SELECT
   COUNT(*) FILTER (WHERE p.delivered IS FALSE OR
     (p.delivered IS TRUE AND p.onward_route_id IS NOT NULL
      AND NOT ${completedChildPredicate}))::text AS open,
   COUNT(*) FILTER (WHERE p.delivered IS NULL)::text AS unknown
   FROM xita_transfer_operations p WHERE p.account=$1`,
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
 const linkedItems=linkIndexedJourneys(rawItems,children);
 const items=onlyPending?linkedItems.filter(i=>
  !["delivered","journey-delivered"].includes(i.status)):linkedItems;
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
 return {kind:"xita-transfer-index-stats-v1",status:coverage.complete?"complete":"partial",
  coverage,hopEvents:sum.rows.map(row=>({asset:row.asset,
   state:row.delivered===true?"delivered":row.delivered===false?"pending":"unknown",
   count:Number(row.count),amountRaw:row.amount_raw})),
  note:"Hop event counts and raw source amounts; NOT distinct journeys, TVL, or USD movement."};
}
