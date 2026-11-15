import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Client} from 'pg';
import {recordSponsorObligationReview} from './sponsor-obligation-review.mjs';
const db=new Client({connectionString:process.env.XITA_SPONSOR_TEST_DATABASE_URL});
const addr='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40);
const key='base:0x'+'c'.repeat(64)+':first-delivery';
const result={scope:'isolated PostgreSQL only',checks:{}};
await db.connect();
try{
  await db.query('CREATE ROLE xita_sponsor_reviewer NOLOGIN NOSUPERUSER NOBYPASSRLS NOREPLICATION');
  await db.query(readFileSync('services/indexer/sql/017_sponsor_obligation_reviews.sql','utf8'));
  await db.query('TRUNCATE xita_sponsor_obligation_reviews,xita_sponsor_overtaken_obligations,xita_sponsor_grants CASCADE');
  await db.query('INSERT INTO xita_sponsor_overtaken_obligations(grant_key,chain_name,stage,sponsor_address,promised_wei) VALUES($1,$2,$3,$4,50)',[key,'xgrchain','first-delivery',addr]);
  await db.query('SET ROLE xita_sponsor_reviewer');
  const valid=await recordSponsorObligationReview({pool:db,grantKey:key,sponsorAddress:addr,outcome:'acknowledged'});
  result.checks.normal_cli_succeeds=valid.reviewer==='xita_sponsor_reviewer';
  try{await db.query('UPDATE xita_sponsor_obligation_reviews SET outcome=\'escalated\'');result.checks.update_denied=false}catch(e){result.checks.update_denied=e.code==='42501'}
  try{await db.query('SELECT recipient FROM xita_sponsor_grants');result.checks.private_column_denied=false}catch(e){result.checks.private_column_denied=e.code==='42501'}
  const forged=await db.query('INSERT INTO xita_sponsor_obligation_reviews(grant_key,sponsor_address,outcome,reviewer,recorded_at) VALUES($1,$2,$3,$4,$5) RETURNING sponsor_address,reviewer,recorded_at',[key,other,'escalated','another-operator','2000-01-01T00:00:00Z']);
  result.checks.table_insert_accepts_unbound_actor_time_and_sponsor=forged.rowCount===1&&forged.rows[0].reviewer==='another-operator'&&forged.rows[0].sponsor_address===other;
  result.forged_metadata={reviewer:forged.rows[0].reviewer,recorded_at:forged.rows[0].recorded_at};
  await db.query('RESET ROLE');
  result.checks.liability_preserved=(await db.query('SELECT COUNT(*)::int AS n FROM xita_sponsor_overtaken_obligations WHERE grant_key=$1',[key])).rows[0].n===1;
  assert.equal(result.checks.normal_cli_succeeds,true);
  assert.equal(result.checks.update_denied,true);
  assert.equal(result.checks.private_column_denied,true);
  writeFileSync('audit-evidence/reviewer-role.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await db.end()}
