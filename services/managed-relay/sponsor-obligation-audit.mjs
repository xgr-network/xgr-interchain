// Operator-only F-07/F-19 monitoring, not a payment/retry mechanism.
// Read-only queries: no signer key, nonce mutation, payout or Join changes.
const ADDRESS=/^0x[0-9a-f]{40}$/i;
export const GRANT_ALERT_SQL=[
 "WITH classified AS (SELECT chain_name,CASE",
 " WHEN status='reserved' AND tx_hash IS NULL",
 "  AND created_at<NOW()-INTERVAL '3 minutes'",
 "  THEN 'F-07:reserved-without-tx-hash'",
 " WHEN status='needs-review' THEN 'grant-needs-operator-review'",
 " WHEN status='submitted' AND tx_hash IS NOT NULL",
 "  AND created_at<NOW()-INTERVAL '15 minutes'",
 "  THEN 'submitted-not-yet-finalized'",
 " ELSE NULL END AS issue FROM xita_sponsor_grants",
 " WHERE sponsor_address=$1",
 " AND status IN ('reserved','submitted','needs-review'))",
 " SELECT chain_name,'any'::text AS grant_stage,issue,COUNT(*)::text AS count",
 " FROM classified WHERE issue IS NOT NULL",
 " GROUP BY chain_name,issue ORDER BY chain_name,issue"
].join(" ");

// Indexed canonical TX1 matched to the immutable signed-quote commitment;
// delivery is not proof that a quoted gas grant was fulfilled. This query
// reports the condition without attempting to settle any financial claim.
export const PAID_ALERT_SQL=[
 "WITH paid AS (",
 " SELECT c.grant_chain AS chain_name,c.grant_stage,",
 " p.delivered,g.status AS grant_status,g.grant_key,g.tx_hash,",
 " g.created_at AS grant_created_at",
 " FROM xita_sponsor_quote_intents i",
 " JOIN xita_sponsor_quote_commitments c ON",
 " c.source_chain=i.source_chain AND c.execution_adapter=i.execution_adapter",
 " AND c.payer=i.payer AND c.quote_nonce=i.quote_nonce",
 " JOIN xita_transfer_operations p ON",
 " p.source_chain=i.source_chain AND p.execution_adapter=i.execution_adapter",
 " AND p.account=i.payer AND p.quote_nonce=i.quote_nonce",
 " AND p.interchain_fee_wei=i.quote_fee_wei",
 " AND p.route_id=i.route_id AND p.asset=i.asset",
 " AND p.amount_raw=i.amount_raw AND p.final_recipient=i.final_recipient",
 " AND p.parent_message_id IS NULL",
 " LEFT JOIN xita_sponsor_grants g ON",
 " g.grant_key=p.source_chain||':'||p.message_id||':'||c.grant_stage",
 " AND g.chain_name=c.grant_chain AND g.sponsor_address=$1",
 " AND g.recipient=p.account AND g.amount_wei=c.promised_wei",
 " WHERE p.source_indexed_at<NOW()-INTERVAL '5 minutes'",
 "), classified AS (",
 " SELECT chain_name,grant_stage,CASE",
 " WHEN delivered IS TRUE AND grant_status IS DISTINCT FROM 'confirmed'",
 "  THEN 'F-19:delivered-before-grant-confirmed'",
 " WHEN grant_key IS NULL THEN 'F-19:paid-commitment-without-matching-grant'",
 " WHEN grant_status='reserved' AND tx_hash IS NULL",
 "  THEN 'F-07:paid-grant-reserved-without-hash'",
 " WHEN grant_status='needs-review' THEN 'paid-grant-needs-review'",
 " WHEN grant_status='submitted'",
 "  AND grant_created_at<NOW()-INTERVAL '15 minutes'",
 "  THEN 'paid-grant-confirmation-delayed'",
 " ELSE NULL END AS issue FROM paid",
 ") SELECT chain_name,grant_stage,issue,COUNT(*)::text AS count",
 " FROM classified WHERE issue IS NOT NULL",
 " GROUP BY chain_name,grant_stage,issue",
 " ORDER BY chain_name,grant_stage,issue"
].join(" ");

