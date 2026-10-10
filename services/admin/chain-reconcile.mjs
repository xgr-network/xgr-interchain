// Reconcile a signed transaction by its exact committed wallet intent.
// Never assume a successful receipt proves correct constructor or immutables.
import {selector} from "../../apps/web/keccak.mjs";
import {verifyRuntimeTemplate} from "./trusted-artifacts.mjs";
import {verifyDeploymentReceipt} from "./deployment-ledger.mjs";
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
export async function verifyChainBindings({rpc,url,component,address,chain,bootstrap,infra}){
 const check=async(signature,expected,kind="uint")=>{
  const result=await getter(rpc,url,address,signature);
  const observed=kind==="address"?asAddr(result):asWord(result);
  if(kind==="address"?!same(observed,expected):observed!==BigInt(expected))
   throw Error("On-chain constructor binding mismatch: "+signature);
 };
 if(component==="blsVerifier")return true;
 if(component==="validatorRegistry"){
  const v=infra.components.find(c=>c.key==="blsVerifier")?.address||bootstrap.verifierAddress;
  if(!ADDR.test(v||""))throw Error("Verifier address not established");
  await check("originChainId()",1643);
  await check("destinationDomain()",chain.domainId);
  await check("verifier()",v,"address");
  await check("verifierKeyFormat()",chain.blsVerifierFormat==="compressed"?1:2);
  await check("setId()",1);
  const onChain=await getter(rpc,url,address,"quorumThreshold()");
  if(asWord(onChain)<2n)throw Error("Bootstrap quorum too low");
 }else if(component==="ism"){
  const v=infra.components.find(c=>c.key==="validatorRegistry")?.address;
  if(!ADDR.test(v||""))throw Error("Registry missing during ISM verification");
  await check("registry()",v,"address");
  await check("destinationDomain()",chain.domainId);
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
 }else if(component==="sourceRegistry"){
  const factory=infra.components.find(c=>c.key==="factory")?.address;
  if(!ADDR.test(factory||""))throw Error("Source Registry Factory missing");
  await check("sourceChainId()",chain.chainId);
  await check("sourceDomain()",chain.domainId);
  await check("factory()",factory,"address");
  await check("validatorFeeWei()",bootstrap.proposedFeeWei);
  await check("sourceFeeNonce()",0);
 }else throw Error("Unknown infrastructure component");
 return true;
}
export async function reconcileDeployedContract({
 root,entry,chain,bootstrap,infrastructure,artifact,rpc,url
}){
 if(entry.stage!=="submitted"||!H32.test(entry.txHash||""))
  throw Error("Only submitted, hash-journaled transactions can reconcile");
 if(entry.chainId!==chain.chainId||entry.id!==chain.name+":"+artifact.component)
  throw Error("Deployment identity differs from approved chain");
 const chainId=await rpc(url,"eth_chainId",[]);
 if(BigInt(chainId)!==BigInt(chain.chainId))throw Error("RPC network mismatch");
 const tx=await rpc(url,"eth_getTransactionByHash",[entry.txHash]);
 if(!tx)throw Error("Submitted hash not visible: keep intent locked; never resend");
 if(!same(tx.from,entry.wallet)||!same(tx.input,entry.transaction.data)||
    BigInt(tx.value)!==BigInt(entry.transaction.value)||
    BigInt(tx.nonce)!==BigInt(entry.transaction.nonce)||
    (entry.transaction.to===null?tx.to!==null:!same(tx.to,entry.transaction.to)))
  throw Error("Observed transaction does not match durable wallet intent");
 const receipt=await rpc(url,"eth_getTransactionReceipt",[entry.txHash]);
 if(!receipt)throw Error("Transaction pending; do not rebroadcast");
 if(BigInt(receipt.status)!==1n)throw Error("On-chain transaction failed; manual review required");
 const component=entry.id.split(":")[1];
 const address=component==="sourceRegistry"
  ? await getter(rpc,url,entry.transaction.to,"registry()").then(asAddr)
  : receipt.contractAddress;
 if(!ADDR.test(address||""))throw Error("No deployed component address");
 const code=await rpc(url,"eth_getCode",[address,"0x"+BigInt(receipt.blockNumber).toString(16)]);
 const hash=verifyRuntimeTemplate(artifact,code);
 await verifyChainBindings({rpc,url,component,address,chain,bootstrap,infra:infrastructure});
 const input={sourceCommit:entry.sourceCommit,chain:chain.name,component,contractAddress:address,
  txHash:entry.txHash,expectedRuntimeKeccak256:hash,expectedDeployer:entry.wallet,
  provenance:component==="sourceRegistry"?{kind:"factory-registry",factory:entry.transaction.to}:{kind:"create"}};
 // The ledger independently checks canonical receipt, confirmations and code.
 const verified=await verifyDeploymentReceipt(root,input,{rpc});
 return {input,verified,contractAddress:address,runtimeKeccak:hash};
}
