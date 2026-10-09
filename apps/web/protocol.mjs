import {keccak256, selector} from "./keccak.mjs";

const ZERO = "0x" + "0".repeat(40);
const ADDRESS = /^0x[a-f0-9]{40}$/i;
const BYTES32 = /^0x[a-f0-9]{64}$/i;
const MAX = (1n << 256n) - 1n;
export function isAddress(value) { return typeof value === "string" && ADDRESS.test(value) && value.toLowerCase() !== ZERO; }
export function isBytes32(value) { return typeof value === "string" && BYTES32.test(value) && !/^0x0{64}$/i.test(value); }
export function word(value) {
  const n = BigInt(value);
  if (n < 0n || n > MAX) throw new Error("Invalid uint256");
  return n.toString(16).padStart(64,"0");
}
export function addressWord(value) {
  if (!isAddress(value)) throw new Error("Invalid wallet/contract address");
  return value.slice(2).toLowerCase().padStart(64,"0");
}
export function bytes32Word(value) {
  if (!isBytes32(value)) throw new Error("Invalid message or route ID");
  return value.slice(2).toLowerCase();
}
export function calldata(signature, args) {
  return selector(signature) + args.join("");
}
export function readWord(data, index) {
  if (typeof data !== "string" || !/^0x([0-9a-f]{64})*$/i.test(data)) {
    throw new Error("Invalid ABI return data");
  }
  const start = 2 + index * 64;
  const value = data.slice(start,start+64);
  if (value.length !== 64) throw new Error("Incomplete ABI return data");
  return value.toLowerCase();
}
export function readUint(data, index) { return BigInt("0x" + readWord(data,index)); }
export function readAddress(data, index) { return "0x" + readWord(data,index).slice(24); }
export function parseUnits(raw, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Unsupported token decimals");
  const input = String(raw).trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(input)) throw new Error("Enter a positive amount using a dot as decimal separator");
  const [whole, fractional=""] = input.split(".");
  if (fractional.length > decimals) throw new Error("Too many decimal places");
  const n = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fractional.padEnd(decimals,"0") || "0"));
  if (n === 0n || n > MAX) throw new Error("Amount must be greater than zero and within uint256");
  return n;
}
export function formatUnits(raw, decimals=18, precision=6) {
  const n = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = (n / base).toString();
  const part = (n % base).toString().padStart(decimals,"0").slice(0,precision).replace(/0+$/,"");
  return whole + (part ? "."+part : "");
}
export const hexValue = n => "0x"+BigInt(n).toString(16);
export const shorten = addr => addr ? addr.slice(0,6) + "..." + addr.slice(-4) : "";

