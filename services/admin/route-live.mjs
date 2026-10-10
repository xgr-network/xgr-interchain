// Read live activation from the chain; receipts only prove deployment,
// never that validators authorized a usable route.
import {selector} from "../../apps/web/keccak.mjs";
import {encodeAbi} from "./abi-encoder.mjs";
const ADDR=/^0x[0-9a-f]{40}$/i,H32=/^0x[0-9a-f]{64}$/i;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const address=word=>"0x"+BigInt("0x"+word).toString(16).padStart(40,"0");
export async function checkLiveActivation(task,chain,infrastructure,rpc){
 if(task.kind!=="activation"||!H32.test(task.routeId||"")||
    !ADDR.test(task.gateway||"")||!ADDR.test(task.router||""))
  throw Error("Missing canonical Gateway and Router for live route");
 const registry=infrastructure.components.find(x=>x.key==="sourceRegistry")?.address;
 if(!ADDR.test(registry||""))throw Error("Documented source Registry missing");
 const url=chain.rpcUrls[0];
 const chainId=await rpc(url,"eth_chainId",[]);
 if(typeof chainId!=="string"||!/^0x[0-9a-f]+$/i.test(chainId))
  throw Error("Malformed RPC chain identity response");
 if(BigInt(chainId)!==BigInt(chain.chainId))throw Error("Route RPC chain identity mismatch");
 const calldata=selector("getRoute(uint32,bytes32)")+
   encodeAbi(["uint32","bytes32"],[task.destinationDomain,task.routeId]).slice(2);
 const data=await rpc(url,"eth_call",[{to:registry,data:calldata},"latest"]);
 if(!/^0x[0-9a-f]{576}$/i.test(data||""))throw Error("Malformed on-chain route getter");
 const words=Array.from({length:9},(_,i)=>data.slice(2+i*64,2+(i+1)*64));
 if(!eq(address(words[2]),task.gateway)||!eq(address(words[3]),task.router)||
    BigInt("0x"+words[0])!==BigInt(chain.chainId))
  throw Error("Live route identity differs from receipt-bound deployment");
 const enabled=BigInt("0x"+words[8])===1n;
 const fee=BigInt("0x"+words[7]);
 if(enabled&&fee===0n)throw Error("Enabled route has invalid zero live validator fee");
 return {enabled,feeWei:fee.toString(),registry};
}
export async function pendingLiveRouteTasks(tasks,chains,infrastructures,rpc){
 const c=new Map(chains.map(x=>[x.name,x]));
 const i=new Map(infrastructures.map(x=>[x.name,x]));
 const results=await Promise.all(tasks.map(async task=>{
  if(task.kind!=="activation")return task;
  try{
   const verified=await checkLiveActivation(task,c.get(task.chain),i.get(task.chain),rpc);
   return verified.enabled?null:{...task,status:"requires-validator-quorum",liveChecked:true};
  }catch(e){
   return {...task,status:"activation-state-unverified",liveChecked:false,
    blockers:["Live-Status unklar: "+String(e.message).slice(0,180)]};
  }
 }));
 return results.filter(Boolean);
}
