// Verified MetaMask executor observed on Base and Arbitrum.
// This helper does not establish transaction provenance by itself; factory
// events, outer sender, calldata, runtime and receipt are checked separately.
export const METAMASK_WALLET_EXECUTOR="0xdb9b1e94b5b69df7e401ddbede43491141047db3";
const observedChains=new Set([8453,42161]);
const same=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
export function isObservedWalletExecutor(chainId,address){
 return observedChains.has(Number(chainId))&&same(address,METAMASK_WALLET_EXECUTOR);
}
export function isVerifiedRouterCreator(chainId,creator,wallet){
 return same(creator,wallet)||isObservedWalletExecutor(chainId,creator);
}
