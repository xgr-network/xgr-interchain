// Wallet balance display is always a fresh read of XGR/native or ERC-20
// balanceOf on the canonical deployed router; it is not transfer bookkeeping.
import {selector} from "./keccak.js";
import {deployedRoutes} from "./route-availability.js";
import {verifiedSourceToken} from "./source-token.js";
import {publicRead} from "./wallet-transfers.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const QTY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
export async function readWalletTokenBalances({catalog,account,rpc=publicRead}){
 if(!ADDRESS.test(account||""))throw Error("Connect a valid wallet");
 const routes=deployedRoutes(catalog);
 const byAsset=new Map();
 for(const route of routes){
  const key=route.asset+":"+route.source;
  if(!byAsset.has(key))byAsset.set(key,route);
 }
 const results=await Promise.all([...byAsset].map(async ([key,route])=>{
  const chain=catalog.chains[route.source],decimals=catalog.assets[route.asset].metadata.decimals;
  if(!chain||!Number.isInteger(decimals)||decimals<0||decimals>36)
   return [key,{status:"unavailable"}];
  try{
   const url=chain.rpcUrls?.[0];
   const id=await rpc(url,"eth_chainId",[]);
   if(!QTY.test(id||"")||BigInt(id)!==BigInt(chain.chainId))throw Error("RPC mismatch");
   const sourceToken=await verifiedSourceToken(route,(to,data)=>
    rpc(url,"eth_call",[{to,data},"latest"]));
   let raw;
   if(sourceToken){
    raw=await rpc(url,"eth_call",[{to:sourceToken,
     data:selector("balanceOf(address)")+account.slice(2).toLowerCase().padStart(64,"0")},"latest"]);
    if(!/^0x[0-9a-f]{64}$/i.test(raw||""))throw Error("Invalid balance");
   }else{
    raw=await rpc(url,"eth_getBalance",[account,"latest"]);
    if(!QTY.test(raw||""))throw Error("Invalid native balance");
   }
   return [key,{status:"ready",balanceRaw:BigInt(raw).toString(),decimals,
    symbol:sourceToken&&route.sourceRouterType==="syntheticRouter"?"w"+route.asset:route.asset,chain:route.source}];
  }catch{return [key,{status:"unavailable",chain:route.source}]}
 }));
 return Object.fromEntries(results);
}
