import test from "node:test";
import assert from "node:assert/strict";
import {Wallet,Transaction} from "ethers";
import {sponsorStage,sponsorGrantNeed,sponsorGrantKey,sponsorDatabase,verifiedCommittedGrant,verifiedSponsorFinality,reconcileExpiredSponsorQuotes,reconcileSponsorGrants} from "./gas-sponsor.mjs";
const addr=x=>"0x"+x.repeat(40),hash=x=>"0x"+x.repeat(64);
const first={account:addr("a"),asset:"XGR",source_chain:"base",
 destination_chain:"xgrchain",message_id:hash("1"),source_tx_hash:hash("2"),
 amount_raw:"1000000000000000000",execution_adapter:addr("3"),
 interchain_fee_wei:"10000",delivered:false,final_destination_chain:"polygon",
 onward_route_id:hash("4"),child_message_id:null,child_source_tx_hash:null};
test("all quoted stages are independently eligible after TX1 and never after TX2",()=>{
 const stages=[["first-delivery","xgrchain"],["hub-onward","xgrchain"],
  ["final-delivery","polygon"]];
 for(const [stage,chain] of stages){
  const grant=sponsorStage(first,stage,chain);
  assert.equal(grant?.stage,stage);
  assert.equal(grant?.chain,chain);
  assert.equal(sponsorStage({...first,delivered:true},stage,chain),null);
 }
 assert.equal(sponsorStage(first,"final-delivery","base"),null);
 assert.equal(sponsorStage(first,"unquoted","polygon"),null);
 assert.equal(sponsorStage({...first,execution_adapter:null},"first-delivery","xgrchain"),null);
 assert.equal(sponsorStage({...first,interchain_fee_wei:"0"},"first-delivery","xgrchain"),null);
 assert.equal(sponsorStage({...first,delivered:null},"hub-onward","xgrchain"),null);
 assert.equal(sponsorGrantKey(first,"first-delivery"),"base:"+hash("1")+":first-delivery");
});
test("gas grants may cover gas and validator fee, NEVER a native token principal",()=>{
 const gas=sponsorGrantNeed({stage:"first-delivery",balanceWei:0n,
  gasUnits:100000n,gasPriceWei:10n});
 assert.equal(gas.amountWei,"1300000");
 assert.equal(sponsorGrantNeed({stage:"first-delivery",
  balanceWei:2000000n,gasUnits:100000n,gasPriceWei:10n}).status,"not-required");
 const native=sponsorGrantNeed({stage:"hub-onward",balanceWei:1000000000000000000n,
  gasUnits:100000n,gasPriceWei:10n,
  nativePrincipalWei:1000000000000000000n,
  nativeBridgeValueWei:1000000000000010000n});
 assert.equal(native.amountWei,"1310000");
 const missing=sponsorGrantNeed({stage:"hub-onward",balanceWei:1n,
  gasUnits:100000n,gasPriceWei:10n,
  nativePrincipalWei:1000000000000000000n,
  nativeBridgeValueWei:1000000000000010000n});
 assert.equal(missing.status,"principal-unfunded");
 assert.equal(missing.amountWei,"0");
 assert.throws(()=>sponsorGrantNeed({stage:"first-delivery",balanceWei:0n,
  gasUnits:100000n,gasPriceWei:10n,nativeBridgeValueWei:5n}),/Only XGR/);
});
test("durable reserve is committed before any possible payout; duplicate key denied",async()=>{
 const calls=[],inserts=new Set,client={
  query:async(q)=>{
   const sql=typeof q==="string"?q:q.text,values=q?.values||[];
   calls.push(sql);
   if(sql.startsWith("SELECT COALESCE"))return {rows:[{amount:"0"}]};
   if(sql.startsWith("INSERT INTO xita_sponsor_prepared_tx"))return {rowCount:1};
   if(sql.startsWith("INSERT INTO xita_sponsor_grants")){
    if(inserts.has(values[0]))return {rows:[]};
    inserts.add(values[0]);return {rows:[{grant_key:values[0]}]};
   }
   return {rows:[]};
  },
  release:()=>{}
 };
 const pool={connect:async()=>client,query:async()=>({rows:[]})},db=sponsorDatabase(pool);
 const signer=new Wallet("0x"+"11".repeat(32));
 const rawTx=await signer.signTransaction({chainId:1643,nonce:17,
  to:first.account,value:5000n,gasLimit:21000n,gasPrice:1000000000n});
 const txHash=Transaction.from(rawTx).hash;
 const args={key:sponsorGrantKey(first,"first-delivery"),chain:"xgrchain",
  recipient:first.account,beneficiary:signer.address,amountWei:"5000",
  nonce:17,dailyMaxWei:"10000",rawTx,txHash};
 assert.equal(await db.reserveGrant(args),true);
 assert.equal(await db.reserveGrant(args),false);
 assert.ok(calls.indexOf("COMMIT")>calls.findIndex(x=>x.startsWith("INSERT INTO xita_sponsor_prepared_tx")));
 await assert.rejects(()=>db.recordSubmitted(args.key,"not-a-hash"),/Invalid/);
});

