import test from "node:test";
import assert from "node:assert/strict";
import {validateAnnouncement,storeAnnouncement,intakeHandler} from "./transfer-intake.mjs";
const wallet="0x"+"a".repeat(40),hash="0x"+"b".repeat(64);
const catalog={chains:{xgrchain:{chainId:1643},base:{chainId:8453}},
 infrastructure:{xgrchain:{xitaV315:{components:{mailbox:{address:"0x"+"c".repeat(40)}}}},
  base:{xitaV315:{components:{mailbox:{address:"0x"+"d".repeat(40)}}}}},
 assets:{XGR:{deployment:{present:true,assetId:"0x"+"e".repeat(64),
    routeDeployments:[{routeName:"xgr_to_base",sourceChain:"xgrchain",
      destinationChain:"base",routeId:"0x"+"f".repeat(64),
      components:{gateway:{address:"0x"+"1".repeat(40)}}}]},
   routes:{routes:[{name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"}]}}}};
test("intake accepts ONLY source wallet chain and 32-byte hash",()=>{
 const msg=validateAnnouncement({account:wallet.toUpperCase().replace("0X","0x"),
  sourceChain:"xgrchain",txHash:hash},catalog);
 assert.equal(msg.account,wallet);assert.equal(msg.txHash,hash);
 for(const value of [{account:"x",sourceChain:"xgrchain",txHash:hash},
  {account:wallet,sourceChain:"base",txHash:hash},
  {account:wallet,sourceChain:"xgrchain",txHash:"0x1"},
  {account:wallet,sourceChain:"xgrchain",txHash:hash,confirmed:true}])
  assert.throws(()=>validateAnnouncement(value,catalog),/Invalid/);
});
test("duplicate hint cannot override the original claimed wallet",async()=>{
 const seen=[],pool={query:async arg=>{seen.push(arg);return {rows:[]}}};
 const candidate=validateAnnouncement({account:wallet,sourceChain:"xgrchain",txHash:hash},catalog);
 const value=await storeAnnouncement(pool,candidate);
 assert.equal(value.verified,false);assert.equal(value.status,"REPORTED_UNVERIFIED");
 assert.match(seen[0].text,/ON CONFLICT\(source_chain,source_tx_hash\) DO NOTHING/);
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
