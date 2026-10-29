import test from "node:test";
import assert from "node:assert/strict";
import {Wallet,Transaction} from "ethers";
import {sponsorStage,sponsorGrantNeed,sponsorGrantKey,sponsorDatabase,verifiedCommittedGrant,verifiedSponsorFinality,verifiedSponsorInclusion,reconcileExpiredSponsorQuotes,verifiedExpiredSponsorQuote,reportSponsorReserves,reconcileSponsorGrants,preparedSponsorReplayAllowed} from "./gas-sponsor.mjs";
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

test("Sponsor inclusion: mined canonical payout is usable before L2 safe finality",async()=>{
 const tx=hash("a"),blockHash=hash("b");
 const receipt={hash:tx,blockHash,blockNumber:101,status:1};
 const provider={
  getBlock:async tag=>tag==="safe"?{number:100}:
   {number:101,hash:blockHash},
  getTransactionReceipt:async()=>receipt
 };
 assert.equal(await verifiedSponsorInclusion({provider,receipt,txHash:tx}),true);
 assert.equal(await verifiedSponsorFinality({provider,chain:"arbitrum",receipt,txHash:tx}),false);
 provider.getBlock=async()=>({number:101,hash:hash("c")});
 assert.equal(await verifiedSponsorInclusion({provider,receipt,txHash:tx}),false);
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
 assert.ok(updates.every(x=>x.text.includes("status IN ('submitted','reserved')")));
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
 assert.match(writes[0].text,/status IN/);
});

test("F-07: prepared replay fails closed on delivered, unknown or absent canonical TX2",async()=>{
 const row={grant_key:"base:"+hash("1")+":first-delivery",recipient:addr("b")};
 const catalog={chains:{xgrchain:{chainId:1643,rpcUrls:["https://xgr.example"]}}};
 const base={account:addr("b"),destination_chain:"xgrchain",destination_mailbox:addr("c")};
 for(const delivered of [true,null]){
  const pool={query:async()=>({rows:[{...base,delivered}]})};
  assert.equal(await preparedSponsorReplayAllowed({pool,row,catalog,providers:new Map()}),false);
 }
 const unknown={query:async()=>({rows:[{...base,delivered:false}]})};
 await assert.rejects(()=>preparedSponsorReplayAllowed({pool:unknown,row,catalog,
  providers:new Map([["xgrchain",{send:async()=>{throw Error("RPC unavailable")}}]])}),
  /RPC unavailable/);
});
test("F-07: prepared signed bytes recover after crash with no user signature and identical tx hash",async()=>{
 const sponsor=new Wallet("0x"+"11".repeat(32)),target=addr("b"),hashBlock=hash("e");
 const rawTx=await sponsor.signTransaction({chainId:1643,nonce:7,to:target,
  value:5000n,gasLimit:21000n,gasPrice:1000000000n});
 const digest=Transaction.from(rawTx).hash;
 const row={grant_key:"base:"+hash("1")+":first-delivery",
  chain_name:"xgrchain",sponsor_address:sponsor.address.toLowerCase(),
  recipient:target,amount_wei:"5000",wallet_nonce:7,tx_hash:null,
  prepared_hash:digest,raw_tx:rawTx};
 const actions=[],provider={
  send:async(method,args)=>{
   if(method==="eth_chainId")return "0x66b";
   if(method==="eth_getBlockByNumber")return {number:"0x64",hash:hash("e")};
   if(method==="eth_call")return "0x"+("0".repeat(64));
   throw Error("unexpected canonical call");
  },
  getTransactionReceipt:async()=>null,
  getTransactionCount:async()=>7,
  getTransaction:async()=>null,
  broadcastTransaction:async bytes=>{actions.push(bytes);return {hash:digest};}
 };
 const pool={query:async q=>{
  if(q.text?.startsWith("WITH due AS"))return {rows:[row]};
  if(q.text?.startsWith("SELECT account,delivered"))return {rows:[{account:target,delivered:false,destination_chain:"xgrchain",destination_mailbox:addr("c")}]};
  actions.push(q);return {rowCount:1};
 }};
 const result=await reconcileSponsorGrants({pool,wallet:sponsor,
  catalog:reconciliationCatalog,providers:new Map([["xgrchain",provider]])});
 assert.equal(result.held,1);
 assert.equal(actions[0],rawTx,"only exact originally signed bytes are rebroadcast");
 assert.equal(actions.filter(x=>typeof x==="string").length,1);
 assert.ok(actions.every(x=>typeof x!=="object" || !x.text?.includes("SET status=$2")));
});

