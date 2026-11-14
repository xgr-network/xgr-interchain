// Operator-only F-19 escalation journal. No signer, wallet, HTTP endpoint,
// retry, waiver or payment code is imported here. Every manual action must
// refer to the immutable stored paid obligation, never a caller-made claim.
export const REVIEW_OUTCOMES=Object.freeze([
 "acknowledged","escalated","customer-contacted","evidence-requested"
]);
const KEY=/^[a-z][a-z0-9-]{0,39}:0x[a-f0-9]{64}:(first-delivery|hub-onward|final-delivery)$/;
const ADDRESS=/^0x[a-f0-9]{40}$/;
const SHA=/^[a-f0-9]{64}$/;
export async function recordSponsorObligationReview({
 pool,grantKey,sponsorAddress,outcome,evidenceSha256=null
}={}){
 if(!pool||typeof pool.query!=="function"||!KEY.test(grantKey||"")||
    !ADDRESS.test(sponsorAddress||"")||
    !REVIEW_OUTCOMES.includes(outcome)||
    (evidenceSha256!==null&&!SHA.test(evidenceSha256)))
  throw Error("Invalid operator sponsorship review input");
 const result=await pool.query({
  text:"INSERT INTO public.xita_sponsor_obligation_reviews "+
   "(grant_key,sponsor_address,outcome,evidence_sha256)"+
   " SELECT o.grant_key,o.sponsor_address,$3,$4"+
   " FROM public.xita_sponsor_overtaken_obligations o"+
   " WHERE o.grant_key=$1 AND o.sponsor_address=$2"+
   " AND NOT EXISTS (SELECT 1 FROM public.xita_sponsor_grants g"+
   " WHERE g.grant_key=o.grant_key AND g.sponsor_address=o.sponsor_address"+
   " AND g.chain_name=o.chain_name AND g.amount_wei=o.promised_wei"+
   " AND g.status='confirmed')"+
   " RETURNING review_id,grant_key,outcome,reviewer,recorded_at",
  values:[grantKey,sponsorAddress,outcome,evidenceSha256]});
 if(result.rows?.length!==1)throw Error("No matching unresolved paid obligation for review");
 // Only operator metadata, no customer identity or signed wallet details.
 return {reviewId:String(result.rows[0].review_id),
  grantKey:result.rows[0].grant_key,
  outcome:result.rows[0].outcome,
  reviewer:result.rows[0].reviewer,recordedAt:result.rows[0].recorded_at};
}
export async function reviewSponsorObligationCLI({
 env=process.env,args=process.argv.slice(2),print=console.log
}={}){
 const [grantKey,outcome,evidenceSha256]=args;
 if(args.length<2||args.length>3)throw Error("Usage: grant-key outcome [sha256]");
 const dbUrl=env.XITA_SPONSOR_REVIEW_DATABASE_URL;
 const sponsorAddress=String(env.XITA_INTERCHAIN_FEE_ADDRESS||"").toLowerCase();
 if(!dbUrl)throw Error("Separate restricted sponsor reviewer database URL required");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:dbUrl,max:1,
  connectionTimeoutMillis:3000,statement_timeout:8000});
 try{
  const row=await recordSponsorObligationReview({
   pool,grantKey,sponsorAddress,outcome,evidenceSha256:evidenceSha256||null
  });
  print(JSON.stringify(row));
  return row;
 }finally{await pool.end()}
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 reviewSponsorObligationCLI().catch(error=>{
  console.error("Sponsor review not recorded:",String(error?.message||error).slice(0,170));
  process.exitCode=1;
 });
}
