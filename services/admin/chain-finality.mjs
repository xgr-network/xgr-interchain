// Finalized-only deployment receipt gate for chains that explicitly require it.
// Never accept latest, safe, or a confirmation-depth fallback.
const QUANTITY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
export async function readCanonicalFinalizedHead({rpc,url}){
 if(typeof rpc!=="function"||typeof url!=="string"||!url.startsWith("https://"))
  throw Error("Approved finalized RPC required");
 const head=await rpc(url,"eth_getBlockByNumber",["finalized",false]);
 if(!QUANTITY.test(head?.number||"")||!HASH.test(head?.hash||""))
  throw Error("Finalized head unavailable or malformed; deployment cannot be recorded");
 const numbered=await rpc(url,"eth_getBlockByNumber",[head.number,false]);
 if(!QUANTITY.test(numbered?.number||"")||
    BigInt(numbered.number)!==BigInt(head.number)||
    !HASH.test(numbered?.hash||"")||
    numbered.hash.toLowerCase()!==head.hash.toLowerCase())
  throw Error("Finalized head failed canonical numbered-block verification");
 return {number:BigInt(head.number),hash:head.hash.toLowerCase()};
}
