// TEMPORARY: read-only public Base RPC diagnosis. This file is never merged.
import test from "node:test";
import {selector,keccak256} from "../../apps/web/keccak.mjs";
const HASH="0xf0fd69a80b29e03f8ea28b2f170004831425b0f83324a599430153224d721083";
const FACTORY="0xa3018e0560113fe3206aadeb1ee9553fd1e76370";
test("diagnose exact Base receipt, tx and factory registry on public RPC",async()=>{
 for(const url of ["https://base-rpc.publicnode.com","https://mainnet.base.org","https://base-mainnet.g.alchemy.com/public"]){
  const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),6500);
  try {
   const rpc=async(method,params)=>{
    const res=await fetch(url,{method:"POST",signal:abort.signal,headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
    const obj=await res.json();if(obj.error)throw Error(JSON.stringify(obj.error));return obj.result;
   };
   const [chainId,tx,receipt,registry]=await Promise.all([
    rpc("eth_chainId",[]),
    rpc("eth_getTransactionByHash",[HASH]),
    rpc("eth_getTransactionReceipt",[HASH]),
    rpc("eth_call",[{to:FACTORY,data:selector("registry()")},"latest"])
   ]);
   console.log("XITA_BASE_TX_DIAG",JSON.stringify({url,chainId,tx:tx&&{
    hash:tx.hash,from:tx.from,to:tx.to,nonce:tx.nonce,value:tx.value,input:tx.input??tx.data,inputLength:(tx.input??tx.data)?.length,blockNumber:tx.blockNumber
   },receipt:receipt&&{status:receipt.status,from:receipt.from,to:receipt.to,blockNumber:receipt.blockNumber,contractAddress:receipt.contractAddress,logs:receipt.logs?.map(l=>({address:l.address,topics:l.topics,transactionHash:l.transactionHash}))},registry,selector:selector("deployRegistry()"),topic:keccak256("RegistryDeployed(address)")}));
   if(tx||receipt)break;
  }catch(e){console.log("XITA_BASE_TX_DIAG_RPC_ERROR",url,String(e.message||e));}
  finally{clearTimeout(timer);}
 }
});
