// Reconcile a signed transaction by its exact committed wallet intent.
// Never assume a successful receipt proves correct constructor or immutables.
import {selector} from "../../apps/web/keccak.mjs";
import {encodeAbi} from "./abi-encoder.mjs";
import {verifyRuntimeTemplate} from "./trusted-artifacts.mjs";
import {verifyDeploymentReceipt} from "./deployment-ledger.mjs";
import {observeCommittedWalletTransaction} from "./deployment-wallet-transaction.mjs";
const H32=/^0x[0-9a-f]{64}$/i,ADDR=/^0x[0-9a-f]{40}$/i;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const asWord=value=>{
 if(!H32.test(value||""))throw Error("Invalid 32-byte getter response");
 return BigInt(value);
};
const asAddr=value=>"0x"+asWord(value).toString(16).padStart(40,"0");
async function getter(rpc,url,address,signature){
 return rpc(url,"eth_call",[{to:address,data:selector(signature)},"latest"]);
}
export async function verifyChainBindings({rpc,url,component,address,chain,bootstrap,infra,parameters={}}){
 const check=async(signature,expected,kind="uint")=>{
  const result=await getter(rpc,url,address,signature);
  const observed=kind==="address"?asAddr(result):asWord(result);
  if(kind==="address"?!same(observed,expected):observed!==BigInt(expected))
   throw Error("On-chain constructor binding mismatch: "+signature);
 };
 // These three immutable deployment modules have no constructor bindings.
 // Exact compiler-pinned runtime verification is mandatory in reconcileDeployedContract.
 if(["blsVerifier","nativeRouterDeployer","syntheticRouterDeployer",
     "collateralRouterDeployer"].includes(component))return true;
 if(component==="validatorRegistry"){
  const v=infra.components.find(c=>c.key==="blsVerifier")?.address||bootstrap.verifierAddress;
  if(!ADDR.test(v||""))throw Error("Verifier address not established");
  await check("originChainId()",1643);
  await check("destinationDomain()",chain.domainId);
  await check("verifier()",v,"address");
  await check("verifierKeyFormat()",chain.blsVerifierFormat==="compressed"?1:2);
  await check("setId()",1);
  if(!bootstrap.reserve?.minimumWei||!bootstrap.reserve?.maxExecutorReimbursementWei||
      !bootstrap.reserve?.perValidatorWei)
   throw Error("Approved reserve parameters missing from live verification");
  await check("minimumDeactivationReserveWei()",bootstrap.reserve.minimumWei);
  await check("maxExecutorReimbursementWei()",bootstrap.reserve.maxExecutorReimbursementWei);
  const onChain=await getter(rpc,url,address,"quorumThreshold()");
  if(!Array.isArray(bootstrap.initialValidators)||bootstrap.initialValidators.length<3 ||
     asWord(onChain)!==BigInt(Math.ceil(2*bootstrap.initialValidators.length/3)))throw Error("Bootstrap quorum or pinned validator count differs");
  for(const validator of bootstrap.initialValidators){
   const status=await rpc(url,"eth_call",[{
    to:address,data:selector("getValidatorStatus(address)")+
     encodeAbi(["address"],[validator]).slice(2)
   },"latest"]);
   if(!/^0x[0-9a-f]{128}$/i.test(status||"")||
      BigInt("0x"+status.slice(2,66))!==1n||
      BigInt("0x"+status.slice(66,130))!==1n)
    throw Error("Pinned initial validator missing or inactive in RegistryV3");
   const detail=await rpc(url,"eth_call",[{
     to:address,data:selector("getValidator(address)")+
       encodeAbi(["address"],[validator]).slice(2)
   },"latest"]);
   // ABI: (bool active, bytes dynamic BLS public key, uint256 reserveWei).
   if(!/^0x[0-9a-f]{192,}$/i.test(detail||"")||
      BigInt("0x"+detail.slice(2,66))!==1n||
      BigInt("0x"+detail.slice(130,194))!==BigInt(bootstrap.reserve.perValidatorWei))
    throw Error("Validator initial reserve differs from signed transaction");
  }
 }else if(component==="executionGateway"){
  const registry=infra.components.find(c=>c.key==="sourceRegistry")?.address;
  const owner=parameters?.relayerOwner,feeRecipient=parameters?.interchainFeeRecipient;
  if(!ADDR.test(registry||"")||!ADDR.test(owner||"")||!ADDR.test(feeRecipient||"")||
     /^0x0{40}$/i.test(owner))throw Error("Approved managed relay owner or source Registry missing");
  await check("sourceRegistry()",registry,"address");
  await check("relayerOwner()",owner,"address");
  await check("interchainFeeRecipient()",feeRecipient,"address");
  await check("MAX_QUOTE_LIFETIME()",90);
  await check("quoteLifetimeSeconds()",90);
 }else if(component==="ism"){
  const v=infra.components.find(c=>c.key==="validatorRegistry")?.address;
  if(!ADDR.test(v||""))throw Error("Registry missing during ISM verification");
  await check("registry()",v,"address");
  await check("destinationDomain()",chain.domainId);
 }else if(component==="transportBundle"){
  const ism=infra.components.find(c=>c.key==="ism")?.address;
  if(!ADDR.test(ism||""))throw Error("Destination ISM missing for transport");
  await check("destinationIsm()",ism,"address");
  await check("localDomain()",chain.domainId);
  // Full child checks occur separately before a single atomic GitHub batch.
 }else if(component==="factory"){
  const registry=infra.components.find(c=>c.key==="validatorRegistry")?.address;
  const ism=infra.components.find(c=>c.key==="ism")?.address;
  if(!ADDR.test(registry||"")||!ADDR.test(ism||""))throw Error("Factory dependencies missing");
  await check("localChainId()",chain.chainId);
  await check("localDomain()",chain.domainId);
  await check("validatorRegistry()",registry,"address");
  await check("destinationIsm()",ism,"address");
  await check("initialSourceFeeWei()",bootstrap.proposedFeeWei);
  await check("mailbox()",infra.hyperlane.mailbox,"address");
  await check("merkleTreeHook()",infra.hyperlane.merkleTreeHook,"address");
  // Reject an otherwise matching Factory that points at unverified/deceptive
  // subdeployers. These immutable constructor bindings define token security.
  for(const [getterName,componentName] of [
   ["nativeDeployer()","nativeRouterDeployer"],
   ["syntheticDeployer()","syntheticRouterDeployer"],
   ["collateralDeployer()","collateralRouterDeployer"]
  ]){
   const target=infra.components.find(c=>c.key===componentName)?.address;
   if(!ADDR.test(target||""))throw Error("Unverified Factory module: "+componentName);
   await check(getterName,target,"address");
  }
 }else if(component==="sourceRegistry"){
  const factory=infra.components.find(c=>c.key==="factory")?.address;
  if(!ADDR.test(factory||""))throw Error("Source Registry Factory missing");
  await check("sourceChainId()",chain.chainId);
  await check("sourceDomain()",chain.domainId);
  await check("factory()",factory,"address");
  const validator=infra.components.find(c=>c.key==="validatorRegistry")?.address;
  if(!ADDR.test(validator||""))throw Error("Source Registry governance authority missing");
  await check("governanceRegistry()",validator,"address");
  const nonce=asWord(await getter(rpc,url,address,"sourceFeeNonce()"));
  const actualFee=asWord(await getter(rpc,url,address,"validatorFeeWei()"));
  if(actualFee===0n)throw Error("Source registry has invalid zero live fee");
  if(nonce===0n){
   const initialFee=asWord(await getter(rpc,url,factory,"initialSourceFeeWei()"));
   if(actualFee!==initialFee)throw Error("Initial source fee differs from on-chain Factory");
  }
 }else throw Error("Unknown infrastructure component");
 return true;
}
// Verify every bundle-created child contract independently at the deployment
// block. All constructor/runtime bindings are validated before GitHub write.
export async function verifyTransportChildren({rpc,url,bundle,chain,ism,artifacts,blockNumber}){
 const addresses={};
 const asChild=async(signature,component)=>{
  const result=await getter(rpc,url,bundle,signature);
  const address=asAddr(result);
  if(!ADDR.test(address)||BigInt(address)===0n)throw Error("Missing transport child: "+component);
  const artifact=artifacts[component];
  if(!artifact)throw Error("Missing sealed child artifact: "+component);
  const code=await rpc(url,"eth_getCode",[address,"0x"+BigInt(blockNumber).toString(16)]);
  const hash=verifyRuntimeTemplate(artifact,code);
  addresses[component]={address,runtimeKeccak:hash};
  return address;
 };
 const mailbox=await asChild("mailbox()","mailbox");
 const hook=await asChild("merkleTreeHook()","merkleTreeHook");
 const required=await asChild("requiredHook()","requiredHook");
 const check=async(target,signature,expected,kind="address")=>{
  const actual=await getter(rpc,url,target,signature);
  const value=kind==="address"?asAddr(actual):asWord(actual);
  if(kind==="address"?!same(value,expected):value!==BigInt(expected))
   throw Error("Transport child binding mismatch: "+signature);
 };
 await check(mailbox,"localDomain()",chain.domainId,"uint");
 await check(mailbox,"owner()",bundle);
 await check(mailbox,"defaultIsm()",ism);
 await check(mailbox,"defaultHook()",hook);
 await check(mailbox,"requiredHook()",required);
 await check(hook,"mailbox()",mailbox);
 await check(hook,"hookType()",3,"uint");
 await check(required,"hookType()",8,"uint");
 await check(required,"protocolFee()",0,"uint");
 await check(required,"MAX_PROTOCOL_FEE()",0,"uint");
 await check(required,"owner()",bundle);
 return addresses;
}
export async function reconcileDeployedContract({
 root,entry,chain,bootstrap,infrastructure,artifact,rpc,url
}){
 if(!["submitted","confirmed"].includes(entry.stage)||!H32.test(entry.txHash||""))
  throw Error("Only submitted, hash-journaled transactions can reconcile");
 if(entry.chainId!==chain.chainId||entry.id!==chain.name+":"+artifact.component)
  throw Error("Deployment identity differs from approved chain");
 const chainId=await rpc(url,"eth_chainId",[]);
 if(BigInt(chainId)!==BigInt(chain.chainId))throw Error("RPC network mismatch");
 const observation=await observeCommittedWalletTransaction({rpc,url,entry});
 if(observation.pending)return observation;
 // Only the original, fully matched wallet transaction can reach receipt
 // and immutable-bytecode verification below. No broadcast path exists here.
 const receipt=await rpc(url,"eth_getTransactionReceipt",[entry.txHash]);
 if(!receipt)return {pending:true,reason:"receipt",txHash:entry.txHash};
 if(BigInt(receipt.status)!==1n)throw Error("On-chain transaction failed; manual review required");
 const component=entry.id.split(":")[1];
 const address=component==="sourceRegistry"
  ? await getter(rpc,url,entry.transaction.to,"registry()").then(asAddr)
  : receipt.contractAddress;
 if(!ADDR.test(address||""))throw Error("No deployed component address");
 const head=await rpc(url,"eth_blockNumber",[]);
 if(BigInt(head)<BigInt(receipt.blockNumber)||
    BigInt(head)-BigInt(receipt.blockNumber)+1n<BigInt(chain.confirmations||1))
   return {pending:true,reason:"confirmations",txHash:entry.txHash};
 const code=await rpc(url,"eth_getCode",[address,"0x"+BigInt(receipt.blockNumber).toString(16)]);
 const hash=verifyRuntimeTemplate(artifact,code);
 await verifyChainBindings({rpc,url,component,address,chain,bootstrap,
  infra:infrastructure,parameters:entry.parameters||{}});
 const input={sourceCommit:entry.sourceCommit,chain:chain.name,component,contractAddress:address,
  txHash:entry.txHash,expectedRuntimeKeccak256:hash,expectedDeployer:entry.wallet,
  provenance:component==="sourceRegistry"?{kind:"factory-registry",factory:entry.transaction.to}:{kind:"create"}};
 // The ledger independently checks canonical receipt, confirmations and code.
 const verified=await verifyDeploymentReceipt(root,input,{rpc});
 return {input,verified,contractAddress:address,runtimeKeccak:hash};
}
