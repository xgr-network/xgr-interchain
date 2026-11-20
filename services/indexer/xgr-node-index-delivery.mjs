// Future SQL-only destination projector. The read-only XGR Node index owns
// finalized Mailbox calls. NEVER interpret unavailable evidence as not
// delivered, and never trust an unbounded public RPC argument.
const HASH=/^0x[0-9a-f]{64}$/i;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const nodeName=chain=>chain==="xgrchain"?"xgr":chain;

export function verifyIndexedDelivery({route,messageId,evidence,now=Date.now()}){
 if(!route||!HASH.test(messageId||"")||evidence?.version!==1||
    evidence.messageId!==messageId||
    evidence.destinationChainId!==route.destinationConfig?.chainId||
    !same(evidence.mailbox,route.destinationMailbox)||
    !ADDRESS.test(evidence.destinationRouter||"")||
    !HASH.test(evidence.finalizedBlockHash||"")||
    !Number.isSafeInteger(evidence.finalizedBlockNumber)||
    evidence.finalizedBlockNumber<=0||
    evidence.evidenceStatus!=="FINALIZED_READ_MODEL_NOT_BLS_EVIDENCE"||
    typeof evidence.delivered!=="boolean"||
    !Number.isFinite(Date.parse(evidence.observedAt))||
    Date.parse(evidence.observedAt)>now+30000||
    (!evidence.delivered&&now-Date.parse(evidence.observedAt)>120000))
  throw Error("Indexed delivery evidence absent, stale or route-mismatched");
 return {delivered:evidence.delivered,finalizedHead:evidence.finalizedBlockNumber,
  finalizedHash:evidence.finalizedBlockHash};
}

// This is the *replacement* for refreshPendingDeliveries's foreign-chain RPC.
// Exact (source_chain,route_id) filters, 60s per message, bounded size and
// scheduling metadata are preserved; failure never overwrites delivery state.
export async function refreshNodeIndexedDeliveries({pool,routes,rpc,limit=40}={}){
 if(!pool||!Array.isArray(routes)||typeof rpc!=="function"||
    !Number.isInteger(limit)||limit<1||limit>100)
  throw Error("Missing Node delivery projection dependencies");
 const byRoute=new Map(routes.map(route=>
  [route.sourceChain+":"+route.routeId,route]));
 if(byRoute.size===0)return {checked:0,delivered:0,unknown:0};
 const pairs=[...byRoute.values()];
 const bind=n=>"$"+n;
 const sqlPairs=pairs.map((_,i)=>
  "("+bind(2*i+1)+"::text,"+bind(2*i+2)+"::char(66))").join(",");
 const values=pairs.flatMap(r=>[r.sourceChain,r.routeId]);
 const pending=await pool.query({text:`SELECT o.source_chain,o.route_id,o.message_id
 FROM public.xita_transfer_operations o
 WHERE EXISTS(SELECT 1 FROM (VALUES ${sqlPairs})
  AS active(source_chain,route_id)
  WHERE active.source_chain=o.source_chain AND active.route_id=o.route_id)
 AND o.delivered IS DISTINCT FROM TRUE
 AND (o.delivery_attempted_at IS NULL OR
  o.delivery_attempted_at<=NOW()-INTERVAL '60 seconds')
 ORDER BY o.delivery_attempted_at ASC NULLS FIRST,o.source_indexed_at ASC
 LIMIT ${bind(values.length+1)}`,values:[...values,limit]});
 let checked=0,delivered=0,unknown=0;
 for(const row of pending.rows){
  try{
   const route=byRoute.get(row.source_chain+":"+row.route_id);
   if(!route)throw Error("Unknown indexed delivery route");
   const evidence=await rpc("xgr_getILNIndexedDelivery",[
    nodeName(row.source_chain),row.message_id]);
   const result=verifyIndexedDelivery({route,messageId:row.message_id,evidence});
   await pool.query({text:`UPDATE public.xita_transfer_operations SET
      delivered=$3,delivery_checked_at=NOW(),destination_checked_block=$4,
      destination_checked_hash=$5 WHERE source_chain=$1 AND message_id=$2`,
    values:[row.source_chain,row.message_id,result.delivered,
     result.finalizedHead,result.finalizedHash]});
   checked++;if(result.delivered)delivered++;
  }catch{unknown++}
  finally{
   await pool.query({text:`UPDATE public.xita_transfer_operations
     SET delivery_attempted_at=NOW() WHERE source_chain=$1 AND message_id=$2`,
    values:[row.source_chain,row.message_id]}).catch(()=>{});
  }
 }
 return {checked,delivered,unknown};
}
