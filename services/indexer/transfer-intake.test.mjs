import test from "node:test";
import assert from "node:assert/strict";
import {validateAnnouncement,storeAnnouncement,intakeHandler} from "./transfer-intake.mjs";
import {readFileSync} from "node:fs";
const wallet="0x"+"a".repeat(40),hash="0x"+"b".repeat(64);
// Production Direct-BLS hard reset intentionally has zero deployed routes.
// The intake security test models one subsequently receipt-verified route.
const catalog=JSON.parse(readFileSync(new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
const directFixture={
 sourceChain:"xgrchain",destinationChain:"base",routeName:"xgr_to_base",
 routeId:"0x"+"b".repeat(64),
 components:{gateway:{address:"0x"+"c".repeat(40)}}
};
catalog.assets.XGR.deployment.present=true;
catalog.assets.XGR.deployment.routeDeployments=[directFixture];
catalog.assets.XGR.deployment.representations=[{
 chain:"xgrchain",address:"0x"+"d".repeat(40)
}];
catalog.infrastructure.xgrchain.xitaV315.components.mailbox={address:"0x"+"e".repeat(40)};

test("intake accepts ONLY source wallet chain and 32-byte hash",()=>{
 const msg=validateAnnouncement({account:wallet.toUpperCase().replace("0X","0x"),
  sourceChain:"xgrchain",txHash:hash},catalog);
 assert.equal(msg.account,wallet);assert.equal(msg.txHash,hash);
 for(const value of [{account:"x",sourceChain:"xgrchain",txHash:hash},
  {account:wallet,sourceChain:"polygon",txHash:hash},
  {account:wallet,sourceChain:"xgrchain",txHash:"0x1"},
  {account:wallet,sourceChain:"xgrchain",txHash:hash,confirmed:true}])
  assert.throws(()=>validateAnnouncement(value,catalog),/Invalid/);
});
test("duplicate hint cannot override a claim, nor reserve a hash for another wallet",async()=>{
 const seen=[],pool={query:async arg=>{seen.push(arg);return {rows:[]}}};
 const candidate=validateAnnouncement({account:wallet,sourceChain:"xgrchain",txHash:hash},catalog);
 const value=await storeAnnouncement(pool,candidate);
 assert.equal(value.verified,false);assert.equal(value.status,"REPORTED_UNVERIFIED");
 assert.match(seen[0].text,/ON CONFLICT\(source_chain,source_tx_hash,account\) DO NOTHING/);
 assert.ok(!/xita_transfer_operations/.test(seen[0].text));
});
test("no false claim can be promoted via public HTTP handler",async()=>{
 const seen=[];
 const pool={query:async arg=>{seen.push(arg);return {rows:[]}}};
 const response={headers:null,status:null,body:null,
  writeHead(code,headers){this.status=code;this.headers=headers;},
  end(body){this.body=JSON.parse(body);}};
 const request={method:"POST",url:"/api/xeta/v1/transfers/announce",
  headers:{origin:"https://xita.xgr.network","content-type":"application/json",
   "x-real-ip":"203.0.113.9"},socket:{remoteAddress:"127.0.0.1"},
  async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({
    account:wallet,sourceChain:"xgrchain",txHash:hash}));}};
 await intakeHandler(request,response,{catalog,pool,now:()=>4000000000000});
 assert.equal(response.status,202);
 assert.equal(response.body.verified,false);
 assert.equal(seen.length,1);
});
