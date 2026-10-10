// Read-only XITA chain infrastructure state. A configured contract address
// or Hyperlane core address does NOT prove new XITA infrastructure deployed.
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {rpcCall} from "./inspector.mjs";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const CODE=/^0x(?:[a-f0-9]{2})+$/i;
const parts=["blsVerifier","validatorRegistry","ism","factory","sourceRegistry"];
function load(root,path){return JSON.parse(readFileSync(join(root,path),"utf8"))}
export function infrastructureInventory(root,chains) {
 return chains.map(c=>{
  const observed=load(root,c.observedInfrastructure);
  if(observed.chain!==c.name||observed.chainId!==c.chainId||observed.domainId!==c.domainId)
   throw Error("Chain infrastructure manifest mismatch: "+c.name);
  const core=observed.hyperlaneCore||{};
  const verified=(observed.xitaV315?.components)||{};
  const components=parts.map(key=>{
   const item=verified[key],valid=item&&ADDRESS.test(item.address||"")&&
     /^0x[a-f0-9]{64}$/i.test(item.runtimeCodeKeccak256||"")&&
     typeof item.receiptPath==="string" && item.receiptPath.startsWith("deployments/mainnet/receipts/"+c.name+"/");
   return {key,address:valid?item.address:null,status:valid?"documented":"not-deployed"};
  });
  const count=components.filter(x=>x.status==="documented").length;
  return {name:c.name,chainId:c.chainId,domainId:c.domainId,
   nativeCurrency:c.nativeCurrency,rpcUrls:c.rpcUrls,explorer:c.explorer||null,
   status:count===parts.length?"documented":count?"partial":"not-deployed",
   documented:count,required:parts.length,components,
   hyperlane:{mailbox:core.mailbox||null,merkleTreeHook:core.merkleTreeHook||null}};
 });
}
export async function verifyChainInfrastructure(chains,{rpc=rpcCall}={}){
 return Promise.all(chains.map(async c=>{
  const result={name:c.name,chainId:c.chainId,rpc:false,core:false,components:[],status:"unreachable"};
  try{
   const url=c.rpcUrls?.[0];
   const remote=await rpc(url,"eth_chainId",[]);
   if(BigInt(remote)!==BigInt(c.chainId))throw Error("RPC chain mismatch");
   result.rpc=true;
   const addresses=[c.hyperlane.mailbox,c.hyperlane.merkleTreeHook].filter(Boolean);
   const coreCodes=await Promise.all(addresses.map(a=>rpc(url,"eth_getCode",[a,"latest"])));
   result.core=addresses.length===2&&coreCodes.every(code=>CODE.test(code||""));
   for(const part of c.components){
    if(!part.address){result.components.push({...part,live:false});continue}
    const code=await rpc(url,"eth_getCode",[part.address,"latest"]);
    result.components.push({...part,live:CODE.test(code||"")});
   }
   const documented=result.components.filter(x=>x.status==="documented");
   result.status=documented.length===c.required&&documented.every(x=>x.live)&&result.core?"observed-complete":
     documented.some(x=>x.live)?"observed-partial":"not-deployed";
  }catch(e){result.error=String(e.message).slice(0,150)}
  return result;
 }));
}
