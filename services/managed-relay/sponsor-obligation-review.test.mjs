import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {recordSponsorObligationReview,REVIEW_OUTCOMES} from "./sponsor-obligation-review.mjs";

const key="base:0x"+"a".repeat(64)+":first-delivery";
const addr="0x"+"b".repeat(40);

test("F-19 operator reviews are explicit, append-only, and require immutable unsettled promise",async()=>{
 const queries=[];
 const pool={query:async q=>{
  queries.push(q);
  return {rows:[{review_id:17,grant_key:key,outcome:"escalated",
   reviewer:"xita_sponsor_reviewer",recorded_at:"2026-11-14T18:00:00Z"}]};
 }};
 const row=await recordSponsorObligationReview({
  pool,grantKey:key,sponsorAddress:addr,outcome:"escalated"
 });
 assert.equal(row.reviewId,"17");
 assert.equal(row.outcome,"escalated");
 assert.equal(queries.length,1);
 const q=queries[0];
 assert.match(q.text,/INSERT INTO public\.xita_sponsor_obligation_reviews/);
 assert.match(q.text,/FROM public\.xita_sponsor_overtaken_obligations o/);
 assert.match(q.text,/o\.sponsor_address=\$2/);
 assert.match(q.text,/g\.status='confirmed'/);
 assert.deepEqual(q.values,[key,addr,"escalated",null]);
 assert.doesNotMatch(q.text,/UPDATE |DELETE |broadcastTransaction|sendTransaction/i);
});
test("F-19 unmatched, confirmed, fabricated or invalid manual outcomes cannot be recorded",async()=>{
 const none={query:async()=>({rows:[]})};
 await assert.rejects(()=>recordSponsorObligationReview({
  pool:none,grantKey:key,sponsorAddress:addr,outcome:"acknowledged"
 }),/No matching unresolved/);
 for(const props of [
  {grantKey:"unknown"},{sponsorAddress:"0x"+"0".repeat(40)+"x"},
  {outcome:"paid"},{outcome:"settled"},
  {evidenceSha256:"abcd"}
 ]){
  await assert.rejects(()=>recordSponsorObligationReview({
   pool:none,grantKey:key,sponsorAddress:addr,outcome:"escalated",...props
  }),/Invalid operator/);
 }
 assert.deepEqual(REVIEW_OUTCOMES,
  ["acknowledged","escalated","customer-contacted","evidence-requested"]);
 const src=readFileSync(new URL("./sponsor-obligation-review.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(src,/signTransaction|broadcastTransaction|sendTransaction|PRIVATE_KEY|processCreatorQueue/);
 const migration=readFileSync(new URL("../indexer/sql/017_sponsor_obligation_reviews.sql",import.meta.url),"utf8");
 assert.match(migration,/REVOKE ALL ON public\.xita_sponsor_obligation_reviews FROM PUBLIC/);
 assert.match(migration,/GRANT SELECT,INSERT ON public\.xita_sponsor_obligation_reviews TO xita_sponsor_reviewer/);
 assert.doesNotMatch(migration,/GRANT UPDATE|GRANT DELETE/);
});
