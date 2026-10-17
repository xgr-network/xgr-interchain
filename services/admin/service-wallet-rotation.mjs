import {selector} from "./keccak.mjs";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
export function rotationCalldata(next){
 if(!ADDRESS.test(next||"")||/^0x0{40}$/i.test(next))throw Error("Invalid wallet address");
 return selector("setServiceWallet(address)")+next.slice(2).toLowerCase().padStart(64,"0");
}
export function verifyOnChainWallets({admin,service,recovery,recipient,signer,next}){
 const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
 if(!same(admin,recovery)||!same(service,recipient)||!same(service,signer)||
    !ADDRESS.test(next||"")||/^0x0{40}$/i.test(next)||same(next,admin)||same(next,service))
  throw Error("Independent recovery administrator required for one service wallet");
 return true;
}
