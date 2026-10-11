// Read-only canonical-chain proof before discarding an obsolete documented
// prelaunch wallet intent. Never discard prepared, pending or failed txs.
// No old receipts, copies or migration archives are stored.
import {keccak256,selector} from "../../apps/web/keccak.mjs";

const TX=/^0x[0-9a-f]{64}$/i;
const ADDR=/^0x[0-9a-f]{40}$/i;
const SHA=/^[0-9a-f]{40}$/i;
const BLOCK=/^0x[0-9a-f]{64}$/i;
const equal=(x,y)=>typeof x==="string"&&typeof y==="string"&&x.toLowerCase()===y.toLowerCase();
const validHex=x=>typeof x==="string"&&/^0x[0-9a-f]+$/i.test(x);
function uint(x,label){
 if(!validHex(x))throw Error("Invalid "+label+" RPC quantity");
 return BigInt(x);
}

export async function verifyDiscardableDocumentedIntent({
 entry,chain,sourceCommit,rpc
}){
 if(!entry||!chain||entry.stage!=="documented"||entry.id!==chain.name+":validatorRegistry"||
    entry.chainId!==chain.chainId||!TX.test(entry.txHash||"")||
    !SHA.test(entry.sourceCommit||"")||entry.sourceCommit===sourceCommit||
    !ADDR.test(entry.wallet||"")||
    !ADDR.test(entry.verifiedProof?.contractAddress||"")||
    !TX.test(entry.verifiedProof?.runtimeKeccak||"")||
    entry.transaction?.to!==null||!validHex(entry.transaction.nonce)||
    !validHex(entry.transaction.value)||!/^0x(?:[0-9a-f]{2})+$/i.test(entry.transaction.data||""))
   throw Error("Only independently documented older Registry deployments can be discarded");

 const url=chain.rpcUrls?.[0];
 if(!/^https:\/\//.test(url||""))throw Error("Approved RPC required");
 if(uint(await rpc(url,"eth_chainId",[]),"chain ID")!==BigInt(chain.chainId))
   throw Error("Network mismatch: intent reset refused");
 const tx=await rpc(url,"eth_getTransactionByHash",[entry.txHash]);
 if(!tx||!equal(tx.hash,entry.txHash)||!equal(tx.from,entry.wallet)||
    tx.to!==null||!equal(tx.input,entry.transaction.data)||
    uint(tx.nonce,"nonce")!==uint(entry.transaction.nonce,"intent nonce")||
    uint(tx.value,"value")!==uint(entry.transaction.value,"intent value"))
   throw Error("Old wallet transaction not independently verified; intent retained");

 const receipt=await rpc(url,"eth_getTransactionReceipt",[entry.txHash]);
 if(!receipt||!equal(receipt.transactionHash,entry.txHash)||
    uint(receipt.status,"receipt status")!==1n||
    !equal(receipt.contractAddress,entry.verifiedProof.contractAddress)||
    !BLOCK.test(receipt.blockHash||""))
   throw Error("Old transaction not successfully mined; intent retained");
 const height=uint(receipt.blockNumber,"receipt block");
 const [head,block,code]=await Promise.all([
  rpc(url,"eth_blockNumber",[]),
  rpc(url,"eth_getBlockByNumber",[receipt.blockNumber,false]),
  rpc(url,"eth_getCode",[entry.verifiedProof.contractAddress,"latest"])
 ]);
 if(!block||!equal(block.hash,receipt.blockHash)||
    uint(head,"head block")<height||
    (uint(head,"head block")-height+1n)<BigInt(chain.confirmations||1))
   throw Error("Old transaction not finalized on the canonical chain; intent retained");
 if(!/^0x(?:[0-9a-f]{2})+$/i.test(code||"")||
    !equal(keccak256(Uint8Array.from(Buffer.from(code.slice(2),"hex"))),
      entry.verifiedProof.runtimeKeccak))
   throw Error("Old deployed code differs from verified receipt; intent retained");

 // Never discard a current Registry V3 just because GitHub documentation is missing.
 // Older non-versioned contracts either revert or return empty bytes.
 let version;
 try{
  version=await rpc(url,"eth_call",[{
    to:entry.verifiedProof.contractAddress,data:selector("registryVersion()")
  },"latest"]);
 }catch(e){
  if(!/execution reverted|revert/i.test(String(e.message||e)))throw e;
  version="0x";
 }
 if(version!=="0x"){
  if(!/^0x[0-9a-f]{64}$/i.test(version||""))
   throw Error("Registry version unknown: reset refused");
  if(BigInt(version)>=3n)
   throw Error("Registry V3 is deployed; recover its record instead of resetting");
 }
 return {verified:true};
}
