#!/usr/bin/env node
// OPTIONAL GmbH-owned executor. ILN destination Mailbox remains public;
// no permission, custody or validator key lives in this service.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {Wallet,Contract,JsonRpcProvider,keccak256} from "ethers";
import {readManagedIndex,persistManagedIndex,scanManagedWindow}
 from "./managed-indexer.mjs";
import {verifiedManagedReceipt,managedAbi} from "./managed-index.mjs";
import {deliverManagedMessage} from "./delivery.mjs";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {resolveRecoveryRoute,runRecoveryProcess} from "../indexer/transfer-recovery.mjs";

const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const CATALOG=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
const KEY="XITA_MANAGED_RELAYER_PRIVATE_KEY";
const required=name=>{const v=String(process.env[name]||"").trim();if(!v)throw Error("Missing "+name);return v};
const signer=new Wallet(required(KEY));
const indexPath=process.env.XITA_MANAGED_INDEX_FILE||"/var/lib/xita-managed-relay/index.json";
const ADDR=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const managedSources={
 xgrchain:{
  address:process.env.XITA_MANAGED_XGRCHAIN_EXECUTION_ADDRESS||"",
  block:process.env.XITA_MANAGED_XGRCHAIN_DEPLOY_BLOCK||""
 },
 base:{
  address:process.env.XITA_MANAGED_BASE_EXECUTION_ADDRESS||"",
  block:process.env.XITA_MANAGED_BASE_DEPLOY_BLOCK||""
 }
};
const rpcCache=new Map();
async function provider(name){
 const cfg=CATALOG.chains[name];
 if(!cfg?.rpcUrls?.length)throw Error("Unknown destination chain");
 if(!rpcCache.has(name))rpcCache.set(name,new JsonRpcProvider(cfg.rpcUrls[0]));
 const client=rpcCache.get(name);
 const net=await client.getNetwork();
 if(net.chainId!==BigInt(cfg.chainId))throw Error("Wrong chain RPC for "+name);
 return client;
}
function configuredSources(){
 const values=[];
 for(const [chain,service] of Object.entries(managedSources)){
  const supplied=Boolean(service.address||service.block);
  if(!supplied)continue;
  if(!ADDR.test(service.address||"")||
   !/^[1-9][0-9]*$/.test(service.block||"")||
   !Number.isSafeInteger(Number(service.block)))
   throw Error("Incomplete operator deployment config "+chain);
  values.push({...service,chain,block:Number(service.block)});
 }
 if(!values.length)throw Error("No deployed managed ExecutionGateway configured");
 return values;
}
const mailboxAbi=["function delivered(bytes32 messageId) view returns (bool)"];
async function finalizedDelivered(destProvider,mailboxAddress,id,destination){
 const head=await destProvider.getBlockNumber();
 const finalized=head-Math.max(1,Number(CATALOG.chains[destination].confirmations||1))+1;
 if(finalized<1)throw Error("Destination block finality unavailable");
 const mailbox=new Contract(mailboxAddress,mailboxAbi,destProvider);
 return mailbox.delivered(id,{blockTag:finalized});
}
async function preflightDestinationTransaction({
 destinationProvider,destination,proof
}){
 const cfg=CATALOG.chains[destination],wallet=signer.connect(destinationProvider);
 const network=await destinationProvider.getNetwork();
 if(network.chainId!==BigInt(cfg.chainId))throw Error("Destination chain ID mismatch");
 const tx={from:signer.address,to:proof.destinationMailbox,
  data:proof.data,value:0n};
 await destinationProvider.call(tx);
 const gas=await destinationProvider.estimateGas(tx);
 const gasLimit=gas*13n/10n+30000n;
 const latest=await destinationProvider.getBlock("latest");
 if(!latest||!latest.gasLimit||gasLimit>5000000n||
   gasLimit+50000n>=BigInt(latest.gasLimit))
  throw Error("Destination gas estimate outside bounded block gas cap");
 const fee=await destinationProvider.getFeeData();
 const gasPrice=fee.maxFeePerGas||fee.gasPrice||0n;
 if(gasPrice<1n)throw Error("Destination fee data unavailable");
 if((await destinationProvider.getBalance(signer.address))<gasLimit*gasPrice*2n)
  throw Error("Relayer destination gas reserve insufficient");
 const nonce=await destinationProvider.getTransactionCount(signer.address,"pending");
 const values={
  to:proof.destinationMailbox,data:proof.data,value:0n,nonce,
  chainId:cfg.chainId,gasLimit
 };
 if(fee.maxFeePerGas&&fee.maxPriorityFeePerGas)
  Object.assign(values,{type:2,maxFeePerGas:fee.maxFeePerGas,
   maxPriorityFeePerGas:fee.maxPriorityFeePerGas});
 else Object.assign(values,{type:0,gasPrice:fee.gasPrice});
 const raw=await wallet.signTransaction(values);
 return {raw,hash:keccak256(raw)};
}
async function processManagedEntry({entry,state,sourceProvider,persist}){
 if(entry.status==="DELIVERED"||entry.delivered===true||
    entry.status==="DESTINATION_REVERTED_MANUAL_REVIEW")return;
 const route=deployedRoutes(CATALOG).filter(r=>
  r.source===entry.sourceChain&&r.destination===entry.destinationChain&&
  eq(r.gateway,entry.gateway)&&eq(r.routeId,entry.routeId)&&
  r.asset===entry.asset);
 if(route.length!==1)throw Error("Managed source route not uniquely available");
 const own=managedSources[entry.sourceChain];
 const receipt=await sourceProvider.getTransactionReceipt(entry.sourceTxHash);
 if(!receipt||receipt.status!==1||
    !eq(receipt.blockHash,entry.sourceBlockHash))
  throw Error("Stored managed source transaction not canonical");
 const sourceHead=await sourceProvider.getBlockNumber();
 if(sourceHead-receipt.blockNumber+1<
   Math.max(1,Number(CATALOG.chains[entry.sourceChain].confirmations||1)))
  throw Error("Stored source transaction not finalized");
 const proven=verifiedManagedReceipt({catalog:CATALOG,sourceChain:entry.sourceChain,
  executionAddress:own.address,receipt,messageId:entry.messageId});
 for(const field of ["gateway","payer","routeId","messageId","sourceTxHash","serviceFeeWei"]){
  if(!eq(proven[field],entry[field]))throw Error("Stored managed event changed");
 }
 const native=new Contract(own.address,managedAbi,sourceProvider);
 const fee=await native.feeReceipt(entry.messageId,{blockTag:receipt.blockNumber});
 if(!fee.exists||!eq(fee.payer,entry.payer)||
    !eq(fee.gateway,entry.gateway)||
    BigInt(fee.relayerFeeWei)!==BigInt(entry.serviceFeeWei))
  throw Error("Missing or altered managed on-chain service fee");
 const destProvider=await provider(entry.destinationChain),dst=CATALOG.chains[entry.destinationChain];
 const mailbox=CATALOG.infrastructure[entry.destinationChain]?.xitaV315?.components?.mailbox?.address;
 if(!ADDR.test(mailbox||""))throw Error("Missing canonical destination Mailbox");
 const updated=await deliverManagedMessage(entry,{
  destinationChainId:dst.chainId,destinationMailbox:mailbox,
  getDelivered:id=>finalizedDelivered(destProvider,mailbox,id,entry.destinationChain),
  getProof:async()=>{
   const recovery=resolveRecoveryRoute(CATALOG,route[0].name,entry.messageId,
    route[0].asset,entry.sourceTxHash);
   return runRecoveryProcess(recovery);
  },
  signTransaction:proof=>preflightDestinationTransaction({
   destinationProvider:destProvider,destination:entry.destinationChain,proof}),
  getPreviousTx:async hash=>{
   const prior=await destProvider.getTransactionReceipt(hash);
   if(prior)return prior.status===1?"confirmed":"failed";
   return (await destProvider.getTransaction(hash))?"pending":"absent";
  },
  broadcastRaw:raw=>destProvider.broadcastTransaction(raw),
  persist
 });
 console.log("XITA managed delivery",entry.sourceChain,entry.messageId,
  updated.status,updated.destinationTxHash||"");
}
export async function managedTick({sources=configuredSources(),state=await readManagedIndex(indexPath),
 save=next=>persistManagedIndex(indexPath,next)}={}){
 for(const service of sources){
  try{
   const sourceProvider=await provider(service.chain);
   const admin=new Contract(service.address,["function relayerOwner() view returns (address)"],sourceProvider);
   if(!eq(await admin.relayerOwner(),signer.address))
    throw Error("Operator key does not own deployed managed adapter");
   for(let n=0;n<4;n++){
    const scan=await scanManagedWindow({catalog:CATALOG,index:state,
     sourceChain:service.chain,provider:sourceProvider,executionAddress:service.address,
     deploymentBlock:service.block,
     confirmations:CATALOG.chains[service.chain].confirmations||1});
    state=scan.index;
    if(scan.scanned)await save(state);
    if(!scan.scanned||scan.to>=scan.finalized)break;
   }
  }catch(error){
   console.warn("Managed source event scan unavailable",service.chain,String(error.message||error).slice(0,160));
  }
 }
 // Explicitly limit work to this adapter's messages. No all-token/indexer scan.
 for(const entry of Object.values(state.operations)){
  if(!managedSources[entry.sourceChain]?.address)continue;
  const sourceProvider=await provider(entry.sourceChain);
  try{
   await processManagedEntry({entry,state,sourceProvider,persist:async next=>{
    state.operations[entry.sourceChain+":"+entry.messageId]=next;
    await save(state);
   }});
  }catch(error){
   console.warn("Managed delivery pending",entry.sourceChain,entry.messageId,
    String(error?.code||error?.message||error).slice(0,160));
  }
 }
 return state;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 configuredSources();
 (async()=>{
  for(;;){
   try{await managedTick()}catch(error){
    console.error("Managed worker tick failed",String(error.message||error).slice(0,150));
   }
   await new Promise(done=>setTimeout(done,12000));
  }
 })();
}
