// TEMPORARY: read-only chain evidence for an already mined XGR router.
// Intentionally logs only public on-chain transaction facts; no secrets.
import test from "node:test";
const RPC="https://arb1.arbitrum.io/rpc";
const HASH="0x1e76be880e4df430645805d717ec003d6560d32cd225fc6a86800dfe5e188a58";
async function rpc(method,params=[]){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
 try{
  const result=await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:abort.signal});
  const response=await result.json();
  return response.error?{error:response.error}:response.result;
 }finally{clearTimeout(timer)}
}
test("read-only Arbitrum router original transaction provenance",async()=>{
 const tx=await rpc("eth_getTransactionByHash",[HASH]);
 const receipt=await rpc("eth_getTransactionReceipt",[HASH]);
 const block=receipt?.blockNumber?await rpc("eth_getBlockByNumber",[receipt.blockNumber,false]):null;
 const evidence={
  tx:tx?.error?tx:{hash:tx?.hash,from:tx?.from,to:tx?.to,nonce:tx?.nonce,
   value:tx?.value,gas:tx?.gas,gasPrice:tx?.gasPrice,blockNumber:tx?.blockNumber,
   data:tx?.input?.slice(0,140),chainId:tx?.chainId},
  receipt:receipt?.error?receipt:{status:receipt?.status,blockHash:receipt?.blockHash,
   blockNumber:receipt?.blockNumber,from:receipt?.from,to:receipt?.to,gasUsed:receipt?.gasUsed,
   contractAddress:receipt?.contractAddress,logs:receipt?.logs?.map(l=>({address:l.address,topics:l.topics}))},
  block:{number:block?.number,timestamp:block?.timestamp},
  liveHead:await rpc("eth_blockNumber")
 };
 console.log("XITA_ORIGINAL_ROUTER_RECEIPT="+JSON.stringify(evidence));
});