test("tampering with nonce, route, amount, beneficiary or quoted fee never unlocks sponsorship",()=>{
 const row={...first,route_id:hash("6"),quote_nonce:"42",
  final_recipient:first.account},firstProof={
  messageId:row.message_id,routeId:row.route_id,
  executionAdapter:row.execution_adapter,quoteNonce:row.quote_nonce,
  interchainFeeWei:row.interchain_fee_wei};
 const quote={promised_wei:"999",quote_fee_wei:row.interchain_fee_wei,
  route_id:row.route_id,amount_raw:row.amount_raw,asset:row.asset,
  final_recipient:row.account,first_destination_chain:row.destination_chain,
  final_destination_chain:row.final_destination_chain,
  onward_route_id:row.onward_route_id};
 assert.equal(verifiedCommittedGrant({row,first:firstProof,quote}),999n);
 for(const [field,other] of [["quote_nonce","43"],["route_id",hash("7")],
  ["amount_raw","123"],["account",addr("b")],["interchain_fee_wei","99999"]]){
  assert.throws(()=>verifiedCommittedGrant({row:{...row,[field]:other},
   first:firstProof,quote}),/mismatch/,field);
 }
 assert.throws(()=>verifiedCommittedGrant({row,first:firstProof,
  quote:{...quote,promised_wei:"0"}}),/mismatch/);
});
test("quote lookup requires exact nonce and restricts beneficiary in SQL",async()=>{
 let sql="",values=[];
 const pool={query:async q=>{sql=q.text;values=q.values;return {rows:[]}}};
 const row={...first,quote_nonce:"42"};
 const result=await sponsorDatabase(pool).readQuoteCommitment({row,
  stage:"first-delivery",chain:"xgrchain"});
 assert.equal(result,null);
 assert.match(sql,/p.quote_nonce=i.quote_nonce/);
 assert.match(sql,/p.interchain_fee_wei=i.quote_fee_wei/);
 assert.match(sql,/p.message_id=\$5/);
 assert.equal(values[2],first.account);
});

test("L-02 gas grants must use a bounded dynamic estimate, not an EOA 21000 constant",async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("./gas-sponsor.mjs",import.meta.url),"utf8");
 assert.match(source,/provider\.estimateGas\(/);
 assert.match(source,/gasEstimate>100000n/);
 assert.match(source,/gasLimit>120000n/);
 assert.doesNotMatch(source,/gasLimit:21000n/);
 assert.ok(source.indexOf("provider.estimateGas")<source.indexOf("db.reserveGrant"),
  "do not reserve one-shot grant after a failed gas estimate");
});

