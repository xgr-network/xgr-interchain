// Wallet balance display is always a fresh read of XGR/native or ERC-20
// balanceOf on the canonical deployed router; it is not transfer bookkeeping.
import {selector} from "./keccak.js";
import {deployedRoutes} from "./route-availability.js";
import {publicRead} from "./wallet-transfers.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const QTY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
export async function readWalletTokenBalances({catalog,account,rpc=publicRead,chains=null}){
 if(!ADDRESS.test(account||""))throw Error("Connect a valid wallet");
 const routes=deployedRoutes(catalog);
 const byAsset=new Map();
 const filter=chains===null?null:new Set(chains);
 for(const route of routes){
  if(filter&&!filter.has(route.source))continue;
  const key=route.asset+":"+route.source;
  if(!byAsset.has(key))byAsset.set(key,route);
 }
 const results=await Promise.all([...byAsset].map(async ([key,route])=>{
  const chain=catalog.chains[route.source],metadata=catalog.assets?.[route.asset]?.metadata,
   decimals=metadata?.decimals;
  const representations=metadata?.representations?.filter(rep=>rep.chain===route.source)||[];
  const representation=representations.length===1?representations[0]:null;
  const symbol=representation?.symbol;
  const address=representation?.representation==="collateral"?representation.assetAddress:
   representation?.representation==="synthetic"?route.sourceRouter:null;
  // A verified source route is required. Do not label a collateral balance as
  // wrapped or query a router instead of the original asset contract.
  const identityValid=representation&&typeof symbol==="string"&&symbol.length>0&&
   (representation.representation==="native"?route.sourceToken===null:
    representation.representation==="collateral"||representation.representation==="synthetic"?
     ADDRESS.test(address||"")&&route.sourceToken?.toLowerCase()===address.toLowerCase():false);
  if(!chain||!Number.isInteger(decimals)||decimals<0||decimals>36||!identityValid)
   return [key,{status:"unavailable",chain:route.source}];
  try{
   const url=chain.rpcUrls?.[0];
   const id=await rpc(url,"eth_chainId",[]);
   if(!QTY.test(id||"")||BigInt(id)!==BigInt(chain.chainId))throw Error("RPC mismatch");
   let raw;
   if(route.sourceToken){
    raw=await rpc(url,"eth_call",[{to:route.sourceToken,
     data:selector("balanceOf(address)")+account.slice(2).toLowerCase().padStart(64,"0")},"latest"]);
    if(!/^0x[0-9a-f]{64}$/i.test(raw||""))throw Error("Invalid balance");
   }else{
    raw=await rpc(url,"eth_getBalance",[account,"latest"]);
    if(!QTY.test(raw||""))throw Error("Invalid native balance");
   }
   return [key,{status:"ready",balanceRaw:BigInt(raw).toString(),decimals,
    symbol,chain:route.source,representation:representation.representation}];
  }catch{return [key,{status:"unavailable",chain:route.source}]}
 }));
 return Object.fromEntries(results);
}
