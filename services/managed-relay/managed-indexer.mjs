// Single-operator source-event worklist. Scans ONE adapter address per
// supported source chain, independent of the number of deployed token routes.
// State is a DERIVED cache: it can be rebuilt from the finalized source logs.
import {readFile,writeFile,rename,mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {managedDispatchTopic,verifiedManagedReceipt,mergeIndexedMessage,managedAbi} from "./managed-index.mjs";
import {Contract} from "ethers";
const HASH=/^0x[0-9a-f]{64}$/i;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const id=x=>String(x||"").toLowerCase();
const empty=()=>({schema:"xita-managed-relay-index-v1",cursors:{},operations:{}});
export async function readManagedIndex(path){
 try{
  const value=JSON.parse(await readFile(path,"utf8"));
  if(value?.schema!=="xita-managed-relay-index-v1"||!value.cursors||
   typeof value.cursors!=="object"||!value.operations||
   typeof value.operations!=="object")throw Error("Unsupported managed index");
  return value;
 }catch(error){
  if(error.code==="ENOENT")return empty();
  throw error;
 }
}
export async function persistManagedIndex(path,index){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 const tmp=path+".new";
 await writeFile(tmp,JSON.stringify(index)+"\n",{mode:0o600});
 await rename(tmp,path);
}
export async function scanManagedWindow({catalog,index,sourceChain,provider,
 executionAddress,deploymentBlock,confirmations=12,limit=150,
 parseReceipt=verifiedManagedReceipt,
 readFeeReceipt=async(provider,address,messageId,blockNumber)=>{
  const contract=new Contract(address,managedAbi,provider);
  return contract.feeReceipt(messageId);
 }}){
 if(!ADDRESS.test(executionAddress||"")||!Number.isSafeInteger(deploymentBlock)||
   deploymentBlock<1||!Number.isSafeInteger(confirmations)||confirmations<1||
   !Number.isSafeInteger(limit)||limit<1||limit>1000)
  throw Error("Invalid operator source scan configuration");
 const chain=catalog.chains[sourceChain];
 if(!chain)throw Error("Unknown source chain");
 const network=await provider.getNetwork();
 if(network.chainId!==BigInt(chain.chainId))throw Error("Operator source RPC wrong chain");
 const cursors={...index.cursors},operations={...index.operations},head=await provider.getBlockNumber();
 const finalized=head-confirmations+1;
 let cursor=cursors[sourceChain];
 if(cursor){
  if(cursor.contract!==id(executionAddress)||cursor.deploymentBlock!==deploymentBlock)
   throw Error("Operator index contract identity changed; explicit rebuild required");
  const canonical=await provider.getBlock(cursor.to);
  if(!canonical||!HASH.test(canonical.hash||"")||
     id(canonical.hash)!==cursor.hash){
   // Reorg recovery must discard the affected chain's provisional projections.
   cursor=null;delete cursors[sourceChain];
   for(const key of Object.keys(operations))if(key.startsWith(sourceChain+":"))delete operations[key];
  }
 }
 const from=cursor?cursor.to+1:deploymentBlock;
 if(from>finalized)return {index:{...index,cursors,operations},scanned:false,indexed:0,
  from,finalized};
 const to=Math.min(finalized,from+limit-1);
 const logs=await provider.getLogs({address:executionAddress,
  topics:[managedDispatchTopic],fromBlock:from,toBlock:to});
 if(!Array.isArray(logs))throw Error("Operator source logs unavailable");
 let count=0;
 for(const log of logs){
  if(log.removed||id(log.address)!==id(executionAddress)||
   !HASH.test(log.transactionHash||"")||!HASH.test(log.blockHash||"")||
   !HASH.test(log.topics?.[1]||"")||
   !Number.isSafeInteger(log.blockNumber)||log.blockNumber<from||log.blockNumber>to)
   throw Error("Unexpected source event in finalized operator scan");
  const receipt=await provider.getTransactionReceipt(log.transactionHash);
  if(!receipt||id(receipt.blockHash)!==id(log.blockHash)||
   receipt.blockNumber!==log.blockNumber)
   throw Error("Source transaction receipt does not match canonical event");
  const proof=parseReceipt({catalog,sourceChain,executionAddress,receipt,
   messageId:log.topics[1]});
  const paid=await readFeeReceipt(provider,executionAddress,proof.messageId,receipt.blockNumber);
  if(!paid.exists||id(paid.payer)!==proof.payer||
     id(paid.gateway)!==proof.gateway||
     BigInt(paid.relayerFeeWei)!==BigInt(proof.serviceFeeWei))
   throw Error("On-chain managed fee receipt does not match canonical dispatch");
  const merged=mergeIndexedMessage(operations,proof);
  Object.assign(operations,merged.state);
  if(merged.added)count++;
 }
 const verified=await provider.getBlock(to);
 if(!HASH.test(verified?.hash||""))throw Error("Source cursor block unavailable");
 cursors[sourceChain]={contract:id(executionAddress),deploymentBlock,to,hash:id(verified.hash)};
 return {index:{schema:"xita-managed-relay-index-v1",cursors,operations},
  scanned:true,indexed:count,from,to,finalized};
}
