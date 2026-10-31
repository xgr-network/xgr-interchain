import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {keccak256} from "ethers";
import {createPending,savePrivate,readPrivate} from "./private-store.mjs";
import {processCreatorQueue,creatorLimits,creatorDailyBudget} from "./creator-operator.mjs";
import {loadCatalog} from "../../tools/validate-manifests.mjs";
const owner="0x1234567890123456789012345678901234567890";
const operator="0x2222222222222222222222222222222222222222";
const token="0x3333333333333333333333333333333333333333";
const input={name:"Creator Example",symbol:"CREA",initialSupply:"10000",ownerAddress:owner,
 contactEmail:"creator@example.org",shortDescription:"A verified XGR token by a project.",
 description:"A full project description proving metadata survives ERC20 owner deployment and automatic XITA Join.",
 website:"https://example.org",categories:["DeFi"],tags:[],applicantRole:"founder",links:{},confirmed:true};
const factory={address:"0x1111111111111111111111111111111111111111",runtimeCodeKeccak256:keccak256("0x6001"),
 tokenRuntimeCodeKeccak256:keccak256("0x6002")};
const now=Date.UTC(2026,9,31,21),signed="0x010203",txHash=keccak256(signed);
const env=dir=>({XITA_CREATOR_ENABLED:"true",XITA_CREATOR_OPERATOR_KEY:"0x"+"1".repeat(64),
 XITA_CREATOR_OPERATOR_ADDRESS:operator,XITA_JOIN_PRIVATE_DIR:dir,
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
test("verified XGR creator queue writes signed tx BEFORE broadcast, replays exactly same hash and then creates ONE Join PR",async()=>{
 const x=fixture();let mined=false,signs=0,published=0;const broadcasts=[];
 const verify=async()=>({chainId:1643,tokenAddress:token,ownerAddress:owner,name:input.name,
  symbol:input.symbol,initialSupplyBaseUnits:"10000000000000000000000",factory:factory.address,
  operator,txHash,blockNumber:12000000});
 const call=async(url,method,params)=>{
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_getCode")return "0x6001";
  if(method==="eth_getTransactionReceipt")return mined?{status:"0x1"}:null;
  if(method==="eth_gasPrice")return "0x3b9aca00";
  if(method==="eth_getTransactionCount")return "0x01";
  if(method==="eth_getBalance")return "0x3635c9adc5dea00000";
  if(method==="eth_estimateGas")return "0x7a120";
  if(method==="eth_sendRawTransaction"){broadcasts.push(params[0]);return txHash;}
  throw Error("Unexpected RPC "+method);
 };
 const run=()=>processCreatorQueue({env:env(x.dir),now,call,loadFactory:()=>factory,
  walletFactory:()=>({address:operator,signTransaction:async()=>{signs++;return signed}}),
  verify,loadInventory:loadCatalog,mainSha:()=> "a".repeat(40),
  publisher:async(bundle)=>{published++;return {number:777,url:"https://github.com/xgr-network/xgr-interchain/pull/777",status:"draft",kind:bundle.kind}}});
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
  await assert.rejects(()=>processCreatorQueue({env:{...settings,XITA_CREATOR_OPERATOR_ADDRESS:owner},
   loadFactory:()=>factory,walletFactory:()=>({address:operator})}),/identity mismatch/);
 }finally{x.cleanup()}
});
