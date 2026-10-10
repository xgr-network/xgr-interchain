// Wallet-only primitives for the XITA web UI. No legacy bridge contract ABI.
const ADDRESS=/^0x[a-f0-9]{40}$/i;
export function shorten(value){return typeof value==="string"&&value.length>12?value.slice(0,6)+"..."+value.slice(-4):"";}
export function formatUnits(raw,decimals=18,precision=6){
 const n=BigInt(raw),base=10n**BigInt(decimals),whole=(n/base).toString();
 const fractional=(n%base).toString().padStart(decimals,"0").slice(0,precision).replace(/0+$/,"");
 return whole+(fractional?"."+fractional:"");
}
export async function connectWallet(provider){
 if(!provider||typeof provider.request!=="function")throw Error("An EIP-1193 wallet is required");
 const accounts=await provider.request({method:"eth_requestAccounts",params:[]});
 const account=accounts?.find(x=>typeof x==="string"&&ADDRESS.test(x)&&!/^0x0{40}$/i.test(x));
 if(!account)throw Error("No authorized EVM account");
 return account;
}
