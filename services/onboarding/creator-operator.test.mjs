import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {keccak256} from "ethers";
import {createPending,savePrivate,readPrivate} from "./private-store.mjs";
import {processCreatorQueue,creatorLimits,creatorDailyBudget,assertSponsorJournalClear,sponsorWalletCredentials} from "./creator-operator.mjs";
import {loadCatalog} from "../../tools/validate-manifests.mjs";
const owner="0x1234567890123456789012345678901234567890";
const operator="0x2222222222222222222222222222222222222222";
const token="0x3333333333333333333333333333333333333333";
const input={name:"Creator Example",symbol:"CREA",initialSupply:"10000",ownerAddress:owner,tokenType:"fixed",decimals:18,maxSupply:"10000",permit:false,minterAddress:"0x0000000000000000000000000000000000000000",
 contactEmail:"creator@example.org",shortDescription:"A verified XGR token by a project.",
 description:"A full project description proving metadata survives ERC20 owner deployment and automatic XITA Join.",
 website:"https://example.org",categories:["DeFi"],tags:[],applicantRole:"founder",links:{},confirmed:true};
const factory={address:"0x1111111111111111111111111111111111111111",runtimeCodeKeccak256:keccak256("0x6001"),
 tokenRuntimeCodeKeccak256:keccak256("0x6002")};
