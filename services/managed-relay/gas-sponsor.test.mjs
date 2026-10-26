import test from "node:test";
import assert from "node:assert/strict";
import {sponsorStage,sponsorGrantNeed,sponsorGrantKey,sponsorDatabase,verifiedCommittedGrant,verifiedSponsorFinality} from "./gas-sponsor.mjs";
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
   if(sql.startsWith("INSERT INTO xita_sponsor_grants")){
    if(inserts.has(values[0]))return {rows:[]};
    inserts.add(values[0]);return {rows:[{grant_key:values[0]}]};
   }
   return {rows:[]};
  },
  release:()=>{}
 };
 const pool={connect:async()=>client,query:async()=>({rows:[]})},db=sponsorDatabase(pool);
 const args={key:sponsorGrantKey(first,"first-delivery"),chain:"xgrchain",
  recipient:first.account,beneficiary:addr("8"),amountWei:"5000",
  nonce:17,dailyMaxWei:"10000"};
 assert.equal(await db.reserveGrant(args),true);
 assert.equal(await db.reserveGrant(args),false);
 assert.ok(calls.indexOf("COMMIT")>calls.findIndex(x=>x.startsWith("INSERT INTO xita_sponsor_grants")));
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
