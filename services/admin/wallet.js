// Browser-only, EIP-1193 deployment wallet client. The backend NEVER
// receives private keys or wallet transaction signing capabilities.
// WalletConnect SDK-only sessions require a separately configured project ID.
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const known = new Map();
let active = null;
let listeners = [];
let discoveryReady = false;

export function formatNative(wei, decimals = 18, digits = 5) {
  if (typeof wei !== "string" || !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(wei) ||
      !Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new Error("Ungültiges Guthaben");
  const v = BigInt(wei), base = 10n ** BigInt(decimals);
  const whole = v / base;
  const part = (v % base).toString().padStart(decimals, "0")
    .slice(0, Math.max(0, digits)).replace(/0+$/, "");
  return whole.toString() + (part ? "." + part : "");
}

export function walletsAvailable(win = window) {
  if (!discoveryReady) {
    win.addEventListener("eip6963:announceProvider", event => {
      const info = event.detail?.info, provider = event.detail?.provider;
      if (typeof provider?.request === "function" &&
          typeof info?.uuid === "string" && typeof info?.name === "string")
        known.set(info.uuid, {id:info.uuid, name:info.name, provider});
    });
    discoveryReady = true;
  }
  win.dispatchEvent(new Event("eip6963:requestProvider"));
  const injected = win.ethereum;
  if (typeof injected?.request === "function")
    known.set("injected", {id:"injected",name:injected.isMetaMask ? "MetaMask / Browser Wallet" : "Browser Wallet", provider:injected});
  for (const [i, p] of (injected?.providers || []).entries()) {
    if (typeof p?.request === "function")
      known.set("injected-" + i, {id:"injected-" + i,name:p.isMetaMask?"MetaMask":"EVM Wallet "+(i+1),provider:p});
  }
  return [...known.values()].map(({id,name}) => ({id,name}));
}

export function getWalletProvider(id = null) {
  if (id && known.has(id)) return known.get(id).provider;
  if (active) return active;
  if (typeof window !== "undefined" && typeof window.ethereum?.request === "function") return window.ethereum;
  return null;
}

export async function connectDeploymentWallet({providerId = null,onChange = null}={}) {
  walletsAvailable();
  const provider = getWalletProvider(providerId);
  if (!provider) throw Error("Keine EVM-Wallet gefunden. Bitte MetaMask oder eine EIP-1193 Wallet installieren.");
  const accounts = await provider.request({method:"eth_requestAccounts"});
  const address = accounts?.[0];
  if (!ADDRESS.test(address || "")) throw Error("Keine gültige Wallet-Adresse verbunden");
  if (active && active !== provider) for (const item of listeners) {
    active.removeListener?.(item.name,item.fn);
  }
  listeners=[];
  active=provider;
  if (onChange && typeof provider.on === "function") {
    const emit = () => onChange();
    for (const name of ["accountsChanged","chainChanged","disconnect"]) {
      provider.on(name,emit);
      listeners.push({name,fn:emit});
    }
  }
  return {address, chainId:Number(BigInt(await provider.request({method:"eth_chainId"})))};
}

export async function currentWalletState() {
  const provider=getWalletProvider();
  if (!provider) return null;
  const accounts=await provider.request({method:"eth_accounts"});
  if (!ADDRESS.test(accounts?.[0] || "")) return null;
  const chainId=Number(BigInt(await provider.request({method:"eth_chainId"})));
  return {address:accounts[0],chainId};
}

export async function switchDeploymentChain(chain) {
  const provider=getWalletProvider();
  if (!provider) throw Error("Bitte zuerst Wallet verbinden");
  if (!chain || !Number.isSafeInteger(chain.chainId) ||
      !Array.isArray(chain.rpcUrls) ||
      !chain.rpcUrls.some(url=>typeof url==="string"&&url.startsWith("https://")))
    throw Error("Chain ist nicht in GitHub main freigegeben");
  const chainId="0x"+chain.chainId.toString(16);
  try {
    await provider.request({method:"wallet_switchEthereumChain",params:[{chainId}]});
  } catch (e) {
    if (e?.code!==4902 && e?.data?.originalError?.code!==4902) throw e;
    await provider.request({method:"wallet_addEthereumChain",params:[{
      chainId,chainName:chain.name==="xgrchain"?"XGRChain":chain.name,
      nativeCurrency:chain.nativeCurrency,rpcUrls:chain.rpcUrls,
      ...(chain.explorer?{blockExplorerUrls:[chain.explorer]}:{})
    }]});
    await provider.request({method:"wallet_switchEthereumChain",params:[{chainId}]});
  }
  const actual=BigInt(await provider.request({method:"eth_chainId"}));
  if (actual!==BigInt(chain.chainId)) throw Error("Wallet hat nicht auf die ausgewählte Chain gewechselt");
  return Number(actual);
}

export async function balanceOnWalletChain(address) {
  const provider=getWalletProvider();
  if (!provider||!ADDRESS.test(address||"")) throw Error("Wallet nicht verbunden");
  return provider.request({method:"eth_getBalance",params:[address,"latest"]});
}

// Wallet transfers will only be exposed when the reviewed server-side
// main-pinned deployment executor is complete; never accept arbitrary
// browser-authored transaction payloads.

// Explicit wallet signing, never a server-side key or unsourced calldata.
// Caller must compare the transaction to the main-derived prepared intent.
export async function broadcastDeploymentIntent(prepared){
 const provider=getWalletProvider();
 if(!provider)throw Error("Wallet connection required");
 const state=await currentWalletState();
 if(!state||state.chainId!==prepared.chainId)
  throw Error("Switch wallet to selected deployment chain");
 const t=prepared.transaction;
 if(!t||String(t.from).toLowerCase()!==state.address.toLowerCase()||
    typeof t.data!=="string"||!/^0x[0-9a-f]+$/i.test(t.data))
  throw Error("Prepared wallet transaction mismatch");
 const tx={
  from:state.address,data:t.data,value:t.value,gas:t.gas,nonce:t.nonce,
  ...(t.to?{to:t.to}:{})
 };
 const txHash=await provider.request({method:"eth_sendTransaction",params:[tx]});
 if(!/^0x[0-9a-f]{64}$/i.test(txHash||""))
  throw Error("Wallet did not return a valid transaction hash; intent remains locked");
 return txHash;
}
