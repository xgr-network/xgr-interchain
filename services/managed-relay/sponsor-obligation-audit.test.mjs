import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GRANT_ALERT_SQL,PAID_ALERT_SQL,inspectSponsorObligations} from "./sponsor-obligation-audit.mjs";
const sponsor="0x"+"a".repeat(40);
test("F-07: only stale unjournaled nonces and review-worthy grants are reported",()=>{
 assert.match(GRANT_ALERT_SQL,/status='reserved' AND tx_hash IS NULL/);
 assert.match(GRANT_ALERT_SQL,/INTERVAL '3 minutes'/);
 assert.match(GRANT_ALERT_SQL,/status='submitted'/);
 assert.match(GRANT_ALERT_SQL,/status='needs-review'/);
 assert.match(GRANT_ALERT_SQL,/sponsor_address=\$1/);
});
test("F-19: only independently indexed paid and quote-matched promises are counted",()=>{
 for(const item of [
  /JOIN xita_sponsor_quote_commitments/,
  /JOIN xita_transfer_operations/,
  /p\.quote_nonce=i\.quote_nonce/,
  /p\.interchain_fee_wei=i\.quote_fee_wei/,
  /p\.route_id=i\.route_id/,
  /p\.amount_raw=i\.amount_raw/,
  /p\.final_recipient=i\.final_recipient/,
  /p\.parent_message_id IS NULL/,
  /p\.source_indexed_at<NOW\(\)-INTERVAL '5 minutes'/,
  /delivered IS TRUE AND grant_status IS DISTINCT FROM 'confirmed'/,
  /grant_key IS NULL/,
  /g\.chain_name=c\.grant_chain/,
  /g\.sponsor_address=\$1/,
  /g\.recipient=p\.account/,
  /g\.amount_wei=c\.promised_wei/
 ])assert.match(PAID_ALERT_SQL,item);
});
test("auditor uses exactly two SELECT queries, no write, keys or customer identities",async()=>{
 const calls=[],pool={query:async q=>{
  calls.push(q);
  return {rows:calls.length===1?
   [{chain_name:"xgrchain",grant_stage:"any",
     issue:"F-07:reserved-without-tx-hash",count:"2"}]:
   [{chain_name:"arbitrum",grant_stage:"final-delivery",
     issue:"F-19:delivered-before-grant-confirmed",count:"1"}]};
 }};
 const result=await inspectSponsorObligations({pool,sponsorAddress:sponsor.toUpperCase().replace("0X","0x")});
 assert.equal(result.kind,"xita-sponsor-obligation-audit-v1");
 assert.equal(result.status,"attention");
 assert.equal(result.grantAlertGroups,1);
 assert.equal(result.paidAlertGroups,1);
 assert.deepEqual(result.alerts.map(a=>a.count),[2,1]);
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(c=>c.values),[[sponsor],[sponsor]]);
 const all=calls.map(c=>c.text).join("\n");
 assert.doesNotMatch(all,/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|CREATE|CALL)\b/i);
 assert.doesNotMatch(JSON.stringify(result),new RegExp(sponsor));
});
test("clear result does not claim audited settlement; invalid aggregates fail closed",async()=>{
 const clean={query:async()=>({rows:[]})};
 const result=await inspectSponsorObligations({pool:clean,sponsorAddress:sponsor});
 assert.equal(result.status,"no-aged-alerts");
 await assert.rejects(()=>inspectSponsorObligations({
  pool:{query:async()=>({rows:[{chain_name:"base",grant_stage:"any",
    issue:"F-07:reserved-without-tx-hash",count:"-1"}]})},sponsorAddress:sponsor
 }),/Invalid sponsor audit aggregate/);
 await assert.rejects(()=>inspectSponsorObligations({pool:clean,sponsorAddress:"not-an-address"}),/Invalid/);
});
test("risk-audit entrypoint cannot send payments, load signer or touch Join",()=>{
 const source=readFileSync(new URL("./sponsor-obligation-audit.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/sendTransaction|broadcastTransaction|signTransaction|PRIVATE_KEY|runSponsorSweep|updateFile|onboarding|join\.js/);
 assert.match(source,/default_transaction_read_only=on/);
});
