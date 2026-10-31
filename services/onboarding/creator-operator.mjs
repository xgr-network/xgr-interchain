// Standalone, opt-in XGR-funded deployment service. NEVER loaded by public
// Join HTTP server. Only root-owned /etc/xita/creator.env can supply the
// dedicated deployment key. No signing occurs on request or email confirmation.
import {openSync,closeSync,unlinkSync} from "node:fs";
import {join} from "node:path";
import {Wallet,JsonRpcProvider,keccak256} from "ethers";
import {privateLocation,listPrivate,savePrivate,readPrivate,lockedRecord} from "./private-store.mjs";
import {loadReviewedCreatorFactory,verifyCreatorAcrossRPCs,CREATOR_VERIFY_RPC_URLS,creatorFactoryInterface} from "./creator-chain-proof.mjs";
import {buildCreatorJoinBundle} from "./creator-manifests.mjs";
import {loadCatalog,validateCatalog} from "../../tools/validate-manifests.mjs";
import {publishDraft,localMainSha} from "./server.mjs";
const ADDR=/^0x[0-9a-f]{40}$/i,KEY=/^0x[0-9a-f]{64}$/i;
function value(env,name,min,max){
 const raw=String(env[name]||"");
 if(!/^[1-9][0-9]*$/.test(raw))throw Error(name+" must be explicitly configured");
 const n=BigInt(raw);
 if(n<BigInt(min)||n>BigInt(max))throw Error("Unsafe "+name+" limit");
 return n;
}
export function creatorLimits(env){
 if(env.XITA_CREATOR_ENABLED!=="true")throw Error("Creator operator is disabled");
 return {
  dailyCount:Number(value(env,"XITA_CREATOR_DAILY_LIMIT",1,100)),
  dailyWei:value(env,"XITA_CREATOR_DAILY_BUDGET_WEI",1,10n**25n),
  gasLimit:value(env,"XITA_CREATOR_GAS_LIMIT_CAP",200000,10000000),
  gasPrice:value(env,"XITA_CREATOR_GAS_PRICE_CAP_WEI",1,1000000000000n)
 };
}
function same(a,b){return typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();}
export function creatorDailyBudget(records,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10);
 const used=records.filter(x=>x.kind==="token-creator"&&x.deployment?.signedAt?.slice(0,10)===day);
 return {count:used.length,
  reservedWei:used.reduce((sum,x)=>sum+BigInt(x.deployment?.reservedWei||0),0n)};
}
function safeRecord(record){
 if(record.kind!=="token-creator"||record.phase!=="deployment-queued"||
    !ADDR.test(record.input?.ownerAddress||"")||!record.logoUrl||
    record.deployment?.status!=="queued"||record.deployment?.txHash)
  throw Error("Invalid or unauthenticated creator deploy request");
}
async function checkFactoryAcrossRPCs(factory,call,urls){
 const proofs=await Promise.all(urls.map(async url=>{
  const [chain,code]=await Promise.all([
   call(url,"eth_chainId",[]),call(url,"eth_getCode",[factory.address,"latest"])
  ]);
  if(BigInt(chain)!==1643n||code==="0x"||
     !same(keccak256(code),factory.runtimeCodeKeccak256))
   throw Error("XGR token factory is not deployed with the approved runtime bytecode");
  return keccak256(code);
 }));
 if(!same(proofs[0],proofs[1]))throw Error("Conflicting XGR factory RPC views");
}
export async function processCreatorQueue({env=process.env,now=Date.now(),
  loadFactory=loadReviewedCreatorFactory,call,
  walletFactory=key=>new Wallet(key),
  publisher=publishDraft,loadInventory=loadCatalog,
  verify=verifyCreatorAcrossRPCs,mainSha=localMainSha}={}){
 const limit=creatorLimits(env);
 if(!KEY.test(env.XITA_CREATOR_OPERATOR_KEY||""))
  throw Error("Separate operator key required; never reuse Join HTTP credentials");
 const factory=loadFactory();
 const wallet=walletFactory(env.XITA_CREATOR_OPERATOR_KEY);
 if(!ADDR.test(wallet.address||"")||
    !same(wallet.address,env.XITA_CREATOR_OPERATOR_ADDRESS))
  throw Error("Dedicated XGR creator operator wallet identity mismatch");
 const urls=CREATOR_VERIFY_RPC_URLS;
 const rpc=call||((url,method,params)=>import("./creator-chain-proof.mjs").then(mod=>mod.creatorRPC(url,method,params)));
 const path=privateLocation(env),records=listPrivate(path,{now});
 // One global unresolved signed transaction at a time prevents nonce races,
 // double minting, and deploying past a temporarily unavailable RPC.
 const inFlight=records.find(x=>x.kind==="token-creator"&&x.phase==="deployment-submitted");
 if(inFlight){
  if(!KEY.test(inFlight.deployment?.txHash||""))throw Error("Unsafe queued tx identifier");
  // Never replace or re-sign a broadcast-unknown transaction.
  const transaction=await rpc(urls[0],"eth_getTransactionReceipt",[inFlight.deployment.txHash]).catch(()=>null);
  if(!transaction){
   const raw=inFlight.deployment.rawSignedTransaction;
   if(!/^0x[0-9a-f]+$/i.test(raw||"")||!same(keccak256(raw),inFlight.deployment.txHash))
    throw Error("Signed transaction recovery evidence missing");
   // Retry EXACT signed bytes, never another nonce or different token.
   try{await rpc(env.XITA_CREATOR_BROADCAST_RPC||"https://rpc.xgr.network",
    "eth_sendRawTransaction",[raw])}
   catch(e){if(!/already known|known transaction|nonce too low/i.test(String(e.message||e)))
     throw Error("Broadcast status uncertain; exact signed transaction remains durable")}
   return {phase:"broadcast-retry",id:inFlight.id,txHash:inFlight.deployment.txHash};
  }
  if(BigInt(transaction.status||0)!==1n)
   throw Error("Creator transaction reverted. Preserve original hash for operator incident review");
  const verified=await verify({input:inFlight.input,txHash:inFlight.deployment.txHash,factory,urls,call:rpc});
  await lockedRecord(path,inFlight.id,async record=>{
   if(record.phase!=="deployment-submitted"||!same(record.deployment.txHash,verified.txHash))
    throw Error("Creator transaction changed during reconciliation");
   record.phase="deployed";record.deployment={...record.deployment,status:"verified",
    rawSignedTransaction:null,tokenAddress:verified.tokenAddress,verifiedProof:verified};
   savePrivate(path,record);
  });
  return {phase:"deployed",id:inFlight.id,txHash:verified.txHash,tokenAddress:verified.tokenAddress};
 }
 const ready=records.find(x=>x.kind==="token-creator"&&x.phase==="deployed"&&
   x.deployment?.verifiedProof&&!x.pr);
 if(ready){
  const catalog=loadInventory();
  if(validateCatalog(catalog).length)throw Error("Cannot publish Join against invalid GitHub inventory");
  const verified=await verify({input:ready.input,txHash:ready.deployment.txHash,factory,urls,call:rpc});
  if(!same(verified.tokenAddress,ready.deployment.tokenAddress))
   throw Error("Creator proof changed before Join PR creation");
  const bundle=buildCreatorJoinBundle(ready,verified,catalog);
  const pr=await publisher(bundle,{expectedMain:mainSha(),applicationId:ready.id});
  await lockedRecord(path,ready.id,async record=>{
   if(record.phase!=="deployed"||!same(record.deployment.txHash,verified.txHash))
    throw Error("Creator PR application state changed");
   record.assetId=bundle.assetId;record.phase="pr-published";record.pr=pr;
   record.notificationQueue=[...new Set([...(record.notificationQueue||[]),"submitted"])];
   savePrivate(path,record);
  });
  return {phase:"pr-published",id:ready.id,pr};
 }
 const target=records.find(x=>x.kind==="token-creator"&&x.phase==="deployment-queued");
 if(!target)return {phase:"idle"};
 safeRecord(target);
 const use=creatorDailyBudget(records,now);
 if(use.count>=limit.dailyCount||use.reservedWei>=limit.dailyWei)
  return {phase:"budget-exhausted"};
 await checkFactoryAcrossRPCs(factory,rpc,urls);
 const catalog=loadInventory();
 if(validateCatalog(catalog).length)throw Error("Main inventory is invalid");
 if(Object.hasOwn(catalog.assets,target.input.symbol)||
    records.some(x=>x.id!==target.id&&x.kind==="token-creator"&&
     ["deployment-submitted","deployed","pr-published"].includes(x.phase)&&
     x.input.symbol===target.input.symbol))
  throw Error("Creator symbol conflicts with existing assets or deployment");
 const url=env.XITA_CREATOR_BROADCAST_RPC||"https://rpc.xgr.network";
 if(!/^https:\/\//.test(url))throw Error("Invalid XGRChain deployment RPC");
 const [chain,gasPriceHex,nonceHex,balanceHex]=await Promise.all([
  rpc(url,"eth_chainId",[]),rpc(url,"eth_gasPrice",[]),
  rpc(url,"eth_getTransactionCount",[wallet.address,"pending"]),
  rpc(url,"eth_getBalance",[wallet.address,"latest"])
 ]);
 if(BigInt(chain)!==1643n)throw Error("Creator operator RPC chain mismatch");
 const gasPrice=BigInt(gasPriceHex);
 if(gasPrice<=0n||gasPrice>limit.gasPrice)throw Error("Creator gas price cap exceeded");
 const data=creatorFactoryInterface.encodeFunctionData("createToken",[
  target.input.name,target.input.symbol,BigInt(target.input.initialSupply)*10n**18n,target.input.ownerAddress
 ]);
 const estimate=BigInt(await rpc(url,"eth_estimateGas",[{from:wallet.address,to:factory.address,data,value:"0x0"}]));
 const gasLimit=estimate+estimate/4n+10000n, reserved=gasLimit*gasPrice;
 if(gasLimit>limit.gasLimit||reserved>limit.dailyWei||
    use.reservedWei+reserved>limit.dailyWei||BigInt(balanceHex)<reserved)
  return {phase:"budget-exhausted"};
 const signed=await wallet.signTransaction({chainId:1643,type:0,nonce:Number(BigInt(nonceHex)),
  gasPrice,gasLimit,to:factory.address,data,value:0n});
 const txHash=keccak256(signed);
 // Durable before any broadcast; on crash/timeout only this exact signed
 // transaction can ever be retried. Key and private contact never enter Git.
 await lockedRecord(path,target.id,async record=>{
  safeRecord(record);record.phase="deployment-submitted";
  record.deployment={status:"submitted",chainId:1643,ownerAddress:record.input.ownerAddress,
   txHash,rawSignedTransaction:signed,nonce:Number(BigInt(nonceHex)),signedAt:new Date(now).toISOString(),
   reservedWei:reserved.toString(),tokenAddress:null};
  savePrivate(path,record);
 });
 try{await rpc(url,"eth_sendRawTransaction",[signed])}
 catch(e){if(!/already known|known transaction|nonce too low/i.test(String(e.message||e)))
   return {phase:"broadcast-uncertain",id:target.id,txHash};}
 return {phase:"deployment-submitted",id:target.id,txHash};
}
export async function runCreatorWorker(env=process.env){
 const dir=privateLocation(env),lock=join(dir,".creator-deployment-worker.lock");
 const fd=openSync(lock,"wx",0o600);
 try{return await processCreatorQueue({env});}
 finally{closeSync(fd);unlinkSync(lock);}
}
if(process.argv[1]&&process.argv[1].endsWith("/creator-operator.mjs")){
 runCreatorWorker().then(value=>console.log(JSON.stringify(value)))
  .catch(err=>{console.error("Creator worker failed safely:",err.message);process.exitCode=1});
}
