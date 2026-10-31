// A protocol-defined native finality rule, not operator-configured block depth.
// Mirrors the XGR Node v3.4.1 chain policy; no fallback from safe/finalized to latest.
const TAGS=new Map([[1643,"latest"],[10,"safe"],[8453,"safe"],[42161,"safe"],[56,"finalized"]]);
const HASH=/^0x[0-9a-f]{64}$/i;
export async function sourceFinalityHead(rpc,chainId){
 const id=Number(chainId),tag=TAGS.get(id);
 if(!tag)throw Error("Unsupported XITA source chain finality policy");
 if(BigInt(await rpc.send("eth_chainId",[]))!==BigInt(id))
  throw Error("Source RPC chain ID differs from compiled finality policy");
 const raw=await rpc.send("eth_getBlockByNumber",[tag,false]);
 if(!raw||!HASH.test(raw.hash||"")||typeof raw.number!=="string")
  throw Error("Native finality unavailable; confirmations/latest fallback forbidden");
 const n=BigInt(raw.number);
 if(n<=0n||n>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error("Invalid chain-native finality block height");
 const height=Number(n),canonical=await rpc.getBlock(height);
 if(!canonical||!HASH.test(canonical.hash||"")||
    canonical.hash.toLowerCase()!==raw.hash.toLowerCase()||
    Number(canonical.number)!==height)
  throw Error("Finality head block hash is not canonical");
 return height;
}
export async function verifySourceFinalityReceipt(rpc,chainId,receipt){
 if(!receipt||receipt.status!==1||!HASH.test(receipt.blockHash||"")||
    !Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<=0)
  throw Error("Invalid source transaction receipt");
 const head=await sourceFinalityHead(rpc,chainId);
 if(receipt.blockNumber>head)throw Error("Source receipt not yet chain-native safe/final");
 const block=await rpc.getBlock(receipt.blockNumber);
 if(!block||!HASH.test(block.hash||"")||
    block.hash.toLowerCase()!==receipt.blockHash.toLowerCase()||
    Number(block.number)!==receipt.blockNumber)
  throw Error("Source receipt block hash not canonical");
 return true;
}
