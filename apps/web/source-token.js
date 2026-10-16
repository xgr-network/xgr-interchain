// Verify the actual token address against BOTH the canonical source Router
// and its bound Gateway. Collateral Router != ERC-20 underlying.
// No user-supplied RPC URL or per-token environment variable is needed.
import {selector} from "./keccak.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const ZERO="0x"+"0".repeat(40);
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
function decodeAddress(raw){
 if(typeof raw!=="string"||!/^0x[0-9a-f]{64}$/i.test(raw)||
   BigInt(raw)>>160n!==0n)throw Error("Malformed canonical token address");
 return "0x"+raw.slice(-40).toLowerCase();
}
export async function verifiedSourceToken(route,call){
 if(!ADDRESS.test(route?.sourceRouter||"")||!ADDRESS.test(route?.gateway||"")||
   !["nativeRouter","syntheticRouter","collateralRouter"].includes(route.sourceRouterType)||
   typeof call!=="function")throw Error("Invalid source route representation");
 const [router, gateway]=await Promise.all([
  call(route.sourceRouter,selector("token()")),
  call(route.gateway,selector("warpToken()"))
 ]);
 const token=decodeAddress(router),locked=decodeAddress(gateway);
 if(!same(token,locked))throw Error("Source Router and Gateway token bindings differ");
 if(route.sourceRouterType==="nativeRouter"){
  if(!same(token,ZERO))throw Error("Native Router must use native source asset");
  return null;
 }
 if(same(token,ZERO))throw Error("ERC-20 Router has no source token");
 if(route.sourceRouterType==="syntheticRouter"&&!same(token,route.sourceRouter))
  throw Error("Synthetic token is not the represented Router");
 if(route.sourceRouterType==="collateralRouter"&&same(token,route.sourceRouter))
  throw Error("Collateral Router cannot be used as its own underlying");
 return token;
}
