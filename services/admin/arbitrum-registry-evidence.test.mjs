// TEMPORARY read-only evidence collection for Arbitrum SourceRegistry.
// Outputs no secret, sends no EVM transaction and must be deleted after use.
import test from "node:test";
import {selector,keccak256} from "../../apps/web/keccak.mjs";

const FACTORY="0x3b83687d77170d42feddfe221629cc21e771e021";
const FROM=516837230n;
const txLast="0xe9bcb7a2b7bac5a7a575494dbd212fbf55b7b11e7e929040105441abcfd7c76c";
const txOld="0xf02ceb03ff4619a3efcce6dc7ce6cf6e6e1f0522eda95a678acbad9ea353589e";
const rpcUrls=["https://arbitrum-one-rpc.publicnode.com","https://arb1.arbitrum.io/rpc"];
const compactTx=t=>t?{hash:t.hash,from:t.from,to:t.to,nonce:t.nonce,inputStart:(t.input||"").slice(0,20),value:t.value,blockNumber:t.blockNumber}:null;
const compactReceipt=r=>r?{transactionHash:r.transactionHash,from:r.from,to:r.to,status:r.status,blockNumber:r.blockNumber,blockHash:r.blockHash,logs:(r.logs||[]).filter(e=>e.address?.toLowerCase()===FACTORY).map(e=>({address:e.address,topics:e.topics,transactionHash:e.transactionHash,blockHash:e.blockHash,blockNumber:e.blockNumber}))}:null;
const codeHash=s=>typeof s==="string"&&s.length>2?keccak256(Uint8Array.from(Buffer.from(s.slice(2),"hex"))):null;
async function rpc(url,method,params=[]){
 const ctrl=new AbortController();
 const timeout=setTimeout(()=>ctrl.abort(),9000);
 try{
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:ctrl.signal});
  const json=await response.json();
  if(!response.ok||json.error)throw Error(method+": "+JSON.stringify(json.error||response.status));
  return json.result;
 }finally{clearTimeout(timeout)}
}
test("temporary read-only Arbitrum Registry evidence",async()=>{
 let endpoint=null,head=null;
 const warnings=[];
 for(const url of rpcUrls){
  try{
   const id=await rpc(url,"eth_chainId");
   if(BigInt(id)!==42161n)throw Error("unexpected chain "+id);
   head=BigInt(await rpc(url,"eth_blockNumber"));
   endpoint=url;break;
  }catch(e){warnings.push(url+": "+String(e.message).slice(0,170))}
 }
 if(!endpoint){console.log("XITA_REGISTRY_EVIDENCE="+JSON.stringify({result:"RPC_UNAVAILABLE",warnings}));return}
 const out={result:"PROBED",rpc:endpoint,chainId:42161,head:Number(head),factory:FACTORY,factoryBlock:Number(FROM),warnings};
 const result=await rpc(endpoint,"eth_call",[{to:FACTORY,data:selector("registry()")},"latest"]);
 if(!/^0x[0-9a-fA-F]{64}$/.test(result||""))throw Error("invalid registry getter "+String(result).slice(0,90));
 const registry="0x"+BigInt(result).toString(16).padStart(40,"0");
 out.registry=registry;
 out.factoryCodeHash=codeHash(await rpc(endpoint,"eth_getCode",[FACTORY,"latest"]));
 for(const tx of [txOld,txLast]){
  const short=tx===txOld?"old":"last";
  try{
   out[short+"Receipt"]=compactReceipt(await rpc(endpoint,"eth_getTransactionReceipt",[tx]));
   out[short+"Tx"]=compactTx(await rpc(endpoint,"eth_getTransactionByHash",[tx]));
  }catch(e){warnings.push(short+" lookup: "+String(e.message).slice(0,150))}
 }
 if(BigInt(result)===0n){console.log("XITA_REGISTRY_EVIDENCE="+JSON.stringify(out));return}
 const topic=keccak256("RegistryDeployed(address)");
 const addrTopic="0x"+"0".repeat(24)+registry.slice(2);
 let events=[];
 for(let start=FROM;start<=head;start+=1500n){
  const end=start+1499n<head?start+1499n:head;
  try{
   events.push(...await rpc(endpoint,"eth_getLogs",[{
    address:FACTORY,fromBlock:"0x"+start.toString(16),toBlock:"0x"+end.toString(16),
    topics:[topic,addrTopic]}]));
  }catch(e){warnings.push("log window "+start+"-"+end+" "+String(e.message).slice(0,170));break}
  if(events.length>0)break;
 }
 out.eventCount=events.length;
 const event=events[0]||null;
 if(event){
  out.event={address:event.address,topics:event.topics,transactionHash:event.transactionHash,blockHash:event.blockHash,blockNumber:event.blockNumber,logIndex:event.logIndex,removed:event.removed};
  const receipt=await rpc(endpoint,"eth_getTransactionReceipt",[event.transactionHash]);
  out.creationReceipt=compactReceipt(receipt);
  out.creationTx=compactTx(await rpc(endpoint,"eth_getTransactionByHash",[event.transactionHash]));
  out.canonicalBlock=await rpc(endpoint,"eth_getBlockByNumber",[event.blockNumber,false]).then(b=>b?{number:b.number,hash:b.hash}:null);
  const code=await rpc(endpoint,"eth_getCode",[registry,event.blockNumber]);
  out.registryRuntimeKeccak256=codeHash(code);
  out.registryRuntimeBytes=Math.max(0,(code.length-2)/2);
  const getters=["sourceChainId()","sourceDomain()","factory()","governanceRegistry()","sourceFeeNonce()","validatorFeeWei()"];
  out.registryGetters={};
  for(const k of getters){
   try{out.registryGetters[k]=await rpc(endpoint,"eth_call",[{to:registry,data:selector(k)},"latest"])}
   catch(e){out.registryGetters[k]="ERROR "+String(e.message).slice(0,160)}
  }
  out.factoryInitialFee=await rpc(endpoint,"eth_call",[{to:FACTORY,data:selector("initialSourceFeeWei()")},"latest"]);
 }
 console.log("XITA_REGISTRY_EVIDENCE="+JSON.stringify(out));
});
