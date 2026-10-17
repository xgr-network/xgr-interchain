// Claim the whole accrued GmbH Interchain Fee balance from each verified
// chain-specific adapter. No customer transfer, no token swap or gas donation.
// The immutable interchainFeeRecipient alone receives a claim; the invoking
// signer pays the chain gas. Use the same wallet for claims and sponsorship.
import {Wallet,JsonRpcProvider,Contract} from "ethers";
import {readFileSync} from "node:fs";
const ABI=[
 "function interchainFeeRecipient() view returns (address)",
 "function pendingInterchainFeesWei() view returns (uint256)",
 "function claimFees()"
];
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const POSITIVE=/^[1-9][0-9]*$/;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
export async function claimAccruedFees({provider,signer,adapterAddress,expectedChainId,
 minClaimWei,gasCostMultiplier=3n}){
 if(!ADDRESS.test(adapterAddress||"")||!POSITIVE.test(String(minClaimWei))||
  !Number.isSafeInteger(expectedChainId)||expectedChainId<=0||
  BigInt(gasCostMultiplier)<2n)throw Error("Invalid fee claim configuration");
 const network=await provider.getNetwork();
 if(network.chainId!==BigInt(expectedChainId))throw Error("Fee claim RPC chain mismatch");
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
  new URL("../../apps/web/catalog.json",import.meta.url),"utf8"))
}={}){
 // Separate claims from transfers and sponsorship; opt-in after deployment.
 if(env.XITA_INTERCHAIN_CLAIM_ENABLED!=="true")return {status:"disabled"};
 const value=k=>{const v=String(env[k]||"").trim();if(!v)throw Error("Missing "+k);return v;};
 const wallet=new Wallet(value("XITA_INTERCHAIN_FEE_PRIVATE_KEY"));
 if(!eq(wallet.address,value("XITA_INTERCHAIN_FEE_ADDRESS")))
  throw Error("Fee wallet private key and configured public address differ");
 const results=[];
 for(const name of ["base","polygon","arbitrum","xgrchain"]){
  const suffix=name.toUpperCase();
  const address=env["XITA_INTERCHAIN_"+suffix+"_ADAPTER"];
  if(!address)continue;
  const config=catalog.chains?.[name];
  if(!config?.rpcUrls?.length)throw Error("Fee claim chain unavailable: "+name);
  const min=value("XITA_INTERCHAIN_"+suffix+"_MIN_CLAIM_WEI");
  const provider=new JsonRpcProvider(config.rpcUrls[0],config.chainId);
  results.push({chain:name,...await claimAccruedFees({
   provider,signer:wallet,adapterAddress:address,
   expectedChainId:config.chainId,minClaimWei:min
  })});
 }
 if(!results.length)throw Error("No deployed fee adapters configured");
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
 let stopping=false;
 process.once("SIGTERM",()=>{stopping=true;});
 process.once("SIGINT",()=>{stopping=true;});
 runClaimMonitor({shouldStop:()=>stopping}).catch(
  err=>{console.error("XITA fee claim:",String(err?.message||err));process.exitCode=1}
 );
}