test("N-08 sponsor payout waits for the safe L2 head and canonical block hash",async()=>{
 const tx=hash("a"),blockHash=hash("b");
 const receipt={hash:tx,blockHash,blockNumber:100,status:1};
 const provider={
  getBlock:async tag=>tag==="safe"?{number:99}:
   tag==="latest"?{number:102}:{number:100,hash:blockHash},
  getTransactionReceipt:async()=>receipt
 };
 assert.equal(await verifiedSponsorFinality({provider,chain:"base",receipt,txHash:tx}),false);
 provider.getBlock=async tag=>tag==="safe"?{number:100}:
  tag==="latest"?{number:102}:{number:100,hash:blockHash};
 assert.equal(await verifiedSponsorFinality({provider,chain:"base",receipt,txHash:tx}),true);
 assert.equal(await verifiedSponsorFinality({provider,chain:"xgrchain",receipt,txHash:tx}),true);
 provider.getBlock=async tag=>tag==="safe"?{number:100}:
  tag==="latest"?{number:101}:{number:100,hash:blockHash};
 assert.equal(await verifiedSponsorFinality({provider,chain:"xgrchain",receipt,txHash:tx}),false);
 provider.getBlock=async tag=>{if(tag==="safe")throw Error("unsupported");return {number:100,hash:blockHash}};
 assert.equal(await verifiedSponsorFinality({provider,chain:"base",receipt,txHash:tx}),false);
});

