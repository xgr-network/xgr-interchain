// Optional EIP-747 wallet token import. A button NEVER creates a transfer,
// asks for account access, or trusts an address supplied in the DOM.
import {verifiedSyntheticContract} from "./token-inventory.js";

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const SYMBOL=/^[A-Za-z0-9_$+.\-]{1,11}$/;
const MAX_CHAIN=Number.MAX_SAFE_INTEGER;

export function metaMaskTokenSpec(model,assetId,chainKey){
 const asset=model?.assets?.find(a=>a.id===assetId);
 const rep=asset?.representations?.find(r=>r.chain===chainKey);
 const chain=model?.chains?.find(c=>c.key===chainKey);
 const decimals=model?.tokenDecimals?.[assetId];
 if(rep?.representation!=="synthetic"||!Number.isSafeInteger(chain?.chainId)||
    chain.chainId<=0||chain.chainId>MAX_CHAIN||
    !Number.isInteger(decimals)||decimals<0||decimals>36||
    !SYMBOL.test(rep.symbol||""))return null;
 const address=verifiedSyntheticContract(model.deployments,assetId,rep);
 if(!ADDRESS.test(address||"")||/^0x0{40}$/i.test(address))return null;
 return {chainId:"0x"+chain.chainId.toString(16),address,symbol:rep.symbol,decimals,
  chainName:chain.label||chain.key};
}

export function injectedMetaMask(injected){
 if(Array.isArray(injected?.providers)){
  const found=injected.providers.find(p=>p?.isMetaMask===true&&typeof p.request==="function");
  if(found)return found;
 }
 return injected?.isMetaMask===true&&typeof injected.request==="function"?injected:null;
}

export async function requestMetaMaskToken(provider,spec){
 if(!provider?.request||!spec||!/^0x[1-9a-f][0-9a-f]*$/i.test(spec.chainId||"")||
    !ADDRESS.test(spec.address||"")||/^0x0{40}$/i.test(spec.address)||
    !SYMBOL.test(spec.symbol||"")||!Number.isInteger(spec.decimals)||
    spec.decimals<0||spec.decimals>36)
   throw Error("Invalid verified token parameters");
 const selected=await provider.request({method:"eth_chainId"});
 if(typeof selected!=="string"||!/^0x[0-9a-f]+$/i.test(selected))
   throw Error("MetaMask network cannot be verified");
 if(BigInt(selected)!==BigInt(spec.chainId)){
  await provider.request({method:"wallet_switchEthereumChain",
   params:[{chainId:spec.chainId}]});
  const switched=await provider.request({method:"eth_chainId"});
  if(typeof switched!=="string"||!/^0x[0-9a-f]+$/i.test(switched)||
     BigInt(switched)!==BigInt(spec.chainId))
   throw Error("MetaMask is still on a different network");
 }
 // MetaMask itself asks the user to confirm this request. No signing, token
 // approval, gas payment or transaction occurs.
 return (await provider.request({method:"wallet_watchAsset",params:{
  type:"ERC20",options:{address:spec.address,symbol:spec.symbol,decimals:spec.decimals}
 }}))===true;
}

export function metaMaskFailure(error){
 const code=Number(error?.code);
 if(code===4001)return "Cancelled in MetaMask. No token was added.";
 if(code===4902)return "Network not configured in MetaMask. Add the network first, then retry.";
 if(code===-32002)return "A MetaMask request is already open. Complete it and retry.";
 if(String(error?.message||"").includes("different network"))
  return "Wrong MetaMask network. Switch to the token network and retry.";
 return "MetaMask could not add the token. Check your wallet and retry.";
}
