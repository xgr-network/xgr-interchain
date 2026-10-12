// Read-only XITA chain infrastructure state. A configured contract address
// or Hyperlane core address does NOT prove new XITA infrastructure deployed.
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {rpcCall} from "./inspector.mjs";
import {loadChainDeployment} from "../../tools/manifest-layout.mjs";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const CODE=/^0x(?:[a-f0-9]{2})+$/i;
const executableParts=["validatorRegistry","ism","transportBundle","nativeRouterDeployer","syntheticRouterDeployer","collateralRouterDeployer","factory","sourceRegistry"];
function load(root,path){return JSON.parse(readFileSync(join(root,path),"utf8"))}
export function infrastructureInventory(root,chains) {
 return chains.map(c=>{
  const observed=loadChainDeployment(root,c);
  if(observed.chain!==c.name||observed.chainId!==c.chainId||observed.domainId!==c.domainId)
   throw Error("Chain infrastructure manifest mismatch: "+c.name);
  const verified=(observed.xitaV315?.components)||{};
  const valid=key=>{const item=verified[key];return Boolean(item&&ADDRESS.test(item.address||"")&&
     /^0x[a-f0-9]{64}$/i.test(item.runtimeCodeKeccak256||"")&&
     typeof item.receiptPath==="string"&&item.receiptPath.startsWith("deployments/receipts/"+c.name+"/"));};
  const freshTransport=["transportBundle","mailbox","merkleTreeHook","requiredHook"].every(valid);
  // No historical mailbox/hook or config-supplied address counts as deployment proof.
  const core=freshTransport?{mailbox:verified.mailbox.address,merkleTreeHook:verified.merkleTreeHook.address,
   requiredHook:verified.requiredHook.address,transportBundle:verified.transportBundle.address}:{};
  if(!["compressed","eip2537"].includes(c.blsVerifierFormat))
   throw Error("Unsupported configured verifier format: "+c.name);
  const requiredParts=c.blsVerifierFormat==="compressed"?executableParts:["blsVerifier",...executableParts];
  const components=requiredParts.map(key=>{
   const ready=valid(key)&&(key!=="transportBundle"||freshTransport);
   return {key,address:ready?verified[key].address:null,status:ready?"documented":"not-deployed"};
  });
  const count=components.filter(x=>x.status==="documented").length;
  return {name:c.name,chainId:c.chainId,domainId:c.domainId,
   nativeCurrency:c.nativeCurrency,rpcUrls:c.rpcUrls,explorer:c.explorer||null,
   status:count===requiredParts.length?"documented":count?"partial":"not-deployed",
   documented:count,required:requiredParts.length,components,
   hyperlane:{mailbox:core.mailbox||null,merkleTreeHook:core.merkleTreeHook||null,
    requiredHook:core.requiredHook||null,transportBundle:core.transportBundle||null}};
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
   // Fresh transport requires new on-chain deployment evidence; no historical fallback.
   for(const part of c.components){
    if(!part.address){result.components.push({...part,live:false});continue}
    const code=await rpc(url,"eth_getCode",[part.address,"latest"]);
    result.components.push({...part,live:CODE.test(code||"")});
   }
   const core=c.hyperlane;
   if(core.mailbox&&core.merkleTreeHook&&core.requiredHook){
    const values=await Promise.all([core.mailbox,core.merkleTreeHook,core.requiredHook].map(addr=>rpc(url,"eth_getCode",[addr,"latest"])));
    result.core=values.every(code=>CODE.test(code||""));
   }
   const documented=result.components.filter(x=>x.status==="documented");
   result.status=documented.length===c.required&&documented.every(x=>x.live)&&result.core?"observed-complete":
     documented.some(x=>x.live)?"observed-partial":"not-deployed";
  }catch(e){result.error=String(e.message).slice(0,150)}
  return result;
 }));
}