// F-19: include durable externally overtaken promises in the operator report.
// Existing records are never paid, deleted or labelled settled by this query.
export const OVERTAKEN_ALERT_SQL=[
 "SELECT o.chain_name,o.stage AS grant_stage,",
 " 'F-19:durable-overtaken-obligation'::text AS issue,",
 " COUNT(*)::text AS count",
 " FROM xita_sponsor_overtaken_obligations o",
 " WHERE o.sponsor_address=$1",
 " AND NOT EXISTS (SELECT 1 FROM xita_sponsor_grants g",
 " WHERE g.grant_key=o.grant_key AND g.sponsor_address=o.sponsor_address",
 " AND g.chain_name=o.chain_name AND g.amount_wei=o.promised_wei",
 " AND g.status='confirmed')",
 " GROUP BY o.chain_name,o.stage ORDER BY o.chain_name,o.stage"
].join(" ");

function normalizedAlerts(rows,source){
 if(!Array.isArray(rows))throw Error("Invalid sponsor audit result");
 return rows.filter(row=>row.issue!==null).map(row=>{
  const count=Number(row.count);
  if(!Number.isSafeInteger(count)||count<=0||
     !/^[a-z][a-z0-9-]{0,39}$/.test(row.chain_name||"")||
     !/^(any|first-delivery|hub-onward|final-delivery)$/.test(row.grant_stage||"")||
     !/^[a-zA-Z0-9:-]{1,90}$/.test(row.issue||""))
   throw Error("Invalid sponsor audit aggregate");
  return {source,chain:row.chain_name,stage:row.grant_stage,
   issue:row.issue,count};
 });
}
export async function inspectSponsorObligations({pool,sponsorAddress}={}){
 if(!pool||typeof pool.query!=="function"||
    !ADDRESS.test(sponsorAddress||"")||/^0x0{40}$/i.test(sponsorAddress))
  throw Error("Invalid sponsor audit identity");
 const address=sponsorAddress.toLowerCase();
 // Aggregate in PostgreSQL: no customer address, nonce or message ID returned.
 const grants=await pool.query({text:GRANT_ALERT_SQL,values:[address]});
 const paid=await pool.query({text:PAID_ALERT_SQL,values:[address]});
 const overtaken=await pool.query({text:OVERTAKEN_ALERT_SQL,values:[address]});
 const alerts=[
  ...normalizedAlerts(grants.rows,"grant-journal"),
  ...normalizedAlerts(paid.rows,"indexed-paid-commitments"),
  ...normalizedAlerts(overtaken.rows,"durable-overtaken-obligations")
 ];
 return {kind:"xita-sponsor-obligation-audit-v1",
  status:alerts.length?"attention":"no-aged-alerts",
  grantAlertGroups:alerts.filter(a=>a.source==="grant-journal").length,
  paidAlertGroups:alerts.filter(a=>a.source==="indexed-paid-commitments").length,
  overtakenAlertGroups:alerts.filter(a=>a.source==="durable-overtaken-obligations").length,
  alerts};
}
export async function inspectSponsorObligationsCLI({env=process.env,print=console.log}={}){
 const url=String(env.XITA_SPONSOR_STATUS_DATABASE_URL||"").trim();
 const sponsorAddress=String(env.XITA_INTERCHAIN_FEE_ADDRESS||"").trim();
 if(!url||!ADDRESS.test(sponsorAddress)||/^0x0{40}$/i.test(sponsorAddress))
  throw Error("Read-only sponsor status DB and public sponsor address required");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:url,max:1,
  connectionTimeoutMillis:3000,statement_timeout:8000,
  options:"-c default_transaction_read_only=on"});
 try{
  const client=await pool.connect();
  try{
   const report=await inspectSponsorObligations({pool:client,sponsorAddress});
   print(JSON.stringify(report));
   return report.status==="no-aged-alerts"?0:2;
  }finally{client.release()}
 }finally{await pool.end()}
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 inspectSponsorObligationsCLI().then(code=>{process.exitCode=code},
  error=>{console.error("XITA sponsor audit failed:",
   String(error?.message||error).slice(0,180));process.exitCode=1});
}