const now=Date.UTC(2026,9,31,21),signed="0x010203",txHash=keccak256(signed);
const env=dir=>({XITA_CREATOR_ENABLED:"true",XITA_INTERCHAIN_FEE_PRIVATE_KEY:"0x"+"1".repeat(64),
 XITA_INTERCHAIN_FEE_ADDRESS:operator,XITA_SPONSOR_DATABASE_URL:"postgresql://tester:test@localhost:5432/xita",XITA_JOIN_PRIVATE_DIR:dir,
 XITA_CREATOR_DAILY_LIMIT:"3",XITA_CREATOR_DAILY_BUDGET_WEI:"1000000000000000000",
 XITA_CREATOR_GAS_LIMIT_CAP:"2000000",XITA_CREATOR_GAS_PRICE_CAP_WEI:"10000000000",
 XITA_CREATOR_BROADCAST_RPC:"https://rpc.xgr.network"});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),"xita-creator-worker-"));
 const created=createPending(dir,input,"creator:test",{now}),row=readPrivate(dir,created.id);
 row.kind="token-creator";row.phase="deployment-queued";row.logoUrl="https://xita.xgr.network/token-logos/"+"a".repeat(64)+".png";
 row.deployment={status:"queued",chainId:1643,ownerAddress:owner,txHash:null,tokenAddress:null};
 savePrivate(dir,row);
 return {dir,id:created.id,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
test("verified XGR creator queue writes signed tx BEFORE broadcast, replays exactly same hash and then creates ONE profile-only PR",async()=>{
 const x=fixture();let mined=false,signs=0,published=0;const broadcasts=[];
 const verify=async()=>({chainId:1643,tokenAddress:token,ownerAddress:owner,name:input.name,
  symbol:input.symbol,initialSupplyBaseUnits:"10000000000000000000000",maxSupplyBaseUnits:"10000000000000000000000",tokenType:0,decimals:18,permit:false,minterAddress:"0x0000000000000000000000000000000000000000",factory:factory.address,
  operator,txHash,tokenCodeHash:"0x"+"d".repeat(64),blockNumber:12000000});
 const call=async(url,method,params)=>{
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_getCode")return "0x6001";
  if(method==="eth_getTransactionReceipt")return mined?{status:"0x1"}:null;
  if(method==="eth_gasPrice")return "0x3b9aca00";
  if(method==="eth_getTransactionCount")return params[1]==="latest"?"0x01":"0x01";
  if(method==="eth_getBalance")return "0x3635c9adc5dea00000";
  if(method==="eth_estimateGas")return "0x7a120";
  if(method==="eth_sendRawTransaction"){broadcasts.push(params[0]);return txHash;}
  throw Error("Unexpected RPC "+method);
 };
 const run=()=>processCreatorQueue({env:env(x.dir),now,call,loadFactory:()=>factory,
  walletFactory:()=>({address:operator,signTransaction:async()=>{signs++;return signed}}),
  verify,checkSponsorJournal:async()=>{},loadInventory:loadCatalog,mainSha:()=> "a".repeat(40),
  publisher:async(bundle)=>{assert.equal(bundle.kind,"xgrchain-profile");assert.equal(bundle.summary.routeCount,0);published++;return {number:777,url:"https://github.com/xgr-network/xgr-interchain/pull/777",status:"draft",kind:bundle.kind}}});
 try{
  const first=await run();
  assert.equal(first.phase,"deployment-submitted");
  assert.equal(first.txHash,txHash);
  assert.equal(readPrivate(x.dir,x.id).deployment.rawSignedTransaction,signed);
  assert.equal((await run()).phase,"broadcast-retry");
  assert.equal(signs,1);
  assert.deepEqual(broadcasts,[signed,signed]);
  mined=true;
  assert.equal((await run()).phase,"deployed");
  const deployed=readPrivate(x.dir,x.id);
  assert.equal(deployed.deployment.tokenAddress,token);
  assert.equal(deployed.deployment.rawSignedTransaction,null);
  assert.equal((await run()).phase,"pr-published");
  assert.equal((await run()).phase,"idle");
  assert.equal(published,1);
  assert.equal(readPrivate(x.dir,x.id).pr.number,777);
  assert.equal(signs,1);
 }finally{x.cleanup()}
});
test("explicit daily gas caps and signer segregation reject unsafe deployment",async()=>{
 const x=fixture();try{
  const settings=env(x.dir);
  assert.equal(creatorLimits(settings).dailyCount,3);
  assert.equal(creatorDailyBudget([{kind:"token-creator",deployment:{signedAt:new Date(now).toISOString(),reservedWei:"123"}}],now).reservedWei,123n);
  await assert.rejects(()=>processCreatorQueue({env:{...settings,XITA_CREATOR_ENABLED:"false"}}),/disabled/);
  await assert.rejects(()=>processCreatorQueue({env:{...settings,XITA_CREATOR_DAILY_LIMIT:"0"}}),/limit|configured/);
  await assert.rejects(()=>processCreatorQueue({env:{...settings,XITA_INTERCHAIN_FEE_ADDRESS:owner},
   loadFactory:()=>factory,walletFactory:()=>({address:operator})}),/identity mismatch/);
 }finally{x.cleanup()}
});

test("shared Sponsor wallet must be exactly configured; no separate Creator key",()=>{
 const settings=env("/var/lib/xita/join");
 assert.equal(sponsorWalletCredentials(settings).address,operator);
 assert.throws(()=>sponsorWalletCredentials({...settings,XITA_INTERCHAIN_FEE_PRIVATE_KEY:undefined}),/Existing XITA sponsor wallet/);
});
test("creator fails closed when XGR sponsor has durable unresolved nonce",async()=>{
 const settings=env("/var/lib/xita/join"),calls=[];
 const make=async()=>({query:async q=>{calls.push(q);return {rows:[{pending:1}]};},end:async()=>{}});
 await assert.rejects(()=>assertSponsorJournalClear({env:settings,poolFactory:make,account:operator}),/Unresolved XGR sponsor nonce/);
 assert.equal(calls.length,1);
 assert.match(calls[0].text,/status IN \('reserved','submitted','needs-review'\)/);
 assert.equal(calls[0].values[0],operator.toLowerCase());
 const healthy=async()=>({query:async()=>({rows:[{pending:0}]}),end:async()=>{}});
 await assert.doesNotReject(()=>assertSponsorJournalClear({env:settings,poolFactory:healthy,account:operator}));
 await assert.rejects(()=>assertSponsorJournalClear({env:{...settings,XITA_SPONSOR_DATABASE_URL:""},account:operator}),/journal database/);
});

test("Creator service loads only the two existing privileged env files",()=>{
 const unit=readFileSync(new URL("../../deploy/systemd/xita-creator-operator.service.in",import.meta.url),"utf8");
 assert.match(unit,/EnvironmentFile=\/etc\/xita\/join\.env/);
 assert.match(unit,/EnvironmentFile=\/etc\/xita\/interchain-fee\.env/);
 assert.doesNotMatch(unit,/EnvironmentFile=\/etc\/xita\/creator\.env/);
 const script=readFileSync(new URL("../../manage.sh",import.meta.url),"utf8");
 assert.doesNotMatch(script,/Missing Creator limits \/etc\/xita\/creator\.env/);
 assert.match(script,/XITA_CREATOR_ENABLED=true\$' \/etc\/xita\/interchain-fee\.env/);
});

test("existing broad Creator route Draft PR migrates to an independent zero-route profile without signing again",async()=>{
 const x=fixture(),legacy={number:400,url:"https://github.com/xgr-network/xgr-interchain/pull/400",status:"draft"};
 const verified={chainId:1643,tokenAddress:token,ownerAddress:owner,name:input.name,
  symbol:input.symbol,initialSupplyBaseUnits:"10000000000000000000000",
  maxSupplyBaseUnits:"10000000000000000000000",tokenType:0,decimals:18,
  permit:false,minterAddress:"0x0000000000000000000000000000000000000000",
  factory:factory.address,operator,txHash,tokenCodeHash:"0x"+"d".repeat(64),blockNumber:12000000};
 const row=readPrivate(x.dir,x.id);
 row.phase="pr-published";row.pr=legacy;
 row.deployment={status:"verified",txHash,tokenAddress:token,verifiedProof:verified,
  ownerAddress:owner,chainId:1643,rawSignedTransaction:null};
 savePrivate(x.dir,row);
 let published=0;
 const run=()=>processCreatorQueue({env:env(x.dir),now,loadFactory:()=>factory,
  walletFactory:()=>({address:operator,signTransaction:async()=>{throw Error("Must not sign again")}}),
  verify:async()=>verified,loadInventory:loadCatalog,mainSha:()=> "a".repeat(40),
  publisher:async(bundle)=>{
   assert.equal(bundle.kind,"xgrchain-profile");assert.equal(bundle.summary.routeCount,0);
   published++;
   return {number:401,url:"https://github.com/xgr-network/xgr-interchain/pull/401",status:"draft"};
  }});
 try{
  assert.equal((await run()).phase,"pr-published");
  const result=readPrivate(x.dir,x.id);
  assert.equal(result.pr.number,401);
  assert.equal(result.pr.kind,"xgrchain-profile");
  assert.deepEqual(result.supersededInterchainPr,legacy);
  assert.equal(result.deployment.txHash,txHash);
  assert.equal((await run()).phase,"idle");
  assert.equal(published,1);
 }finally{x.cleanup()}
});

test("F-36 permanently unsignable Creator request is quarantined while healthy sibling advances",async()=>{
 const x=fixture();let signCount=0;
 const bad=readPrivate(x.dir,x.id);
 bad.input={...bad.input,name:"Ä".repeat(50)};
 savePrivate(x.dir,bad);
 const created=createPending(x.dir,{...input,name:"Valid Creator",symbol:"HEALTHY"},"creator:healthy",{now});
 const healthy=readPrivate(x.dir,created.id);
 healthy.kind="token-creator";healthy.phase="deployment-queued";
 healthy.logoUrl="https://xita.xgr.network/token-logos/"+"b".repeat(64)+".png";
 healthy.deployment={status:"queued",chainId:1643,ownerAddress:owner,txHash:null,tokenAddress:null};
 savePrivate(x.dir,healthy);
 const call=async(_url,method,params)=>{
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_getCode")return "0x6001";
  if(method==="eth_gasPrice")return "0x3b9aca00";
  if(method==="eth_getTransactionCount")return "0x01";
  if(method==="eth_getBalance")return "0x3635c9adc5dea00000";
  if(method==="eth_estimateGas")return "0x7a120";
  if(method==="eth_sendRawTransaction")return txHash;
  if(method==="eth_getTransactionReceipt")return null;
  throw Error("Unexpected RPC "+method);
 };
 const run=()=>processCreatorQueue({env:env(x.dir),now,call,
  loadFactory:()=>factory,
  walletFactory:()=>({address:operator,signTransaction:async()=>{signCount++;return signed}}),
  loadInventory:loadCatalog,checkSponsorJournal:async()=>{}});
 try{
  const first=await run();
  assert.equal(first.phase,"deployment-submitted");
  assert.equal(first.id,created.id,"healthy sibling must be selected despite malformed earlier request");
  const invalid=readPrivate(x.dir,x.id);
  assert.equal(invalid.phase,"deployment-queued");
  assert.equal(invalid.deployment.status,"quarantined");
  assert.match(invalid.deployment.blockedReason,/name|symbol/i);
  assert.equal(invalid.deployment.txHash,null);
  assert.equal(readPrivate(x.dir,created.id).deployment.txHash,txHash);
  assert.equal(signCount,1);
  // An unresolved signed item always wins after restart; quarantine can
  // never clear, replace or steal its already reserved nonce.
  assert.equal((await run()).phase,"broadcast-retry");
  assert.equal(signCount,1);
  assert.equal(readPrivate(x.dir,x.id).deployment.status,"quarantined");
 }finally{x.cleanup()}
});

test("F-36 invalid solitary Creator entry is retained for manual review, not deleted or signed",async()=>{
 const x=fixture();let signedCount=0;
 try{
  const record=readPrivate(x.dir,x.id);
  record.input={...record.input,maxSupply:"0",tokenType:"mintable"};
  savePrivate(x.dir,record);
  const result=await processCreatorQueue({env:env(x.dir),now,
   loadFactory:()=>factory,
   walletFactory:()=>({address:operator,signTransaction:async()=>{signedCount++;throw Error("Must not sign")}}),
   loadInventory:loadCatalog,checkSponsorJournal:async()=>{}});
  assert.equal(result.phase,"quarantined");
  assert.equal(result.quarantined,1);
  assert.equal(signedCount,0);
  assert.equal(readPrivate(x.dir,x.id).deployment.status,"quarantined");
  assert.equal(readPrivate(x.dir,x.id).input.contactEmail,input.contactEmail);
  assert.equal((await processCreatorQueue({env:env(x.dir),now,
   loadFactory:()=>factory,walletFactory:()=>({address:operator}),
   loadInventory:loadCatalog,checkSponsorJournal:async()=>{}})).phase,"idle");
 }finally{x.cleanup()}
});
