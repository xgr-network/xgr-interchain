// Finality-aware, read-only XITA route observer. This produces EVENT FACTS ONLY.
// Neither raw logs nor wrapped supply attest escrow principal, market TVL or
// successful end-to-end delivery. Verified metrics remain unavailable until
// a separate receipt/codehash-bound custody and journey verifier exists.
const SHA=/^0x[a-f0-9]{64}$/i,ADDRESS=/^0x[a-f0-9]{40}$/i;
const UINT=/^0x[0-9a-f]+$/i;
const MAX_RANGE=500;
const integer=(x)=>Number.isSafeInteger(x)&&x>=0;
const hex=n=>"0x"+n.toString(16);
const safe=v=>typeof v==="string"&&UINT.test(v);
export function finalizedWindow({latest,confirmations,fromBlock,limit=MAX_RANGE}){
 if(!integer(latest)||!integer(confirmations)||!integer(fromBlock))throw Error("Invalid block numbers");
 const target=latest-confirmations;
 if(target<fromBlock)return null;
 const span=Math.max(1,Math.min(MAX_RANGE,integer(limit)?limit:MAX_RANGE));
 return {fromBlock,toBlock:Math.min(target,fromBlock+span-1),finalizedHead:target};
}
export function verifyLog(log,{address,fromBlock,toBlock,topic0}){
 if(!ADDRESS.test(address)||!SHA.test(topic0))throw Error("Invalid trusted route config");
 if(!log||String(log.address||"").toLowerCase()!==address.toLowerCase()||
  !safe(log.blockNumber)||!SHA.test(log.blockHash||"")||
  !SHA.test(log.transactionHash||"")||
  !safe(log.logIndex)||log.removed===true||!Array.isArray(log.topics)||
  String(log.topics[0]||"").toLowerCase()!==topic0.toLowerCase()||
  !Number.isSafeInteger(Number(BigInt(log.blockNumber)))||
  Number(BigInt(log.blockNumber))<fromBlock||Number(BigInt(log.blockNumber))>toBlock)
  throw Error("Untrusted or out-of-range event");
 return {id:log.transactionHash.toLowerCase()+":"+log.logIndex.toLowerCase(),
  chainAddress:address.toLowerCase(),blockNumber:Number(BigInt(log.blockNumber)),
  blockHash:log.blockHash.toLowerCase(),txHash:log.transactionHash.toLowerCase(),
  logIndex:Number(BigInt(log.logIndex)),topics:log.topics.map(t=>t.toLowerCase()),data:log.data};
}
export function canonicalEvents(events,{fromBlock,toBlock,blockHashes}){
 if(!integer(fromBlock)||!integer(toBlock)||toBlock<fromBlock)throw Error("Invalid scanned range");
 const hashes=new Map(blockHashes.map(x=>[x.number,x.hash.toLowerCase()]));
 if(hashes.size!==toBlock-fromBlock+1)throw Error("Incomplete canonical block coverage");
 for(let n=fromBlock;n<=toBlock;n++)if(!SHA.test(hashes.get(n)||""))throw Error("Missing block hash");
 const ids=new Set;
 for(const item of events){
  if(ids.has(item.id))throw Error("Duplicate event identity");
  ids.add(item.id);
  if(hashes.get(item.blockNumber)!==item.blockHash)throw Error("Orphaned event");
 }
 return events.sort((a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex);
}
export async function readConfirmedLogs({rpc,contract,topic0,fromBlock,confirmations=12,limit=100}){
 if(typeof rpc!=="function"||!ADDRESS.test(contract)||!SHA.test(topic0))
  throw Error("Unverified read-only route input");
 async function call(method,params){
  const answer=await rpc(method,params);
  if(answer?.error||answer?.result===undefined)throw Error("RPC read failed: "+method);
  return answer.result;
 }
 const headHex=await call("eth_blockNumber",[]);
 if(!safe(headHex))throw Error("Invalid chain head");
 const head=Number(BigInt(headHex));
 const window=finalizedWindow({latest:head,confirmations,fromBlock,limit});
 if(!window)return null;
 const logs=await call("eth_getLogs",[{address:contract,topics:[topic0],fromBlock:hex(window.fromBlock),toBlock:hex(window.toBlock)}]);
 if(!Array.isArray(logs))throw Error("Invalid RPC logs");
 const observed=logs.map(log=>verifyLog(log,{address:contract,topic0,fromBlock:window.fromBlock,toBlock:window.toBlock}));
 const hashes=[];
 for(let n=window.fromBlock;n<=window.toBlock;n++){
  const block=await call("eth_getBlockByNumber",[hex(n),false]);
  if(!block||!SHA.test(block.hash||"")||Number(BigInt(block.number))!==n)throw Error("Noncanonical scanned block");
  hashes.push({number:n,hash:block.hash});
 }
 return {window,events:canonicalEvents(observed,{...window,blockHashes:hashes}),
  blockHashes:hashes};
}
