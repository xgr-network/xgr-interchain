// Audit only: refuses any database except the isolated loopback CI fixture.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const mod=p=>import(pathToFileURL(resolve(p)).href);
const {Client}=await mod('services/managed-relay/node_modules/pg/lib/index.js');
const {recordSponsorObligationReview}=await mod('services/managed-relay/sponsor-obligation-review.mjs');
const uri=new URL(process.env.XITA_SPONSOR_TEST_DATABASE_URL);
assert.equal(uri.hostname,'127.0.0.1');assert.equal(uri.pathname,'/xita_sponsor_ci');assert.equal(uri.username,'xita_ci');
const db=new Client({connectionString:uri.href});
const addr='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),key='base:0x'+'c'.repeat(64)+':first-delivery';
const result={scope:'isolated disposable PostgreSQL, historical positive control then exact migration 018; no production access',checks:{}};
await db.connect();
try{
 assert.equal((await db.query('SELECT current_database() AS db')).rows[0].db,'xita_sponsor_ci');
 await db.query('DROP TRIGGER IF EXISTS xita_sponsor_review_provenance ON public.xita_sponsor_obligation_reviews');
 await db.query(readFileSync('services/indexer/sql/017_sponsor_obligation_reviews.sql','utf8'));
 await db.query('TRUNCATE public.xita_sponsor_obligation_reviews,public.xita_sponsor_overtaken_obligations,public.xita_sponsor_grants CASCADE');
 await db.query('INSERT INTO public.xita_sponsor_overtaken_obligations(grant_key,chain_name,stage,sponsor_address,promised_wei) VALUES($1,$2,$3,$4,50)',[key,'xgrchain','first-delivery',addr]);
 await db.query('SET ROLE xita_sponsor_reviewer');
 const old=await db.query('INSERT INTO public.xita_sponsor_obligation_reviews(grant_key,sponsor_address,outcome,reviewer,recorded_at) VALUES($1,$2,$3,$4,$5) RETURNING sponsor_address,reviewer,recorded_at',[key,other,'escalated','forged-actor','2000-01-01T00:00:00Z']);
 assert.equal(old.rowCount,1);assert.equal(old.rows[0].reviewer,'forged-actor');
 result.checks.historical_017_counterexample_reproduced=true;
 await db.query('RESET ROLE');
 await db.query(readFileSync('services/indexer/sql/018_sponsor_review_attribution.sql','utf8'));
 await db.query('SET ROLE xita_sponsor_reviewer');
 const forbidden=[
  ['INSERT INTO public.xita_sponsor_obligation_reviews(grant_key,sponsor_address,outcome,reviewer,recorded_at) VALUES($1,$2,$3,$4,$5)',[key,other,'escalated','forged-actor','2000-01-01T00:00:00Z']],
  ['UPDATE public.xita_sponsor_obligation_reviews SET outcome=\'acknowledged\'',[]],
  ['DELETE FROM public.xita_sponsor_obligation_reviews',[]],
  ['SELECT recipient FROM public.xita_sponsor_grants',[]]
 ];
 for(const [sql,params] of forbidden){await assert.rejects(()=>db.query(sql,params),e=>e.code==='42501');}
 result.checks.spoof_update_delete_private_read_denied=true;
 const start=Date.now();
 const good=await recordSponsorObligationReview({pool:db,grantKey:key,sponsorAddress:addr,outcome:'acknowledged'});
 assert.equal(good.reviewer,'xita_sponsor_reviewer');
 const saved=(await db.query('SELECT sponsor_address,reviewer,recorded_at FROM public.xita_sponsor_obligation_reviews WHERE review_id=$1',[good.reviewId])).rows[0];
 assert.equal(saved.sponsor_address,addr);assert.equal(saved.reviewer,'xita_sponsor_reviewer');assert.ok(new Date(saved.recorded_at).getTime()>=start-5000);
 result.checks.correct_cli_and_database_owned_metadata=true;
 await assert.rejects(()=>recordSponsorObligationReview({pool:db,grantKey:key,sponsorAddress:other,outcome:'escalated'}),/No matching unresolved/);
 await assert.rejects(()=>db.query('INSERT INTO public.xita_sponsor_obligation_reviews(grant_key,outcome) VALUES($1,$2)',['base:0x'+'d'.repeat(64)+':first-delivery','escalated']),e=>e.code==='23503');
 result.checks.wrong_sponsor_and_unknown_obligation_denied=true;
 await db.query('RESET ROLE');
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM public.xita_sponsor_overtaken_obligations WHERE grant_key=$1',[key])).rows[0].n,1);
 assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM public.xita_sponsor_obligation_reviews WHERE reviewer='forged-actor'")).rows[0].n,1);
 result.checks.original_liability_and_historical_rows_preserved=true;
 writeFileSync('closure-evidence/reviewer-closure.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await db.query('RESET ROLE').catch(()=>{});await db.end();}
