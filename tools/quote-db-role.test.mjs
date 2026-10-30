import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quoteWriterRoleFromEnvironment} from "./quote-db-role.mjs";

const env=(role,db="xita")=>
 "XITA_TAX_QUOTE_DATABASE_URL=postgresql://"+role+":SECRET%23PASSWORD@127.0.0.1:5432/"+db+"\n";

test("detects deployed signer's actual restricted database login without exposing password",()=>{
 assert.equal(quoteWriterRoleFromEnvironment(env("xita_tax_quote_writer")),"xita_tax_quote_writer");
 assert.equal(quoteWriterRoleFromEnvironment(env("xita_fee_quote_writer")),"xita_fee_quote_writer");
 assert.equal(quoteWriterRoleFromEnvironment(env("xita_transfer_worker")),"xita_transfer_worker");
 assert.equal(quoteWriterRoleFromEnvironment(env("xita_fee_quote_writer","customdb"),"customdb"),"xita_fee_quote_writer");
 assert.equal(quoteWriterRoleFromEnvironment("# comment\n"+env("xita_fee_quote_writer")+"\nXITA_INTERCHAIN_SPONSOR_ENABLED=true"),"xita_fee_quote_writer");
});
test("refuses missing, ambiguous, wrong DB, unrelated role or unsafe URL without credentials",()=>{
 for(const input of ["",env("xita_tax_quote_writer")+env("xita_tax_quote_writer"),
  env("xita_tax_quote_writer","wrongdb"),env("postgres"),env("xita_indexer_reader"),
  env("xita_sponsor_worker"),env("xita_sponsor_status_reader"),
  "XITA_TAX_QUOTE_DATABASE_URL=https://example.com/key\n",
  "XITA_TAX_QUOTE_DATABASE_URL=BAD_CREDENTIAL\n"]){
  assert.throws(()=>quoteWriterRoleFromEnvironment(input));
 }
});
test("role repair retains exact privilege boundaries and is wired before signer restart",()=>{
 const sql=readFileSync(new URL("../services/indexer/sql/011_quote_writer_runtime_grants.sql",import.meta.url),"utf8");
 const manage=readFileSync(new URL("../manage.sh",import.meta.url),"utf8");
 const installer=manage.split("install_wallet_aware_sponsor_db() (")[1]?.split("\n)\n")[0];
 const update=manage.split("\ncomplete_update() {")[1]?.split("\n}\n")[0];
 assert.ok(installer);
 assert.match(installer,/quote-db-role\.mjs/);
 assert.match(installer,/011_quote_writer_runtime_grants\.sql/);
 assert.ok(update.indexOf("install_wallet_aware_sponsor_db")<update.indexOf("restart xita-interchain-fee-quote.service"));
 assert.match(sql,/has_table_privilege\(writer,'public\.xita_tax_quote_evidence','INSERT'\)/);
 assert.match(sql,/GRANT INSERT ON TABLE public\.xita_sponsor_quote_intents, public\.xita_sponsor_quote_commitments/);
 assert.match(sql,/GRANT SELECT ON TABLE public\.xita_sponsor_quote_commitments, public\.xita_sponsor_grants/);
 assert.match(sql,/public\.xita_sponsor_quote_resolutions, public\.xita_transfer_operations, public\.xita_sponsor_quote_intents TO %I/);
 assert.match(sql,/has_table_privilege\(writer,'public\.xita_transfer_operations','SELECT'\)/);
 assert.match(sql,/has_table_privilege\(writer,'public\.xita_sponsor_quote_resolutions','SELECT'\)/);
 assert.match(sql,/has_table_privilege\(writer,'public\.xita_sponsor_quote_intents','SELECT'\)/);
 const server=readFileSync(new URL("../services/managed-relay/server.mjs",import.meta.url),"utf8");
 const readiness=server.split("async function paidQuoteDatabaseReady(){")[1]?.split("\nconst previewMemo=")[0];
 assert.ok(readiness);
 assert.match(readiness,/has_table_privilege\(current_user,'public\.xita_transfer_operations','SELECT'\)/);
 assert.match(readiness,/has_table_privilege\(current_user,'public\.xita_sponsor_quote_resolutions','SELECT'\)/);
 assert.match(readiness,/has_table_privilege\(current_user,'public\.xita_sponsor_quote_intents','SELECT'\)/);
 assert.doesNotMatch(sql,/GRANT ALL|TO PUBLIC|GRANT UPDATE|GRANT DELETE/);
});

test("update checks signed quote role before publishing website and restarts signer afterward",()=>{
 const manage=readFileSync(new URL("../manage.sh",import.meta.url),"utf8");
 const update=manage.split("\ncomplete_update() {")[1]?.split("\n}\n")[0];
 assert.ok(update);
 assert.ok(update.indexOf("install_wallet_aware_sponsor_db")<update.indexOf("publish_web"));
 assert.ok(update.indexOf("publish_web")<update.indexOf("restart xita-interchain-fee-quote.service"));
});
