import {verifiedNativeMailboxState} from "../../apps/web/chain-finality.js";
// Pure canonical route identity and wallet/receipt verification helpers.
// Operational foreign-chain scanning and HTTP RPC transports do not belong in XITA.
// The XGR Node read index supplies all background source observations.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {configuredGatewayRoutes,findWalletSourceTx} from "../../apps/web/wallet-transfers.js";
import {selector} from "../../apps/web/keccak.js";
const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const norm=x=>String(x||"").toLowerCase();
const hex=n=>"0x"+BigInt(n).toString(16);
const BRIDGE_SELECTOR=selector("bridge(uint32,bytes32,uint256)");
const DELIVERED_SELECTOR=selector("delivered(bytes32)");
const safeUint=n=>HEX.test(n||"")&&BigInt(n)<=BigInt(Number.MAX_SAFE_INTEGER);
const number=n=>{if(!safeUint(n))throw Error("Unsafe RPC integer");return Number(BigInt(n))};
export function gatewayDeploymentBlock({catalog,route,read=readFileSync,root=ROOT}){
 const deployment=catalog?.assets?.[route.asset]?.deployment?.routeDeployments?.find(r=>
  r.routeName===route.name&&r.sourceChain===route.source&&r.destinationChain===route.destination);
 const path=deployment?.components?.gateway?.receiptPath;
 if(!/^deployments\/receipts\/[a-z0-9-]+\/[a-f0-9]{64}-[a-f0-9]{40}\.json$/.test(path||""))
  throw Error("Missing immutable Gateway deployment receipt");
 const receipt=JSON.parse(read(resolve(root,path),"utf8"));
 if(receipt.kind!=="xita-v315-deployment-receipt"||receipt.component!=="gateway"||
    receipt.chain!==route.source||receipt.routeName!==route.name||
    norm(receipt.address)!==norm(route.gateway)||!safeUint(hex(receipt.blockNumber))||
    norm(receipt.provenance?.routeId)!==norm(route.routeId)||
    receipt.status!=="onchain-deployment-verified")
  throw Error("Gateway receipt does not match deployed route");
 return receipt.blockNumber;
}
export function indexedRoutes(catalog,{blockFor=gatewayDeploymentBlock}={}){
 const recognized=configuredGatewayRoutes(catalog);
 const records=deployedRoutes(catalog);
 return records.map(route=>{
  const source=recognized.find(r=>r.asset===route.asset&&r.routeName===route.name&&
    r.sourceChain===route.source&&r.destinationChain===route.destination);
  if(!source)throw Error("Configured gateway missing for canonical deployed route");
  const deployedBlock=blockFor({catalog,route});
  if(!Number.isSafeInteger(deployedBlock)||deployedBlock<0)throw Error("Unsafe deploy block");
  return {...source,deploymentBlock:deployedBlock,
   name:route.name,asset:route.asset,routeId:norm(route.routeId),
   gateway:norm(route.gateway),destinationMailbox:norm(source.destinationMailbox)};
 });
}
export function bridgeAmountFromTransaction(tx,route){
 if(!tx||!ADDRESS.test(route?.gateway||"")||norm(tx.to)!==norm(route.gateway)||
  !Number.isSafeInteger(route?.destinationConfig?.domainId))return null;
 const data=String(tx.input??tx.data??"").toLowerCase();
 if(!/^0x[0-9a-f]{200}$/.test(data)||!data.startsWith(BRIDGE_SELECTOR))return null;
 const args=data.slice(10);
 const domain=BigInt("0x"+args.slice(0,64)),
  recipient="0x"+args.slice(64,128),amount=BigInt("0x"+args.slice(128,192));
 if(domain!==BigInt(route.destinationConfig.domainId)||amount<=0n||amount>=2n**256n||
  recipient.slice(0,24)!=="0x"+"0".repeat(22))return null;
 return amount.toString();
}
export async function checkedDelivery({route,messageId,rpc}){
 if(!HASH.test(messageId||"")||typeof rpc!=="function")throw Error("Invalid delivery check");
 if(!ADDRESS.test(route.destinationMailbox||""))return {delivered:null,reason:"destination-not-deployed"};
 const id=await rpc(route.destinationConfig,"eth_chainId",[]);
 if(!HEX.test(id||"")||BigInt(id)!==BigInt(route.destinationConfig.chainId))
  throw Error("Destination RPC chain mismatch");
 return verifiedNativeMailboxState(
  (method,args)=>rpc(route.destinationConfig,method,args),
  route.destinationConfig.chainId,route.destinationMailbox,
  DELIVERED_SELECTOR+messageId.slice(2));
}
// Browser recovery may retry any configured source/destination RPC URL.
// A source backup must never silently be treated as the destination.
export function bindVerifiedTransferRpc(route,rpc){
 if(typeof rpc!=="function")throw Error("Missing verified transfer RPC");
 const sources=route?.sourceConfig?.rpcUrls||[];
 const destinations=route?.destinationConfig?.rpcUrls||[];
 return (url,method,params)=>{
  const source=sources.includes(url),destination=destinations.includes(url);
  if(source===destination)throw Error("Unknown or ambiguous chain RPC for verified transfer");
  return rpc(source?route.sourceConfig:route.destinationConfig,method,params);
 };
}
export async function verifiedTransfer({catalog,route,transactionHash,rpc}){
 if(!HASH.test(transactionHash||""))throw Error("Invalid canonical source tx");
 const tx=await rpc(route.sourceConfig,"eth_getTransactionByHash",[transactionHash]);
 if(!ADDRESS.test(tx?.from||""))throw Error("Missing canonical source wallet");
 const evidence=await findWalletSourceTx({catalog,account:tx.from,
  sourceChain:route.sourceChain,txHash:transactionHash,
  rpc:bindVerifiedTransferRpc(route,rpc)});
 if(!evidence.confirmed||!HASH.test(evidence.messageId||"")||
   norm(evidence.routeId)!==norm(route.routeId)||
   norm(evidence.gateway)!==norm(route.gateway)||
   ["source-failed","pending-source","confirming"].includes(evidence.status))
  throw Error("Source operation cannot be indexed before canonical confirmation");
 const delivered=await checkedDelivery({route,messageId:evidence.messageId,rpc})
  .catch(()=>({delivered:null}));
 return {
  sourceChain:route.sourceChain,messageId:norm(evidence.messageId),
  sourceTxHash:norm(transactionHash),
  account:norm(tx.from),asset:route.asset,assetId:norm(route.assetId),
  routeName:route.routeName,routeId:norm(route.routeId),
  gateway:norm(route.gateway),destinationChain:route.destinationChain,
  destinationMailbox:norm(route.destinationMailbox),
  amountRaw:evidence.amountRaw||bridgeAmountFromTransaction(tx,route),
  validatorFeeWei:evidence.validatorFeeWei,
  executionAdapter:evidence.executionAdapter||null,
  interchainFeeWei:evidence.interchainFeeWei||null,
  quoteNonce:evidence.quoteNonce||null,
  finalDestinationChain:evidence.finalDestinationChain||null,
  finalRecipient:evidence.finalRecipient||evidence.recipient||null,
  onwardRouteId:evidence.onwardRouteId||null,
  parentMessageId:evidence.parentMessageId||null,
  delivered:delivered.delivered,
 };
}
// Pure read-only RPC transport for the finalized indexer; caller controls endpoints,
// never a visitor-provided URL. No wallet or signer is involved.
// A rejected eth_getLogs is never treated as an empty canonical block range.
// Operator-only URLs can override the public catalog; never publish API keys.
