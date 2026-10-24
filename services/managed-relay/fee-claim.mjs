// Claim the whole accrued GmbH Interchain Fee balance from each verified
// chain-specific adapter. No customer transfer, no token swap or gas donation.
// The immutable interchainFeeRecipient alone receives a claim; the invoking
// signer pays the chain gas. Use the same wallet for claims and sponsorship.
import {Wallet,JsonRpcProvider,Contract,keccak256} from "ethers";
import {readFileSync} from "node:fs";
const ABI=[
 "function interchainFeeRecipient() view returns (address)",
 "function pendingInterchainFeesWei() view returns (uint256)",
 "function claimFees()"
];
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const POSITIVE=/^[1-9][0-9]*$/;
const CODE_HASH=/^0x[0-9a-f]{64}$/i;
const DEPLOYMENT_CHAINS=["base","polygon","arbitrum","xgrchain"];
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
// Only receipt-backed gateway deployments are eligible for automatic claims.
// Undeployed chains are skipped. Partial, malformed or contradictory
// deployments fail closed rather than falling back to operator ENV addresses.
export function documentedFeeClaimAdapters(catalog,{readReceipt=path=>JSON.parse(
 readFileSync(new URL("../../"+path,import.meta.url),"utf8"))}={}){
 const targets=[];
 for(const name of DEPLOYMENT_CHAINS){
  const gateway=catalog?.infrastructure?.[name]?.xitaV315?.components?.executionGateway;
  if(gateway===undefined||gateway===null)continue;
  const chain=catalog?.chains?.[name];
  const prefix="deployments/receipts/"+name+"/";
  const file=typeof gateway.receiptPath==="string"&&
   gateway.receiptPath.startsWith(prefix)?gateway.receiptPath.slice(prefix.length):"";
  if(!ADDRESS.test(gateway.address||"")||
   !CODE_HASH.test(gateway.runtimeCodeKeccak256||"")||
   !/^[a-f0-9]{64}-[a-f0-9]{40}\.json$/.test(file)||
   !file.endsWith("-"+gateway.address.toLowerCase().slice(2)+".json")||
   !Number.isSafeInteger(chain?.chainId)||chain.chainId<=0||
   !Array.isArray(chain.rpcUrls)||!/^https:\/\//.test(chain.rpcUrls[0]||"")||
   chain.configurationStatus==="planned-unverified")
   throw Error("Fee claim gateway lacks a verified chain deployment receipt: "+name);
  // The catalog references the GitHub-generated receipt. Read that exact
  // checked-in file and prove its chain, tx hash, address and runtime agree.
  // A forged receiptPath string by itself is not evidence.
  let receipt;
  try{receipt=readReceipt(gateway.receiptPath);}
  catch{throw Error("Fee claim deployment receipt unavailable: "+name);}
  if(receipt?.kind!=="xita-v315-deployment-receipt"||
   receipt?.network!=="mainnet"||receipt?.status!=="onchain-deployment-verified"||
   receipt?.component!=="executionGateway"||receipt?.chain!==name||
   receipt?.chainId!==chain.chainId||
   !/^0x[a-f0-9]{64}$/i.test(receipt?.transactionHash||"")||
   !file.startsWith(receipt.transactionHash.toLowerCase().slice(2)+"-")||
   !eq(receipt.address,gateway.address)||
   !eq(receipt.runtimeCodeKeccak256,gateway.runtimeCodeKeccak256))
   throw Error("Fee claim catalog and GitHub receipt mismatch: "+name);
  targets.push({name,chain,address:gateway.address,
   runtimeCodeKeccak256:gateway.runtimeCodeKeccak256});
 }
 return targets;
}
export async function claimAccruedFees({provider,signer,adapterAddress,expectedChainId,
 expectedRuntimeCodeKeccak256,minClaimWei,gasCostMultiplier=3n}){
 if(!ADDRESS.test(adapterAddress||"")||!CODE_HASH.test(expectedRuntimeCodeKeccak256||"")||
  !POSITIVE.test(String(minClaimWei))||
  !Number.isSafeInteger(expectedChainId)||expectedChainId<=0||
  BigInt(gasCostMultiplier)<2n)throw Error("Invalid fee claim configuration");
 const network=await provider.getNetwork();
 if(network.chainId!==BigInt(expectedChainId))throw Error("Fee claim RPC chain mismatch");
 // Verify actual deployed runtime, not merely the claimed contract address.
 // No claim transaction may be simulated or signed before this check.
 const code=await provider.getCode(adapterAddress);
 if(!/^0x(?:[0-9a-f]{2})+$/i.test(code||"")||
  !eq(keccak256(code),expectedRuntimeCodeKeccak256))
  throw Error("Fee claim runtime differs from the verified GitHub deployment receipt");
 const adapter=new Contract(adapterAddress,ABI,signer.connect(provider));
 if(!eq(await adapter.interchainFeeRecipient(),signer.address))
  throw Error("Fee claim signer must be the immutable GmbH beneficiary");
 const amount=BigInt(await adapter.pendingInterchainFeesWei());
 if(amount===0n)return {status:"nothing-to-claim",accruedWei:"0"};
 if(amount<BigInt(minClaimWei))
  return {status:"below-threshold",accruedWei:amount.toString()};
 // An actual pending claim can never claim another party's funds or alter
 // fees; estimate gas before every send. Re-read immediately before signing.
 const estimatedGas=await adapter.claimFees.estimateGas();
 const quote=await provider.getFeeData();
 const gasPrice=quote.maxFeePerGas||quote.gasPrice;
 if(!gasPrice||gasPrice<=0n)throw Error("Claim chain gas price unavailable");
 const maxCost=estimatedGas*gasPrice;
 if(amount<=maxCost*BigInt(gasCostMultiplier))
  return {status:"uneconomical",accruedWei:amount.toString(),
   estimatedClaimGasWei:maxCost.toString()};
 if(BigInt(await provider.getBalance(signer.address))<maxCost*2n)
  return {status:"insufficient-claim-gas",accruedWei:amount.toString()};
 const [latestNonce,pendingNonce]=await Promise.all([
  provider.getTransactionCount(signer.address,"latest"),
  provider.getTransactionCount(signer.address,"pending")
 ]);
 if(pendingNonce!==latestNonce)return {status:"wallet-nonce-pending",
  accruedWei:amount.toString()};
 const current=BigInt(await adapter.pendingInterchainFeesWei());
 if(current<BigInt(minClaimWei)||current===0n)
  return {status:"below-threshold",accruedWei:current.toString()};
 const tx=await adapter.claimFees();
 return {status:"submitted",txHash:tx.hash,accruedWei:current.toString()};
}
export async function runConfiguredFeeClaims({
 env=process.env,catalog=JSON.parse(readFileSync(
  new URL("../../apps/web/catalog.json",import.meta.url),"utf8")),
 providerForChain=chain=>new JsonRpcProvider(chain.rpcUrls[0],chain.chainId),
 claim=claimAccruedFees,readReceipt
}={}){
 // Separate claims from transfers and sponsorship; opt-in after deployment.
 if(env.XITA_INTERCHAIN_CLAIM_ENABLED!=="true")return {status:"disabled"};
 const value=k=>{const v=String(env[k]||"").trim();if(!v)throw Error("Missing "+k);return v;};
 const wallet=new Wallet(value("XITA_INTERCHAIN_FEE_PRIVATE_KEY"));
 if(!eq(wallet.address,value("XITA_INTERCHAIN_FEE_ADDRESS")))
  throw Error("Fee wallet private key and configured public address differ");
 const documented=documentedFeeClaimAdapters(catalog,readReceipt?{readReceipt}:{});
 if(!documented.length)throw Error("No deployed fee adapters configured");
 // Validate EVERY configured chain before considering an on-chain claim.
 // Only explicit native-wei claim thresholds remain in the operator ENV.
 const targets=documented.map(item=>{
  const minClaimWei=value("XITA_INTERCHAIN_"+item.name.toUpperCase()+"_MIN_CLAIM_WEI");
  if(!POSITIVE.test(minClaimWei))
   throw Error("Invalid fee claim threshold for "+item.name);
  return {...item,minClaimWei};
 });
 const results=[];
 for(const target of targets){
  const provider=providerForChain(target.chain);
  results.push({chain:target.name,...await claim({
   provider,signer:wallet,adapterAddress:target.address,
   expectedRuntimeCodeKeccak256:target.runtimeCodeKeccak256,
   expectedChainId:target.chain.chainId,minClaimWei:target.minClaimWei
  })});
 }
 return {status:"ok",results};
}
// One loop is enough: each tick reads the aggregate contract balance and
// makes at most one economic claim per configured source chain.
export async function runClaimMonitor({
 intervalMs=300000,run=runConfiguredFeeClaims,
 shouldStop=()=>false,sleep=ms=>new Promise(done=>setTimeout(done,ms))
}={}){
 if(!Number.isSafeInteger(intervalMs)||intervalMs<60000||intervalMs>3600000)
  throw Error("Unsafe aggregate claim monitor interval");
 while(!shouldStop()){
  try{const report=await run();if(report.status!=="disabled")
   console.log("XITA Interchain Fee claim:",JSON.stringify(report));}
  catch(error){console.error("XITA fee claim monitor:",String(error?.message||error));}
  if(!shouldStop())await sleep(intervalMs);
 }
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 runConfiguredFeeClaims().then(value=>console.log("XITA fee claim:",JSON.stringify(value)),
  err=>{console.error("XITA fee claim:",String(err?.message||err));process.exitCode=1}
 );
}