// Reconciliation uses documented chain identity even with injected RPC providers.
const reconciliationCatalog={chains:{
 base:{chainId:8453,rpcUrls:["https://base.example"]},
 xgrchain:{chainId:1643,rpcUrls:["https://xgr.example"]}
}};
test("F-08: failing RPC on one chain cannot prevent another chain's verified grant",async()=>{
 const wallet={address:addr("a")},baseTx=hash("1"),hubTx=hash("2"),blockHash=hash("e");
 const rows=[
  {grant_key:"base:old:first-delivery",chain_name:"base",
   sponsor_address:wallet.address,recipient:addr("b"),
   amount_wei:"100",wallet_nonce:4,tx_hash:baseTx},
  {grant_key:"xgrchain:new:hub-onward",chain_name:"xgrchain",
   sponsor_address:wallet.address,recipient:addr("c"),
   amount_wei:"200",wallet_nonce:5,tx_hash:hubTx}
 ];
 const statements=[];
 const pool={query:async q=>{
  statements.push(q);
  if(q.text?.startsWith("WITH due AS"))return {rows};
  return {rowCount:1,rows:[]};
 }};
 const receipt={hash:hubTx,blockHash,blockNumber:100,status:1};
 const healthy={
  getTransactionReceipt:async tx=>{assert.equal(tx,hubTx);return receipt;},
  getTransaction:async tx=>{assert.equal(tx,hubTx);return {
   from:wallet.address,to:addr("c"),value:200n,nonce:5};},
  getBlock:async tag=>tag==="latest"?{number:103}:
   {number:100,hash:blockHash}
 };
 const unavailable={
  getTransactionReceipt:async()=>{throw Error("RPC HTTP 503");}
 };
 const result=await reconcileSponsorGrants({pool,catalog:reconciliationCatalog,
  wallet,providers:new Map([["base",unavailable],["xgrchain",healthy]])});
 assert.deepEqual(result,{checked:1,confirmed:1,held:1,chainFailures:1,journalErrors:0});
 const selection=statements[0];
 assert.match(selection.text,/ROW_NUMBER\(\) OVER \(PARTITION BY chain_name/);
 assert.match(selection.text,/chain_rank<=12/);
 assert.match(selection.text,/updated_at<=NOW\(\)-INTERVAL '60 seconds'/);
 assert.deepEqual(selection.values,[wallet.address.toLowerCase()]);
 const statusChanges=statements.filter(x=>x.text?.includes("SET status=$2"));
 assert.equal(statusChanges.length,1);
 assert.deepEqual(statusChanges[0].values,[rows[1].grant_key,"confirmed",hubTx]);
 const retained=statements.find(x=>x.values?.[0]===rows[0].grant_key &&
  x.text?.includes("last_error=$3"));
 assert.ok(retained);assert.match(retained.values[2],/503/);
 assert.ok(statements.every(x=>!x.text?.includes("DELETE FROM xita_sponsor_grants")));
});

test("F-08: a stalled read expires without delaying another chain or releasing an obligation",async()=>{
 const wallet={address:addr("a")},rows=[
  {grant_key:"bad",chain_name:"base",sponsor_address:wallet.address,
   recipient:addr("b"),amount_wei:"1",wallet_nonce:1,tx_hash:hash("1")},
  {grant_key:"later-bad",chain_name:"base",sponsor_address:wallet.address,
   recipient:addr("b"),amount_wei:"1",wallet_nonce:2,tx_hash:hash("2")},
  {grant_key:"good",chain_name:"xgrchain",sponsor_address:wallet.address,
   recipient:addr("c"),amount_wei:"2",wallet_nonce:1,tx_hash:hash("3")}
 ];
 const updates=[];
 const pool={query:async q=>{
  if(q.text?.startsWith("WITH due AS"))return {rows};
  updates.push(q);
  return {rowCount:1};
 }};
 const providers=new Map([
  ["base",{getTransactionReceipt:async()=>new Promise(()=>{})}],
  ["xgrchain",{getTransactionReceipt:async()=>null}]
 ]);
 const result=await reconcileSponsorGrants({pool,catalog:reconciliationCatalog,wallet,providers,readTimeoutMs:15});
 assert.deepEqual(result,{checked:0,confirmed:0,held:3,chainFailures:1,journalErrors:0});
 assert.equal(updates.length,2,"blocked chain's later rows are not needlessly probed");
 assert.ok(updates.every(x=>x.text.includes("status='submitted'")));
 assert.ok(!updates.some(x=>x.text.includes("SET status=$2")));
});

test("F-08: an unexpected transaction identity is held, not confirmed or retried",async()=>{
 const wallet={address:addr("a")},row={grant_key:"mismatch",chain_name:"base",
  sponsor_address:wallet.address,recipient:addr("b"),
  amount_wei:"100",wallet_nonce:4,tx_hash:hash("1")};
 const writes=[],pool={query:async q=>{
  if(q.text?.startsWith("WITH due AS"))return {rows:[row]};
  writes.push(q);return {rowCount:1};
 }};
 const providers=new Map([["base",{
  getTransactionReceipt:async()=>({hash:row.tx_hash,status:1,blockNumber:100,
   blockHash:hash("e")}),
  getTransaction:async()=>({from:wallet.address,to:addr("c"),value:100n,nonce:4})
 }]]);
 const result=await reconcileSponsorGrants({pool,catalog:reconciliationCatalog,wallet,providers});
 assert.equal(result.confirmed,0);assert.equal(result.held,1);
 assert.equal(result.chainFailures,0,"mismatched grants do not poison the entire source chain");
 assert.equal(writes.length,1);assert.match(writes[0].values[2],/durable signed intent/);
 assert.match(writes[0].text,/status='submitted'/);
});

test("N-06 expires only after finalized source nonce evidence, never merely by time",async()=>{
 const quote={source_chain:"base",execution_adapter:addr("b"),payer:addr("a"),
  quote_nonce:"42",quote_expires_at:new Date("2026-10-25T12:00:00Z")};
 let inserted=0,seen=[];
 const pool={query:async q=>{
  const sql=typeof q==="string"?q:q.text;
  seen.push(sql);
  if(sql.startsWith("SELECT i.source_chain"))return {rows:[quote]};
  if(sql.startsWith("INSERT INTO xita_sponsor_quote_resolutions")){
   inserted++;assert.equal(q.values[4],"expired-unused");return {rowCount:1};
  }
  return {rows:[]};
 }};
 const provider={
  getBlock:async()=>({number:1200,hash:hash("e"),timestamp:1792902000}),
  getNetwork:async()=>({chainId:8453n}),
  call:async()=>{throw Error("not mocked")},
 };
 // The worker must use the finalized tag and a canonical nonce-read,
 // and must not insert a release on any missing/ambiguous RPC evidence.
 const notFinal={...provider,getBlock:async()=>{throw Error("RPC down")}};
 const providers=new Map([["base",notFinal]]);
 const catalog={chains:{base:{chainId:8453,rpcUrls:["https://example.org"]}}};
 const held=await reconcileExpiredSponsorQuotes({pool,catalog,providers});
 assert.equal(held.resolved,0);assert.equal(inserted,0);
 assert.ok(seen.some(x=>x.includes("quote_expires_at")&&x.includes("5 minutes")));
});
