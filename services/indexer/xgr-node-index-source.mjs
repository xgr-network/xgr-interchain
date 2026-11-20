// No foreign RPC is permitted in this adapter. It reuses the EXISTING XITA
// canonical wallet/route/fee verifier on source TX and receipt JSON already
// archived by the XGR-node read index. It is NOT a BLS witness.
import {indexedRoutes,verifiedTransfer} from "./transfer-index.mjs";
import {nativeFinalityTag} from "../../apps/web/chain-finality.js";
const HASH=/^0x[0-9a-f]{64}$/i;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const lower=s=>String(s||"").toLowerCase();
const nodeChain=source=>source==="xgrchain"?"xgr":source;
const safeNumber=v=>{
 if(typeof v!=="string"||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v))
  throw Error("Invalid indexed source height");
 const n=BigInt(v);
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Indexed height unsafe");
 return Number(n);
};
export function nodeIndexSourceRead({route,operation,evidence}){
 if(!route||!operation||!evidence)throw Error("Missing archived source evidence");
 const config=route.sourceConfig;
 const tx=evidence.transaction,receipt=evidence.receipt;
 const block=evidence.sourceBlock,head=evidence.finalizedHeadBlock;
 if(!Number.isSafeInteger(config?.chainId)||config.chainId===1643||
    evidence.sourceChainId!==config.chainId||
    evidence.verifiedAs!=="FINALIZED_SINGLE_OPERATOR_OBSERVATION_NOT_BLS_EVIDENCE"||
    !HASH.test(operation.messageId||"")||
    !HASH.test(operation.sourceTxHash||"")||
    !HASH.test(evidence.sourceBlockHash||"")||
    !HASH.test(block?.hash||"")||!HASH.test(head?.hash||"")||
    !ADDRESS.test(tx?.from||"")||
    lower(tx.hash)!==lower(operation.sourceTxHash)||
    lower(receipt?.transactionHash)!==lower(operation.sourceTxHash)||
    lower(receipt?.blockHash)!==lower(evidence.sourceBlockHash)||
    lower(block.hash)!==lower(evidence.sourceBlockHash)||
    receipt.status!=="0x1"||
    safeNumber(block.number)!==operation.sourceBlockNumber||
    safeNumber(receipt.blockNumber)!==operation.sourceBlockNumber||
    safeNumber(head.number)<operation.sourceBlockNumber)
  throw Error("Source observation not canonically bound to Node feed");
 const tag=nativeFinalityTag(config.chainId);
 const byBlock=new Map([[safeNumber(block.number),block],
  [safeNumber(head.number),head]]);
 return async(chain,method,params=[])=>{
  if(Number(chain?.chainId)!==config.chainId)
   throw Error("Destination state requires a separate node-index observation");
  if(method==="eth_chainId")return "0x"+config.chainId.toString(16);
  if(method==="eth_blockNumber")return head.number;
  if(method==="eth_getTransactionByHash"&&lower(params[0])===lower(tx.hash))
   return tx;
  if(method==="eth_getTransactionReceipt"&&lower(params[0])===lower(tx.hash))
   return receipt;
  if(method==="eth_getBlockByNumber"&&params.length===2&&params[1]===false){
   if(params[0]===tag)return head;
   const n=safeNumber(params[0]);
   if(byBlock.has(n))return byBlock.get(n);
  }
  throw Error("Unindexed source RPC operation: "+String(method).slice(0,30));
 };
}
export async function projectXgrIndexedSource({catalog,operation,evidence,
 xgrRpc=null,verify=verifiedTransfer}){
 const matched=indexedRoutes(catalog).filter(route=>
  nodeChain(route.sourceChain)===operation?.source&&
  lower(route.routeId)===lower(operation.routeId)&&
  lower(route.gateway)===lower(operation.gateway)&&
  nodeChain(route.destinationChain)===operation.destination);
 if(matched.length!==1)throw Error("Node observation has no unique active XITA route");
 const route=matched[0];
 let rpc,sourceBlock=evidence?.sourceBlock;
 if(route.sourceConfig.chainId===1643){
  if(typeof xgrRpc!=="function"||evidence?.sourceChainId!==1643||
    evidence?.verifiedAs!=="FINALIZED_LOCAL_IBFT_OBSERVATION_NOT_BLS_EVIDENCE"||
    !HASH.test(evidence.sourceBlockHash||"")||
    lower(operation.sourceTxHash)!==lower(evidence.sourceTxHash)||
    operation.sourceBlockNumber!==evidence.sourceBlockNumber)
   throw Error("Native XGR source index evidence unavailable");
  // Native XGR source reads are restricted to the SAME XGR RPC's committed
  // chain. They never issue an external EVM RPC.
  const methods=new Set(["eth_chainId","eth_getTransactionByHash",
   "eth_getTransactionReceipt","eth_blockNumber","eth_getBlockByNumber"]);
  rpc=async(chain,method,params=[])=>{
   if(chain?.chainId!==1643||!methods.has(method))
    throw Error("Non-native or unsafe indexed XGR read");
   return xgrRpc(method,params);
  };
  sourceBlock=await xgrRpc("eth_getBlockByNumber",[
   "0x"+operation.sourceBlockNumber.toString(16),false]);
  if(!sourceBlock||lower(sourceBlock.hash)!==lower(evidence.sourceBlockHash)||
     safeNumber(sourceBlock.number)!==operation.sourceBlockNumber)
   throw Error("Indexed native source block identity mismatch");
 }else{
  rpc=nodeIndexSourceRead({route,operation,evidence});
 }
 const record=await verify({catalog,route,
  transactionHash:operation.sourceTxHash,rpc});
 if(record.delivered===true)
  throw Error("Node source receipt cannot assert destination delivery");
 if(lower(record.messageId)!==lower(operation.messageId)||
    lower(record.sourceTxHash)!==lower(operation.sourceTxHash)||
    lower(record.routeId)!==lower(operation.routeId))
  throw Error("Node source observation and XITA verification disagree");
 const epoch=safeNumber(sourceBlock?.timestamp);
 if(epoch<=0)throw Error("Missing canonical source time");
 return {route,record,event:{
  txHash:lower(operation.sourceTxHash),
  messageId:lower(operation.messageId),
  blockNumber:operation.sourceBlockNumber,
  blockHash:lower(evidence.sourceBlockHash),
  logIndex:operation.sourceLogIndex,
  sourceBlockAt:new Date(epoch*1000).toISOString()
 }};
}
