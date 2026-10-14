// Read-only recovery of a SourceRegistry already created by the approved
// factory, even when the local wallet WAL contains a different transaction
// hash. The Factory's unique RegistryDeployed(address) event is the source
// of provenance; a registry() getter alone is NEVER enough for publication.
import {keccak256} from "../../apps/web/keccak.mjs";
import {compareCommittedWalletTransaction} from "./deployment-wallet-transaction.mjs";

const ADDR=/^0x[a-f0-9]{40}$/i,HASH=/^0x[a-f0-9]{64}$/i;
const SELECTOR="0x"+keccak256("deployRegistry()").slice(2,10);
const TOPIC=keccak256("RegistryDeployed(address)");
const equal=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const addrTopic=a=>"0x"+"0".repeat(24)+a.slice(2).toLowerCase();
const asBlock=x=>{
 if(typeof x!=="string"||!/^0x[0-9a-f]+$/i.test(x))throw Error("Invalid Factory deployment block");
 return BigInt(x);
};
export async function findVerifiedSourceRegistryTransaction({
 rpc,url,entry,registryAddress,factoryDeploymentBlock
}){
 const factory=entry?.transaction?.to;
 if(!ADDR.test(factory||"")||!ADDR.test(registryAddress||"")||
    !/^0x[0-9a-f]+$/i.test(factoryDeploymentBlock||"")||
    typeof rpc!=="function")
  return {found:false,reason:"factory-genesis-receipt-unavailable"};
 const first=asBlock(factoryDeploymentBlock);
 const head=asBlock(await rpc(url,"eth_blockNumber",[]));
 if(first>head)return {found:false,reason:"factory-deployment-block-ahead-of-chain"};
 // Query only since the trusted Factory's actual creation block, NOT from
 // Base genesis. RPCs with a smaller log-range limit are supported by chunks.
 const topicAddress=addrTopic(registryAddress);
 let candidates=[];
 const span=1900n;
 for(let from=first;from<=head;from+=span){
  const to=from+span-1n>head?head:from+span-1n;
  let logs;
  try{logs=await rpc(url,"eth_getLogs",[{
   address:factory,
   fromBlock:"0x"+from.toString(16),toBlock:"0x"+to.toString(16),
   topics:[TOPIC,topicAddress]
  }]);}
  catch{return {found:false,reason:"source-registry-event-rpc-unavailable"};}
  if(!Array.isArray(logs))return {found:false,reason:"source-registry-event-rpc-invalid"};
  candidates.push(...logs.filter(log=>
   log?.removed!==true&&equal(log.address,factory)&&
   Array.isArray(log.topics)&&log.topics.length===2&&
   equal(log.topics[0],TOPIC)&&equal(log.topics[1],topicAddress)&&
   HASH.test(log.transactionHash||"")));
  if(candidates.length>1)return {found:false,reason:"source-registry-event-ambiguous"};
 }
 if(candidates.length!==1)return {found:false,reason:"source-registry-event-not-found"};
 const log=candidates[0],txHash=log.transactionHash.toLowerCase();
 const [receipt,tx]=await Promise.all([
  rpc(url,"eth_getTransactionReceipt",[txHash]),
  rpc(url,"eth_getTransactionByHash",[txHash])
 ]);
 if(!receipt||!tx||receipt.status!=="0x1"||
    !equal(receipt.transactionHash,txHash)||
    !equal(receipt.to,factory)||!equal(receipt.from,entry.wallet)||
    !equal(receipt.blockHash,log.blockHash)||
    String(receipt.blockNumber).toLowerCase()!==String(log.blockNumber).toLowerCase())
  return {found:false,reason:"source-registry-event-receipt-mismatch"};
 const proof=compareCommittedWalletTransaction({...entry,txHash},tx);
 if(!proof.matched||!equal(tx.input??tx.data,SELECTOR))
  return {found:false,reason:"source-registry-event-wallet-mismatch"};
 if(!Array.isArray(receipt.logs)||!receipt.logs.some(item=>
   equal(item.address,factory)&&
   Array.isArray(item.topics)&&item.topics.length===2&&
   equal(item.topics[0],TOPIC)&&equal(item.topics[1],topicAddress)))
  return {found:false,reason:"source-registry-event-not-in-receipt"};
 return {found:true,txHash,registryAddress:registryAddress.toLowerCase()};
}
