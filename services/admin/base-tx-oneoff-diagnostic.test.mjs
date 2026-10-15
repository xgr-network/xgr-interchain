// TEMPORARY diagnostic, never merge. Known transaction candidate from prior MetaMask confirmation.
import test from "node:test";
import {selector,keccak256} from "../../apps/web/keccak.mjs";
const txHash="0xc3670ea6eaf0d9d3a91b6e443a9fbb425d7b470619b5a607e921f1558c16a832";
const factory="0xa3018e0560113fe3206aadeb1ee9553fd1e76370";
const registry="0xbd87ceebbac310186b0caf2ec4ed6c50f7d767c3";
test("read original SourceRegistry candidate transaction and receipt",async()=>{
 for(const url of ["https://mainnet.base.org","https://base-rpc.publicnode.com","https://base.llamarpc.com"]){
  const rpc=async(method,params)=>{
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6500);
   try {
    const res=await fetch(url,{method:"POST",signal:abort.signal,headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
    const v=await res.json();if(v.error)throw Error(JSON.stringify(v.error));return v.result;
   }finally{clearTimeout(timer);}
  };
  try{
   const [id,tx,receipt,registryWord,code,registryCode]=await Promise.all([
    rpc("eth_chainId",[]),rpc("eth_getTransactionByHash",[txHash]),rpc("eth_getTransactionReceipt",[txHash]),
    rpc("eth_call",[{to:factory,data:selector("registry()")},"latest"]),
    rpc("eth_getCode",[registry,"latest"]),
    rpc("eth_getCode",[factory,"latest"])
   ]);
   console.log("XITA_ORIGINAL_CANDIDATE",JSON.stringify({url,id,tx:tx&&{
    hash:tx.hash,from:tx.from,to:tx.to,value:tx.value,nonce:tx.nonce,
    data:tx.input??tx.data,blockNumber:tx.blockNumber,blockHash:tx.blockHash
   },receipt:receipt&&{status:receipt.status,from:receipt.from,to:receipt.to,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,
    logs:receipt.logs?.map(l=>({address:l.address,topics:l.topics,data:l.data,transactionHash:l.transactionHash}))},
    expectedTopic:keccak256("RegistryDeployed(address)"),factory,registry,registryWord,registryBytecodeLength:code?.length,factoryBytecodeLength:registryCode?.length}));
   if(tx||receipt)break;
  }catch(e){console.log("XITA_ORIGINAL_CANDIDATE_ERROR",url,String(e.message||e));}
 }
});
