import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Pool} from "pg";
import {inspectSponsorObligations,inspectSponsorObligationsCLI} from "./sponsor-obligation-audit.mjs";
const URL_STRING=process.env.XITA_SPONSOR_TEST_DATABASE_URL;
const A=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
const H=n=>"0x"+BigInt(n).toString(16).padStart(64,"0");
const sponsor=A(900),aged=n=>new Date(Date.now()-n*60000);
const issues=r=>new Map(r.alerts.map(a=>[a.issue+"|"+a.stage,a.count]));
async function insert(db,table,record){
 if(!new Set(["xita_sponsor_grants","xita_sponsor_quote_intents",
 "xita_sponsor_quote_commitments","xita_transfer_operations"]).has(table))throw Error("unsafe table");
 const keys=Object.keys(record);
 assert.ok(keys.every(k=>/^[a-z_]+$/.test(k)));
 return db.query("INSERT INTO "+table+" ("+keys.join(",")+") VALUES ("+
  keys.map((_,i)=>"$"+(i+1)).join(",")+")",Object.values(record));
}
async function grant(db,id,{status="reserved",minutes=15,hash=true,
  chain="xgrchain",sponsorAddress=sponsor,recipient=A(200+id),amount="50"}={}){
 return insert(db,"xita_sponsor_grants",{
  grant_key:"base:"+H(500+id)+":first-delivery",chain_name:chain,
  sponsor_address:sponsorAddress,recipient,amount_wei:amount,wallet_nonce:id,
  status,tx_hash:hash?H(1100+id):null,
  created_at:aged(minutes),updated_at:aged(minutes)
 });
}
async function paid(db,id,{delivered=false,minutes=15,withOperation=true,
  grantStatus=null,chain="xgrchain",grantSponsor=sponsor,
  grantAmount="50",grantRecipient=null,fee="100",route=H(45)}={}){
 const payer=A(200+id),adapter=A(777),nonce=String(100+id);
 await insert(db,"xita_sponsor_quote_intents",{
  source_chain:"base",execution_adapter:adapter,payer,quote_nonce:nonce,
  quote_fee_wei:"100",quote_digest:H(2500+id),asset:"XGR",
  amount_raw:"1000",gateway:A(601),route_id:H(45),
  first_destination_chain:"xgrchain",final_destination_chain:"xgrchain",
  final_recipient:payer,onward_route_id:H(0),
  quote_issued_at:aged(25),quote_expires_at:new Date(Date.now()+1200000)
 });
 await insert(db,"xita_sponsor_quote_commitments",{
  source_chain:"base",execution_adapter:adapter,payer,quote_nonce:nonce,
  grant_chain:"xgrchain",grant_stage:"first-delivery",promised_wei:"50"
 });
 if(withOperation)await insert(db,"xita_transfer_operations",{
  source_chain:"base",message_id:H(500+id),source_tx_hash:H(1400+id),
  source_block_number:1000+id,source_block_hash:H(1600+id),
  source_log_index:0,account:payer,asset:"XGR",asset_id:H(2100),
  route_name:"base_to_xgrchain",route_id:route,gateway:A(601),
  destination_chain:"xgrchain",destination_mailbox:A(603),
  amount_raw:"1000",validator_fee_wei:"0",delivered,
  delivery_checked_at:aged(12),
  source_indexed_at:aged(minutes),execution_adapter:adapter,
  interchain_fee_wei:fee,final_destination_chain:"xgrchain",
  final_recipient:payer,onward_route_id:H(0),quote_nonce:nonce
 });
 if(grantStatus)await grant(db,id,{status:grantStatus,chain,
  sponsorAddress:grantSponsor,amount:grantAmount,
  recipient:grantRecipient||payer,minutes,hash:grantStatus!=="reserved"});
 return {payer,nonce};
}
test("F-07/F-19: disposable PostgreSQL regression suite (real schema)",
 {skip:!URL_STRING,timeout:90000},async t=>{
 const uri=new URL(URL_STRING);
 assert.equal(uri.hostname,"127.0.0.1");
 assert.equal(uri.pathname,"/xita_sponsor_ci");
 const db=new Pool({connectionString:URL_STRING,max:3,connectionTimeoutMillis:3000});
 try{
  for(const file of ["002_transfer_operations.sql","003_interchain_journey.sql",
    "004_sponsor_grants.sql","009_initial_fee_tax_evidence.sql",
    "010_wallet_aware_sponsor_commitments.sql"]){
   await db.query(readFileSync(new URL("../indexer/sql/"+file,import.meta.url),"utf8"));
  }
  const reset=()=>db.query("TRUNCATE xita_sponsor_grants,xita_sponsor_quote_intents,xita_transfer_operations CASCADE");
  await t.test("F-07: orphan nonce, needs review, delayed receipt; fresh states excluded; survives restart",async()=>{
   await reset();
   await grant(db,1,{hash:false,minutes:5});
   await grant(db,2,{hash:false,minutes:1});
   await grant(db,3,{hash:false,status:"needs-review"});
   await grant(db,4,{status:"submitted",minutes:16});
   await grant(db,5,{status:"submitted",minutes:1});
   await grant(db,6,{status:"confirmed"});
   const out=issues(await inspectSponsorObligations({pool:db,sponsorAddress:sponsor}));
   assert.equal(out.get("F-07:reserved-without-tx-hash|any"),1);
   assert.equal(out.get("grant-needs-operator-review|any"),1);
   assert.equal(out.get("submitted-not-yet-finalized|any"),1);
   assert.equal([...out.values()].reduce((a,b)=>a+b,0),3);
   const noOther=await inspectSponsorObligations({pool:db,sponsorAddress:A(998)});
   assert.equal(noOther.status,"no-aged-alerts");
   const reopened=new Pool({connectionString:URL_STRING,max:1});
   try{assert.deepEqual(issues(await inspectSponsorObligations({
     pool:reopened,sponsorAddress:sponsor})),out)}
   finally{await reopened.end()}
  });
  await t.test("F-19: external delivery, unresolved payment, wrong fee, route, fresh or unindexed",async()=>{
   await reset();
   await paid(db,10,{delivered:true});
   await paid(db,11);
   await paid(db,12,{delivered:true,grantStatus:"confirmed"});
   await paid(db,13,{grantStatus:"confirmed"});
   await paid(db,14,{delivered:true,grantStatus:"submitted"});
   await paid(db,15,{minutes:1});
   await paid(db,16,{withOperation:false});
   await paid(db,17,{fee:"101"});
   await paid(db,18,{route:H(99)});
   const out=issues(await inspectSponsorObligations({pool:db,sponsorAddress:sponsor}));
   assert.equal(out.get("F-19:delivered-before-grant-confirmed|first-delivery"),2);
   assert.equal(out.get("F-19:paid-commitment-without-matching-grant|first-delivery"),1);
  });
  await t.test("F-19: false confirmed if sponsor, chain, recipient or amount differs",async()=>{
   await reset();
   await paid(db,21,{delivered:true,grantStatus:"confirmed",grantSponsor:A(999)});
   await paid(db,22,{delivered:true,grantStatus:"confirmed",chain:"arbitrum"});
   await paid(db,23,{grantStatus:"confirmed",grantRecipient:A(999)});
   await paid(db,24,{grantStatus:"confirmed",grantAmount:"51"});
   await paid(db,25,{delivered:true,grantStatus:"confirmed"});
   const out=issues(await inspectSponsorObligations({pool:db,sponsorAddress:sponsor}));
   assert.equal(out.get("F-19:delivered-before-grant-confirmed|first-delivery"),2);
   assert.equal(out.get("F-19:paid-commitment-without-matching-grant|first-delivery"),2);
  });
  await t.test("2-hop promises: only unmatched stage triggers alert",async()=>{
   await reset();
   const item=await paid(db,30,{grantStatus:"confirmed"});
   for(const stage of ["hub-onward","final-delivery"])
    await insert(db,"xita_sponsor_quote_commitments",{
     source_chain:"base",execution_adapter:A(777),payer:item.payer,
     quote_nonce:item.nonce,grant_chain:stage==="hub-onward"?"xgrchain":"arbitrum",
     grant_stage:stage,promised_wei:"20"
    });
   const out=issues(await inspectSponsorObligations({pool:db,sponsorAddress:sponsor}));
   assert.equal(out.get("F-19:paid-commitment-without-matching-grant|hub-onward"),1);
   assert.equal(out.get("F-19:paid-commitment-without-matching-grant|final-delivery"),1);
   assert.equal(out.has("F-19:paid-commitment-without-matching-grant|first-delivery"),false);
  });
  await t.test("Sponsoring disabled: obligation remains; monitor is read-only even on writable DB login",async()=>{
   await reset();
   await paid(db,40,{delivered:true});
   const prints=[];
   const code=await inspectSponsorObligationsCLI({env:{
    XITA_INTERCHAIN_SPONSOR_ENABLED:"false",
    XITA_SPONSOR_STATUS_DATABASE_URL:URL_STRING,
    XITA_INTERCHAIN_FEE_ADDRESS:sponsor
   },print:s=>prints.push(JSON.parse(s))});
   assert.equal(code,2);
   assert.equal(prints[0].alerts[0].issue,"F-19:delivered-before-grant-confirmed");
   const readonly=new Pool({connectionString:URL_STRING,
     options:"-c default_transaction_read_only=on",max:1});
   try{
    await inspectSponsorObligations({pool:readonly,sponsorAddress:sponsor});
    await assert.rejects(readonly.query(
      "INSERT INTO xita_sponsor_grants (grant_key,chain_name,sponsor_address,recipient,amount_wei,wallet_nonce,status) VALUES ('test','base',$1,$1,1,1,'reserved')",
      [sponsor]),e=>e.code==="25006");
   }finally{await readonly.end()}
  });
  await t.test("Healthy paid grants => no alerts",async()=>{
   await reset();
   await paid(db,50,{grantStatus:"confirmed"});
   await paid(db,51,{delivered:true,grantStatus:"confirmed"});
   const out=await inspectSponsorObligations({pool:db,sponsorAddress:sponsor});
   assert.equal(out.status,"no-aged-alerts");
   assert.deepEqual(out.alerts,[]);
  });
 }finally{await db.end()}
});
