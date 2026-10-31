// Shared protocol-defined chain native finality. No operator-chosen confirmation
// fallback: OP/Base/Arbitrum use safe, BSC uses finalized, committed-IBFT XGRChain uses latest.
// JSON-RPC responses are revalidated against the canonical block at that height.
// A single untrusted provider remains an independent H-01 architectural risk.
const TAGS=new Map([[1643,"latest"],[10,"safe"],[8453,"safe"],[42161,"safe"],[56,"finalized"]]);
const HASH=/^0x[0-9a-f]{64}$/i;
const NUMBER=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const parseHeight=v=>{
 const raw=typeof v==="number"&&Number.isSafeInteger(v)?BigInt(v):
  typeof v==="bigint"?v:NUMBER.test(v||"")?BigInt(v):null;
 if(raw===null||raw<0n||raw>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error("Invalid native finality height");
 return Number(raw);
};
export function nativeFinalityTag(chainId){
 const tag=TAGS.get(Number(chainId));
 if(!tag||!Number.isSafeInteger(Number(chainId)))
  throw Error("Unsupported XITA chain native finality");
 return tag;
}
export async function readNativeFinalityHead(rpc,chainId){
 if(typeof rpc!=="function")throw Error("Missing canonical RPC");
 const tag=nativeFinalityTag(chainId);
 const id=await rpc("eth_chainId",[]);
 if(!NUMBER.test(id||"")||BigInt(id)!==BigInt(chainId))
  throw Error("Native finality RPC chain ID mismatch");
 const head=await rpc("eth_getBlockByNumber",[tag,false]);
 if(!HASH.test(head?.hash||""))throw Error("Native finality head unavailable; latest fallback forbidden");
 const number=parseHeight(head.number);
 if(number===0)throw Error("Native finality head not yet available");
 const pinned=await rpc("eth_getBlockByNumber",["0x"+number.toString(16),false]);
 if(!HASH.test(pinned?.hash||"")||parseHeight(pinned.number)!==number||
    pinned.hash.toLowerCase()!==head.hash.toLowerCase())
  throw Error("Native finality head is not canonical");
 return {number,hash:head.hash.toLowerCase(),tag};
}
export async function verifyNativeFinalityReceipt(rpc,chainId,receipt){
 if(!receipt||![1,"0x1"].includes(receipt.status)||
    !HASH.test(receipt.blockHash||""))
  throw Error("Invalid canonical source receipt");
 const blockNumber=parseHeight(receipt.blockNumber);
 if(blockNumber===0)throw Error("Source receipt has no mined block");
 const head=await readNativeFinalityHead(rpc,chainId);
 if(blockNumber>head.number)
  return {verified:false,reason:"not-native-safe",head};
 const block=await rpc("eth_getBlockByNumber",["0x"+blockNumber.toString(16),false]);
 if(!HASH.test(block?.hash||"")||parseHeight(block.number)!==blockNumber||
    block.hash.toLowerCase()!==receipt.blockHash.toLowerCase())
  throw Error("Source receipt block hash not canonical");
 return {verified:true,head,blockNumber,blockHash:block.hash.toLowerCase()};
}
export async function verifiedNativeMailboxState(rpc,chainId,mailbox,data){
 if(!/^0x[0-9a-f]{40}$/i.test(mailbox||"")||!/^0x[0-9a-f]+$/i.test(data||""))
  throw Error("Invalid destination Mailbox read");
 const head=await readNativeFinalityHead(rpc,chainId);
 const tag="0x"+head.number.toString(16);
 const raw=await rpc("eth_call",[{to:mailbox,data},tag]);
 if(!/^0x[0-9a-f]{64}$/i.test(raw||"")||![0n,1n].includes(BigInt(raw)))
  throw Error("Invalid canonical destination delivery state");
 const after=await rpc("eth_getBlockByNumber",[tag,false]);
 if(!HASH.test(after?.hash||"")||after.hash.toLowerCase()!==head.hash||
    parseHeight(after.number)!==head.number)
  throw Error("Destination safe/IBFT observation was reorganized");
 return {delivered:BigInt(raw)===1n,finalizedHead:head.number,
  finalizedHash:head.hash,verified:true};
}