export function manifestRoute(catalog, asset, routeName) {
  const route = asset.routes.routes.find(r=>r.name===routeName);
  if(!route) throw new Error("Unknown asset route");
  const deployed = asset.deployment.ilnV314.routes.find(r=>r.name===routeName);
  const src = catalog.chains[route.sourceChain], dst = catalog.chains[route.destinationChain];
  const srcInfra = catalog.infrastructure[route.sourceChain], dstInfra = catalog.infrastructure[route.destinationChain];
  if(!src || !dst || !srcInfra || !dstInfra || !deployed) throw new Error("Incomplete route inventory");
  const allowed =
    route.activation === "quorum-activated" &&
    asset.deployment.ilnV314.status === "active" &&
    isBytes32(route.routeId) && isAddress(deployed.gateway) &&
    isAddress(deployed.warpRouter) && isAddress(deployed.feeVault) &&
    deployed.routeId?.toLowerCase() === route.routeId?.toLowerCase() &&
    isBytes32(deployed.governanceTx) &&
    srcInfra.ilnV314.status === "verified-deployed" &&
    dstInfra.ilnV314.status === "verified-deployed" &&
    isAddress(srcInfra.ilnV314.sourceRegistry) &&
    isAddress(dstInfra.hyperlaneCore.mailbox);
  return {route,deployed,src,dst,srcInfra,dstInfra,allowed};
}
export async function rpc(provider, method, params=[]) {
  if (!provider || typeof provider.request !== "function") throw new Error("An EVM wallet is required");
  return provider.request({method,params});
}
export async function connectWallet(provider) {
  const accounts = await rpc(provider,"eth_requestAccounts",[]);
  const account = accounts?.find(isAddress);
  if (!account) throw new Error("No EVM account was authorized");
  return account;
}
export async function switchChain(provider, chain) {
  const target = hexValue(chain.chainId);
  const current = await rpc(provider,"eth_chainId");
  if (BigInt(current) === BigInt(chain.chainId)) return;
  try {
    await rpc(provider,"wallet_switchEthereumChain",[{chainId:target}]);
  } catch (error) {
    if (Number(error?.code) !== 4902) throw error;
    await rpc(provider,"wallet_addEthereumChain",[{
      chainId:target,
      chainName:chain.name === "xgrchain" ? "XGRChain" : chain.name,
      nativeCurrency:chain.nativeCurrency,
      rpcUrls:chain.rpcUrls,
      ...(chain.explorer ? {blockExplorerUrls:[chain.explorer]} : {})
    }]);
    await rpc(provider,"wallet_switchEthereumChain",[{chainId:target}]);
  }
  const actual=await rpc(provider,"eth_chainId");
  if(BigInt(actual)!==BigInt(chain.chainId)) throw new Error("Wallet is on the wrong chain");
}
async function ethCall(provider,to,data) {
  return rpc(provider,"eth_call",[{to,data},"latest"]);
}
async function hasCode(provider,address) {
  const code = await rpc(provider,"eth_getCode",[address,"latest"]);
  return !!code && code !== "0x" && code !== "0x0";
}
export async function verifyActiveRoute(provider, inventory) {
  if(!inventory.allowed) throw new Error("This XETA route is not validator-activated and verified");
  const {route,deployed,src,srcInfra} = inventory;
  const registry=srcInfra.ilnV314.sourceRegistry;
  if(BigInt(await rpc(provider,"eth_chainId")) !== BigInt(src.chainId)) throw new Error("Switch to the source chain first");
  if(!(await hasCode(provider,registry)) || !(await hasCode(provider,deployed.gateway))) throw new Error("Verified route contracts are absent on the source chain");
  const info=await ethCall(provider,registry,calldata("getRoute(uint32,bytes32)",[word(inventory.dst.domainId),bytes32Word(route.routeId)]));
  const current={
    sourceChainId:readUint(info,0), sourceDomain:readUint(info,1),
    gateway:readAddress(info,2), sourceRouter:readAddress(info,3),
    mailbox:readAddress(info,4), merkleTreeHook:readAddress(info,5),
    destinationRouter:readAddress(info,6), validatorFeeWei:readUint(info,7),
    enabled:readUint(info,8)===1n
  };
  if(!current.enabled || current.sourceChainId!==BigInt(src.chainId) ||
    current.sourceDomain!==BigInt(src.domainId) ||
    current.gateway.toLowerCase()!==deployed.gateway.toLowerCase() ||
    current.sourceRouter.toLowerCase()!==deployed.warpRouter.toLowerCase() ||
    current.mailbox.toLowerCase()!==srcInfra.hyperlaneCore.mailbox.toLowerCase() ||
    current.merkleTreeHook.toLowerCase()!==srcInfra.hyperlaneCore.merkleTreeHook.toLowerCase() ||
    current.validatorFeeWei <= 0n || !isAddress(current.destinationRouter)) {
    throw new Error("On-chain validator-governed route differs from verified XETA inventory");
  }
  const destRouter=await ethCall(provider,deployed.gateway,calldata("destinationRouter()",[]));
  if(readAddress(destRouter,0).toLowerCase()!==current.destinationRouter.toLowerCase()) throw new Error("Gateway destination binding disagrees with canonical registry");
  const gatewayRoute=await ethCall(provider,deployed.gateway,calldata("routeId()",[]));
  if(("0x"+readWord(gatewayRoute,0)).toLowerCase() !== route.routeId.toLowerCase()) throw new Error("Gateway route identity mismatch");
  return current;
}
export async function quoteBridge(provider, inventory, account, rawAmount, decimals) {
  const amount=parseUnits(rawAmount,decimals);
  await verifyActiveRoute(provider,inventory);
  const recipient = addressWord(account);
  const result = await ethCall(provider,inventory.deployed.gateway,calldata(
    "quoteILN(uint32,bytes32,uint256)",[word(inventory.dst.domainId),recipient,word(amount)]
  ));
  const quote = {
    amount, validatorFeeWei:readUint(result,0),
    routerNativeValueWei:readUint(result,1),
    totalNativeValueWei:readUint(result,2),
    tokenAmount:readUint(result,3)
  };
  if(quote.validatorFeeWei===0n || quote.totalNativeValueWei!==quote.validatorFeeWei+quote.routerNativeValueWei) {
    throw new Error("Inconsistent gateway fee quote");
  }
  const tok=await ethCall(provider,inventory.deployed.gateway,calldata("warpToken()",[]));
  quote.token = readAddress(tok,0);
  const native=inventory.route.sourceChain === inventory.assetCanonicalChain;
  if(native && (quote.token.toLowerCase()!==ZERO || quote.tokenAmount!==0n || quote.routerNativeValueWei<amount)) {
    throw new Error("Native source quote does not match the expected custody model");
  }
  if(!native && (quote.token.toLowerCase()===ZERO || quote.tokenAmount!==amount)) {
    throw new Error("Synthetic/collateral source quote does not match ERC-20 bridging");
  }
  return quote;
}
export async function readAllowance(provider, token, owner, gateway) {
  const r=await ethCall(provider,token,calldata("allowance(address,address)",[addressWord(owner),addressWord(gateway)]));
  return readUint(r,0);
}
export async function approveAmount(provider,token,gateway,amount,account) {
  return rpc(provider,"eth_sendTransaction",[{
    from:account,to:token,data:calldata("approve(address,uint256)",[addressWord(gateway),word(amount)]),value:"0x0"
  }]);
}
export async function sendBridge(provider,inventory,account,quote) {
  return rpc(provider,"eth_sendTransaction",[{
    from:account,to:inventory.deployed.gateway,
    data:calldata("bridge(uint32,bytes32,uint256)",[word(inventory.dst.domainId),addressWord(account),word(quote.amount)]),
    value:hexValue(quote.totalNativeValueWei)
  }]);
}
export async function waitReceipt(provider,txHash,attempts=50) {
  if(!isBytes32(txHash)) throw new Error("Invalid transaction hash");
  for(let attempt=0;attempt<attempts;attempt++) {
    const receipt=await rpc(provider,"eth_getTransactionReceipt",[txHash]);
    if(receipt) {
      if(BigInt(receipt.status)!==1n) throw new Error("Transaction reverted");
      return receipt;
    }
    await new Promise(resolve=>setTimeout(resolve,2500));
  }
  throw new Error("Transaction submitted but confirmation is still pending. Check the transaction in an explorer.");
}
export function messageIdFromReceipt(receipt,inventory) {
  const event=keccak256("ILNOperation(bytes32,bytes32,uint32,uint256)").toLowerCase();
  const match=(receipt.logs||[]).find(l=>
    l.address?.toLowerCase()===inventory.deployed.gateway.toLowerCase() &&
    l.topics?.[0]?.toLowerCase()===event &&
    l.topics?.[1]?.toLowerCase()===inventory.route.routeId.toLowerCase() &&
    BigInt(l.topics?.[3]||0)===BigInt(inventory.dst.domainId)
  );
  if(!match || !isBytes32(match.topics[2])) throw new Error("Source confirmed, but the ILN message ID could not be verified from its receipt");
  return match.topics[2];
}
export async function isDelivered(provider,inventory,messageId) {
  if(!isBytes32(messageId)) throw new Error("Invalid message ID");
  if(BigInt(await rpc(provider,"eth_chainId"))!==BigInt(inventory.dst.chainId)) throw new Error("Switch wallet to destination chain");
  const mailbox=inventory.dstInfra.hyperlaneCore.mailbox;
  if(!isAddress(mailbox) || !(await hasCode(provider,mailbox))) throw new Error("Destination Mailbox not verified");
  const data=await ethCall(provider,mailbox,calldata("delivered(bytes32)",[bytes32Word(messageId)]));
  return readUint(data,0)===1n;
}
