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

test("locate canonical original RegistryDeployed event",async()=>{
 const url="https://mainnet.base.org";
 const rpc=async(method,params)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:controller.signal});
   const obj=await res.json();if(obj.error)throw Error(JSON.stringify(obj.error));return obj.result;
  }finally{clearTimeout(timer);}
 };
 const topic=keccak256("RegistryDeployed(address)");
 const registry="0xbd87ceebbac310186b0caf2ec4ed6c50f7d767c3";
 const target="0x"+"0".repeat(24)+registry.slice(2);
 const start=52602626;
 const end=Number(BigInt(await rpc("eth_blockNumber",[])));
 console.log("XITA_REGISTRY_SCAN_RANGE",JSON.stringify({start,end}));
 const candidates=[];
 try{
  const logs=await rpc("eth_getLogs",[{address:FACTORY,fromBlock:"0x"+start.toString(16),toBlock:"0x"+end.toString(16),topics:[topic,target]}]);
  candidates.push(...logs);
 }catch(e){
  console.log("XITA_REGISTRY_WHOLE_RANGE_ERROR",String(e.message||e));
  for(let i=start;i<=end;i+=1900){
   try{const logs=await rpc("eth_getLogs",[{address:FACTORY,fromBlock:"0x"+i.toString(16),toBlock:"0x"+Math.min(i+1899,end).toString(16),topics:[topic,target]}]);candidates.push(...logs);if(logs.length)break;}
   catch(e){console.log("XITA_REGISTRY_CHUNK_ERROR",i,String(e.message||e));break;}
  }
 }
 console.log("XITA_REGISTRY_EVENTS",JSON.stringify(candidates));
 for(const e of candidates){
  const [tx,receipt,code]=await Promise.all([
   rpc("eth_getTransactionByHash",[e.transactionHash]),rpc("eth_getTransactionReceipt",[e.transactionHash]),
   rpc("eth_getCode",[registry,e.blockNumber])
  ]);
  console.log("XITA_REGISTRY_CANONICAL",JSON.stringify({hash:e.transactionHash,tx:tx&&{from:tx.from,to:tx.to,input:tx.input,nonce:tx.nonce},receipt:receipt&&{status:receipt.status,to:receipt.to,from:receipt.from,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,logCount:receipt.logs?.length},codeLength:code?.length,codePrefix:code?.slice(0,90),registry}));
 }
});
