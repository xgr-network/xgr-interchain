import test from "node:test";
import assert from "node:assert/strict";
import {saveQuoteEvidence} from "./tax-evidence.mjs";
const addr=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
const payer=addr("a"),adapter=addr("b");
const row={source:"base",adapter,payer,nonce:"42",fee:"100000",
 ip:"203.0.113.2",country:"DE",sourceCountry:"local",revision:null,
 coin:"ethereum",eurRate:"2500",euro:"1.00",priceAt:new Date().toISOString(),
 issuedAt:new Date(1761375600000).toISOString(),
 expiresAt:new Date(1761375690000).toISOString()};
const quote={payer,gateway:addr("c"),routeId:hash("1"),destinationDomain:1643,
 recipient:"0x"+"0".repeat(24)+payer.slice(2),finalDestinationDomain:42161,
 finalRecipient:"0x"+"0".repeat(24)+payer.slice(2),
 onwardRouteId:hash("2"),amount:"1000000000000000000",
 bridgeValueWei:"100",interchainFeeWei:row.fee,nonce:row.nonce,issuedAt:1761375600};
const quoteReply={status:"SIGNED_INTERCHAIN_FEE_QUOTE",source:"base",
 sourceChainId:8453,destination:"arbitrum",asset:"XGR",
 executionAddress:adapter,quote,
 pricing:{walletAware:true,firstDestinationChain:"xgrchain",
 sponsorCommitments:[
  {chain:"xgrchain",stage:"first-delivery",amountWei:"1000"},
  {chain:"arbitrum",stage:"final-delivery",amountWei:"500"}]}};
const grantLimits={
 xgrchain:{maxGrantWei:"2000",dailyMaxWei:"10000",minReserveWei:"500"},
 arbitrum:{maxGrantWei:"2000",dailyMaxWei:"10000",minReserveWei:"500"}};
function fakePool({committed="0",taxRowCount=1}={}){
 const calls=[],client={
  query:async req=>{
   const sql=typeof req==="string"?req:req.text;
   calls.push({sql,values:req?.values||[]});
   if(sql.includes("COALESCE(SUM("))return {rows:[{amount:committed}]};
   if(sql.includes("COUNT(*)::int AS count FROM xita_sponsor_quote_intents"))
    return {rows:[{count:0}]};
   if(sql.startsWith("INSERT INTO xita_tax_quote_evidence"))
    return {rowCount:taxRowCount};
   return {rowCount:1,rows:[]};
  },release:()=>{}
 };
 return {calls,poolFactory:()=>({connect:async()=>client,end:async()=>{}})};
}
test("fee evidence and all signed quote promises commit in ONE database transaction",async()=>{
 const fake=fakePool();
 await saveQuoteEvidence(row,{connectionString:"fake",quoteReply,grantLimits,
  poolFactory:fake.poolFactory,readLiveFunding:async()=>({balanceWei:"1000000000",gasPriceWei:"1"})});
 const queries=fake.calls.map(c=>c.sql);
 assert.equal(queries[0],"BEGIN");
 assert.equal(queries.at(-1),"COMMIT");
 assert.equal(queries.filter(q=>q.includes("INSERT INTO xita_sponsor_quote_intents")).length,1);
 assert.equal(queries.filter(q=>q.includes("INSERT INTO xita_sponsor_quote_commitments")).length,2);
 assert.equal(queries.filter(q=>q.includes("pg_advisory_xact_lock")).length,3);
 assert.ok(queries.indexOf("COMMIT")>queries.findIndex(q=>q.includes("xita_sponsor_quote_commitments")));
});
test("over-budget or duplicate nonce never exposes a partially committed grant",async()=>{
 const budget=fakePool({committed:"9999"});
 await assert.rejects(()=>saveQuoteEvidence(row,{connectionString:"fake",
  quoteReply,grantLimits,poolFactory:budget.poolFactory,readLiveFunding:async()=>({balanceWei:"1000000000",gasPriceWei:"1"})}),/capacity exhausted/);
 assert.equal(budget.calls.at(-1).sql,"ROLLBACK");
 assert.equal(budget.calls.some(q=>q.sql==="COMMIT"),false);
 const dup=fakePool({taxRowCount:0});
 await assert.rejects(()=>saveQuoteEvidence(row,{connectionString:"fake",
  quoteReply,grantLimits,poolFactory:dup.poolFactory,readLiveFunding:async()=>({balanceWei:"1000000000",gasPriceWei:"1"})}),/Duplicate signed quote nonce/);
 assert.equal(dup.calls.at(-1).sql,"ROLLBACK");
 assert.equal(dup.calls.some(q=>q.sql.includes("xita_sponsor_quote_intents")),false);
});
test("tampered quote nonce or fee cannot create a grant commitment",async()=>{
 const fake=fakePool();
 await assert.rejects(()=>saveQuoteEvidence(row,{connectionString:"fake",
  quoteReply:{...quoteReply,quote:{...quote,nonce:"43"}},grantLimits,readLiveFunding:async()=>({balanceWei:"1000000000",gasPriceWei:"1"}),
  poolFactory:fake.poolFactory}),/commitment mismatch/);
 assert.equal(fake.calls.at(-1).sql,"ROLLBACK");
});

test("N-07 rejects an unfunded concurrently committed quote atomically",async()=>{
 const fake=fakePool({committed:"0"});
 await assert.rejects(()=>saveQuoteEvidence(row,{connectionString:"fake",
  quoteReply,grantLimits,poolFactory:fake.poolFactory,
  readLiveFunding:async()=>({balanceWei:"100",gasPriceWei:"10"})}),
  /capacity exhausted/);
 assert.equal(fake.calls.at(-1).sql,"ROLLBACK");
 assert.ok(fake.calls.some(c=>c.sql.includes("xita_sponsor_quote_commitments")));
});
