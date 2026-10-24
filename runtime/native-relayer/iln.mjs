// Minimal optional Direct-BLS relayer. It watches only confirmed Gateway
// operations, not Hyperlane Merkle trees or historical contract state.
// Default OBSERVE_ONLY: user wallets remain responsible for destination gas.
import {JsonRpcProvider,Wallet,Interface,getAddress} from "ethers";
import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {prepareDirectILN} from "./recover-iln.mjs";
import {ILN_OPERATION_EVENT} from "./xita-direct-codec.mjs";

const required=k=>{if(!process.env[k])throw Error("Missing "+k);return process.env[k]};
const integer=(k,fallback,min=1,max=86400)=>{
 const n=process.env[k]===undefined?fallback:Number(process.env[k]);
 if(!Number.isSafeInteger(n)||n<min||n>max)throw Error("Invalid "+k);
 return n;
};
const hash=/^0x[0-9a-f]{64}$/i;
const source=new JsonRpcProvider(required("ORIGIN_RPC_URL"));
const destination=new JsonRpcProvider(required("DESTINATION_RPC_URL"));
const gateway=getAddress(required("ORIGIN_ILN_GATEWAY"));
const routeId=required("ROUTE_ID").toLowerCase();
const destDomain=integer("DESTINATION_DOMAIN",0,1,4294967295);
const confirmations=integer("ORIGIN_CONFIRMATIONS",1,1,100000);
const chunk=integer("ORIGIN_LOG_CHUNK",10,1,10);
const poll=integer("POLL_INTERVAL_MS",5000,1000,60000);
const startBlock=integer("ORIGIN_START_BLOCK",0,0,Number.MAX_SAFE_INTEGER);
if(!hash.test(routeId)||BigInt(routeId)===0n)throw Error("Invalid direct-BLS route");
const enableSubmission=(process.env.RELAYER_SUBMIT||"false").toLowerCase()==="true";
const wallet=enableSubmission?new Wallet(required("RELAYER_PRIVATE_KEY"),destination):null;
// The legacy RELAYER_STATE_PATH is deliberately NOT reused: it contains
// incompatible Merkle-era state. The file is unique per chain/gateway/route.
const routeStateKey=[String(process.env.ORIGIN_CHAIN_ID),gateway.toLowerCase(),routeId,
 String(process.env.DESTINATION_CHAIN_ID)].join("-");
const file=resolve(process.env.RELAYER_STATE_FILE||
 process.env.ILN_STATE_PATH||"./runtime/runtime-state/direct-"+routeStateKey+".json");
const iface=new Interface([ILN_OPERATION_EVENT]);
const topic=iface.getEvent("ILNOperation").topicHash;
const identity={sourceChainId:String(process.env.ORIGIN_CHAIN_ID),gateway:gateway.toLowerCase(),
 routeId,destinationChainId:String(process.env.DESTINATION_CHAIN_ID)};
const initial=()=>({version:2,identity,cursor:null,pending:{}});
const state=existsSync(file)?JSON.parse(readFileSync(file,"utf8")):initial();
if(state.version!==2||!state.identity||
 Object.keys(identity).some(key=>String(state.identity[key]).toLowerCase()!==String(identity[key]).toLowerCase())||
 typeof state.pending!=="object"||state.pending===null||Array.isArray(state.pending)||
 (state.cursor!==null&&(!Number.isSafeInteger(state.cursor)||state.cursor<0)))
 throw Error("Stale, shared or invalid relayer state; explicit hard reset required");
const save=()=>{
 mkdirSync(dirname(file),{recursive:true,mode:0o770});
 const temp=file+"."+process.pid+".tmp";
 writeFileSync(temp,JSON.stringify(state),{mode:0o600});
 renameSync(temp,file);
};
const observed=new Set();
let busy=false;
async function cycle(){
 if(busy)return;
 busy=true;
 try{
  const head=await source.getBlockNumber();
  const confirmed=head-confirmations;
  if(confirmed<=0)return;
  if(state.cursor===null){
   // Unknown old messages are recoverable from their original Source TX;
   // automatic discovery starts only within short available RPC history.
   state.cursor=startBlock>0?startBlock-1:Math.max(0,confirmed-128);
   save();
  }
  for(let batches=0;batches<15&&state.cursor<confirmed;batches++){
   const from=state.cursor+1,to=Math.min(confirmed,from+chunk-1);
   const logs=await source.getLogs({
    address:gateway,
    topics:[topic,null,null,null],
    fromBlock:from,toBlock:to
   });
   for(const log of logs){
    if(log.removed)throw Error("Unfinalized Gateway event refused");
    const event=iface.parseLog(log);
    if(event?.name!=="ILNOperation"||
       String(event.args.routeId).toLowerCase()!==routeId||
       Number(event.args.destinationDomain)!==destDomain)continue;
    const id=String(event.args.messageId).toLowerCase();
    if(!hash.test(id)||!hash.test(log.transactionHash))throw Error("Invalid Gateway event");
    const seen=state.pending[id];
    if(seen&&seen.sourceTxHash!==log.transactionHash.toLowerCase())
      throw Error("Duplicate Message ID in different source receipts");
    state.pending[id]={sourceTxHash:log.transactionHash.toLowerCase()};
   }
   state.cursor=to;save();
  }

  for(const [id,operation] of Object.entries(state.pending)){
   try{
    const prepared=await prepareDirectILN(id,operation.sourceTxHash);
    if(prepared.status==="ALREADY_DELIVERED"){
     delete state.pending[id];save();continue;
    }
    if(prepared.status!=="READY_UNSIGNED_CALL")continue;
    if(!enableSubmission){
     const key=id+":"+prepared.setId;
     if(!observed.has(key)){
      observed.add(key);
      console.log(JSON.stringify({event:"direct_bls_delivery_ready",
       routeId,messageId:id,destinationChainId:prepared.destinationChainId,
       sourceTxHash:operation.sourceTxHash,mode:"OBSERVE_ONLY"}));
     }
     continue;
    }
    const estimate=await destination.estimateGas({from:wallet.address,to:prepared.to,data:prepared.data,value:0});
    const tx=await wallet.sendTransaction({to:prepared.to,data:prepared.data,value:0,
      gasLimit:estimate+estimate/5n});
    console.log(JSON.stringify({event:"direct_bls_delivery_submitted",messageId:id,txHash:tx.hash}));
    const receipt=await tx.wait();
    if(!receipt||receipt.status!==1)throw Error("Destination process not successful");
    delete state.pending[id];save();
   }catch(error){
    console.warn(JSON.stringify({event:"direct_bls_pending",messageId:id,
     error:String(error?.shortMessage||error?.message||error).slice(0,220)}));
   }
  }
 }finally{busy=false;}
}
async function run(){
 if(BigInt(await source.send("eth_chainId",[]))!==BigInt(required("ORIGIN_CHAIN_ID"))||
    BigInt(await destination.send("eth_chainId",[]))!==BigInt(required("DESTINATION_CHAIN_ID")))
  throw Error("Configured direct relayer chain IDs do not match live RPC");
 console.log(JSON.stringify({event:"direct_bls_relayer_started",routeId,
  mode:enableSubmission?"SUBMIT_EXPLICIT_OPT_IN":"OBSERVE_ONLY"}));
 for(;;){
  try{await cycle()}catch(error){
   console.warn(JSON.stringify({event:"direct_bls_poll_pending",
    error:String(error?.shortMessage||error?.message||error).slice(0,200)}));
  }
  await new Promise(done=>setTimeout(done,poll));
 }
}
run().catch(error=>{console.error(error.message);process.exitCode=1});