test("F-07: a consumed nonce holds the exact signed grant for operator review",async()=>{
 const sponsor=new Wallet("0x"+"11".repeat(32)),target=addr("b");
 const rawTx=await sponsor.signTransaction({chainId:1643,nonce:7,to:target,
  value:5000n,gasLimit:21000n,gasPrice:1000000000n});
 const row={grant_key:"base:"+hash("1")+":first-delivery",
  chain_name:"xgrchain",sponsor_address:sponsor.address.toLowerCase(),
  recipient:target,amount_wei:"5000",wallet_nonce:7,tx_hash:null,
  prepared_hash:Transaction.from(rawTx).hash,raw_tx:rawTx};
 let broadcasts=0;
 const provider={send:async(method)=>{
   if(method==="eth_chainId")return "0x66b";
   if(method==="eth_getBlockByNumber")return {number:"0x64",hash:hash("e")};
   if(method==="eth_call")return "0x"+("0".repeat(64));
   throw Error("unexpected canonical call");
  },getTransactionReceipt:async()=>null,
  getTransactionCount:async()=>8,
  broadcastTransaction:async()=>{broadcasts++}};
 const pool={query:async q=>q.text?.startsWith("WITH due AS")?
  {rows:[row]}:q.text?.startsWith("SELECT account,delivered")?
  {rows:[{account:target,delivered:false,destination_chain:"xgrchain",destination_mailbox:addr("c")}]}:{rowCount:1}};
 const result=await reconcileSponsorGrants({pool,wallet:sponsor,
  catalog:reconciliationCatalog,providers:new Map([["xgrchain",provider]])});
 assert.equal(result.checked,1);
 assert.equal(result.confirmed,0);
 assert.equal(broadcasts,0);
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

test("F-16: identical independent finalized hashes and nonce permit expiry release evidence",async()=>{
 const block={number:100,hash:hash("e"),timestamp:1793000000};
 const item={execution_adapter:addr("b"),payer:addr("a"),quote_nonce:"42",
  quote_expires_at:new Date(1792999000000).toISOString()};
 const primary={getBlock:async()=>block};
 const witness={getBlock:async()=>block};
 const readNonceUsed=async()=>false;
 const result=await verifiedExpiredSponsorQuote({
  item,sourceChain:"base",provider:primary,witness,readNonceUsed
 });
 assert.deepEqual(result,{used:false,blockNumber:100,blockHash:block.hash});
});
test("F-16: mismatched witness, conflicting nonce and reorg never release quote",async()=>{
 const block={number:100,hash:hash("e"),timestamp:1793000000};
 const item={execution_adapter:addr("b"),payer:addr("a"),quote_nonce:"42",
  quote_expires_at:new Date(1792999000000).toISOString()};
 const primary={getBlock:async()=>block};
 const witness={getBlock:async()=>({...block,hash:hash("f")})};
 await assert.rejects(()=>verifiedExpiredSponsorQuote({
  item,sourceChain:"base",provider:primary,witness,readNonceUsed:async()=>false
 }),/disagree/);
 const agree={getBlock:async()=>block};
 await assert.rejects(()=>verifiedExpiredSponsorQuote({
  item,sourceChain:"base",provider:primary,witness:agree,
  readNonceUsed:async p=>p===primary?false:true
 }),/nonce/);
 let count=0;
 const changing={getBlock:async()=>++count>=3?{...block,hash:hash("f")}:block};
 await assert.rejects(()=>verifiedExpiredSponsorQuote({
  item,sourceChain:"xgrchain",provider:changing,readNonceUsed:async()=>false
 }),/changed/);
 await assert.rejects(()=>verifiedExpiredSponsorQuote({
  item,sourceChain:"base",provider:primary,readNonceUsed:async()=>false
 }),/Second expiry RPC/);
});
test("F-16: lagging finalized witness retains unresolved promise",async()=>{
 const block={number:100,hash:hash("e"),timestamp:1793000000};
 const item={execution_adapter:addr("b"),payer:addr("a"),quote_nonce:"42",
  quote_expires_at:new Date(1792999000000).toISOString()};
 const evidence=await verifiedExpiredSponsorQuote({
  item,sourceChain:"base",provider:{getBlock:async()=>block},
  witness:{getBlock:async()=>({...block,number:99})},
  readNonceUsed:async()=>false
 });
 assert.equal(evidence,null);
});
test("F-08: expiry work is fairly partitioned across source chains",async()=>{
 let sql="";
 const pool={query:async q=>{sql=q.text;return {rows:[]}}};
 const result=await reconcileExpiredSponsorQuotes({
  pool,catalog:reconciliationCatalog,providers:new Map()
 });
 assert.deepEqual(result,{resolved:0,held:0});
 assert.match(sql,/PARTITION BY i.source_chain/);
 assert.match(sql,/chain_rank<=12/);
});
test("F-08: stalled reserve balance RPC does not prevent healthy chain monitoring",async()=>{
 const wallet={address:addr("a")},writes=[];
 const pool={query:async q=>{writes.push(q);return {rowCount:1}}};
 const providers=new Map([
  ["base",{getFeeData:async()=>new Promise(()=>{})}],
  ["xgrchain",{getFeeData:async()=>({gasPrice:10n}),
   getBalance:async()=>10000000n}]
 ]);
 const policy={
  base:{minReserveWei:"1",maxGrantWei:"10"},
  xgrchain:{minReserveWei:"1",maxGrantWei:"10"}
 };
 const result=await reportSponsorReserves({
  pool,catalog:reconciliationCatalog,wallet,policy,providers,readTimeoutMs:10
 });
 assert.deepEqual(result,[{chain:"base",ready:false},{chain:"xgrchain",ready:true}]);
 assert.equal(writes.length,2);
});
