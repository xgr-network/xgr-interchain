// Source-native fee-claim scheduler. No user-transfer execution or sponsorship grants.
// Run once per timer tick. Derived exclusively from confirmed on-chain adapter logs.
import {Wallet,JsonRpcProvider,Contract,Interface} from "ethers";
const ABI=[
 "event InterchainFeeCharged(bytes32 indexed messageId,address indexed payer,address indexed gateway,bytes32 routeId,uint32 destinationDomain,bytes32 recipient,uint32 finalDestinationDomain,bytes32 finalRecipient,bytes32 onwardRouteId,uint256 amount,uint256 validatorFeeWei,uint256 bridgeNativeWei,uint256 interchainFeeWei,uint256 quoteNonce)",
 "function feeReceipt(bytes32) view returns (address payer,address gateway,uint256 interchainFeeWei,bool exists,bool withdrawn)",
 "function interchainFeeRecipient() view returns (address)",
 "function pendingInterchainFeesWei() view returns (uint256)",
 "function withdrawFees(bytes32[])"
];
const A=/^0x[0-9a-f]{40}$/i;
const I=new Interface(ABI),topic=I.getEvent("InterchainFeeCharged").topicHash;
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export async function claimFeeBatch({provider,signer,adapterAddress,deploymentBlock,
 minClaimWei=0n,confirmations=12n,gasCostMultiplier=3n}){
 if(!A.test(adapterAddress||"")||!Number.isSafeInteger(deploymentBlock)||
  deploymentBlock<=0||BigInt(confirmations)<1n||BigInt(gasCostMultiplier)<2n)
  throw Error("Unsafe fee claim configuration");
 const chain=await provider.getNetwork();
 if(!chain?.chainId||BigInt(chain.chainId)<1n)throw Error("Chain mismatch");
 const adapter=new Contract(adapterAddress,ABI,signer.connect(provider));
 if(!eq(await adapter.interchainFeeRecipient(),signer.address))
  throw Error("Sponsor wallet does not match immutable GmbH beneficiary");
 const head=BigInt(await provider.getBlockNumber());
 const to=head-BigInt(confirmations)+1n;
 if(to<BigInt(deploymentBlock))return {status:"not-finalized"};
 // Enumerate ONLY canonical adapter fee events; bounded windows for provider.
 // Read-only scan from deployment ensures restarts never skip unclaimed fees.
 const ids=[];
 for(let start=BigInt(deploymentBlock);start<=to;start+=1000n){
  const end=start+999n>to?to:start+999n;
  const logs=await provider.getLogs({address:adapterAddress,topics:[topic],
   fromBlock:Number(start),toBlock:Number(end)});
  if(logs.length>2000)throw Error("Claim event window too large");
  for(const log of logs){
   const event=I.parseLog(log);
   if(event?.name!=="InterchainFeeCharged")continue;
   const fee=await adapter.feeReceipt(event.args.messageId,{blockTag:Number(to)});
   if(fee.exists&&!fee.withdrawn&&fee.interchainFeeWei>0n){
    ids.push(event.args.messageId);
    if(ids.length>=32)break;
   }
  }
  if(ids.length>=32)break;
 }
 if(!ids.length)return {status:"nothing-to-claim"};
 const unique=[...new Set(ids)];
 let total=0n;
 for(const id of unique)total+=(await adapter.feeReceipt(id)).interchainFeeWei;
 if(total<BigInt(minClaimWei))return {status:"below-minimum",amountWei:total.toString()};
 const gas=await adapter.withdrawFees.estimateGas(unique);
 const price=await provider.getFeeData();
 const unit=price.maxFeePerGas||price.gasPrice;
 if(!unit||unit<=0n)throw Error("Chain gas quote missing");
 // Do not spend more than 1 / multiplier of collected source-native value.
 if(gas*unit*BigInt(gasCostMultiplier)>=total)return {status:"uneconomical",amountWei:total.toString()};
 // Wallet owns all claims. Never send a user-transfer transaction.
 const tx=await adapter.withdrawFees(unique);
 return {status:"submitted",txHash:tx.hash,amountWei:total.toString(),receipts:unique.length};
}
export async function runConfiguredFeeClaim(){
 const required=k=>{const v=String(process.env[k]||"").trim();if(!v)throw Error("Missing "+k);return v;};
 if(process.env.XITA_INTERCHAIN_SPONSOR_ENABLED!=="true")
  return {status:"disabled"};
 const signer=new Wallet(required("XITA_INTERCHAIN_FEE_PRIVATE_KEY"));
 if(!eq(signer.address,required("XITA_INTERCHAIN_FEE_ADDRESS")))
  throw Error("Configured fee beneficiary differs from private key");
 const catalog=JSON.parse((await import("node:fs")).readFileSync(
  new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const outcomes=[];
 for(const name of ["base","xgrchain"]){
  const suffix=name.toUpperCase();
  const address=process.env["XITA_INTERCHAIN_"+suffix+"_ADAPTER"];
  const block=process.env["XITA_INTERCHAIN_"+suffix+"_DEPLOY_BLOCK"];
  if(!address&&!block)continue;
  const chain=catalog.chains[name];
  if(!chain||!address||!block)throw Error("Incomplete "+name+" adapter configuration");
  const provider=new JsonRpcProvider(chain.rpcUrls[0],chain.chainId,{staticNetwork:true});
  const actual=await provider.getNetwork();
  if(actual.chainId!==BigInt(chain.chainId))throw Error("RPC network mismatch");
  outcomes.push({chain:name,...await claimFeeBatch({provider,signer,adapterAddress:address,
   deploymentBlock:Number(block),confirmations:BigInt(chain.confirmations||1),
   minClaimWei:BigInt(required("XITA_INTERCHAIN_MIN_CLAIM_WEI"))})});
 }
 return {status:"ok",outcomes};
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 runConfiguredFeeClaim().then(x=>console.log(JSON.stringify(x)),
 e=>{console.error(String(e?.message||e));process.exitCode=1;});
}
