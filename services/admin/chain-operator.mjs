// The only server-backed, main-authorized core deployment coordinator.
// EIP-1193 wallet signs in the browser. All transactions are server-authored;
// browser input may select chain/component and provide the public wallet/hash.
import {resolve,join} from "node:path";
import {checkedLocalMain} from "./main-gate.mjs";
import {readdirSync,readFileSync} from "node:fs";
import {assertCurrentMain,approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
import {readDeploymentReadiness} from "./deployment-readiness.mjs";
import {inspectConfiguredChain} from "./chain-preflight.mjs";
import {chainDraft,simulateChainDraft} from "./chain-transaction-draft.mjs";
import {trustedBuild} from "./trusted-artifacts.mjs";
import {reconcileDeployedContract,verifyTransportChildren} from "./chain-reconcile.mjs";
import {deploymentIntents} from "./deployment-intents.mjs";
import {persistWalletBroadcastHash} from "./deployment-wallet-transaction.mjs";
import {verifyPrepared} from "./prepared-override.mjs";
import {resumeInterruptedDeployments} from "./deployment-auto-resume.mjs";
import {verifyExistingSourceRegistry} from "./source-registry-recovery.mjs";
import {recoverBeforeWalletSignature} from "./deployment-retry.mjs";
import {publishDeploymentBatch,deploymentReceiptPath} from "./deployment-ledger.mjs";
import {rpcCall} from "./inspector.mjs";
import {deploymentParameters} from "./deployment-parameters.mjs";
import {queueDeploymentSync} from "./deployment-auto-sync.mjs";
import {loadChainDeployment} from "../../tools/manifest-layout.mjs";

const ADDRESS=/^0x[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i;
const nonceWord=s=>{
 if(typeof s!=="string"||!/^0x[0-9a-f]+$/i.test(s))throw Error("Invalid pending nonce");
 return s.toLowerCase();
};
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
export function createChainOperator({
 root,stateDir,publicEvidenceDir,rpc=rpcCall,build=trustedBuild,publish=publishDeploymentBatch,
 mainCheck=assertCurrentMain
}){
 const inventory=()=>approvedWorkInventory(root);
 const journals=chains=>deploymentIntents({
  directory:resolve(stateDir,"wallet-intents"),chains});
 async function approved(chainName,{previewOnly=false}={}){
  const commit=previewOnly?checkedLocalMain(root):await mainCheck(root);
  const all=inventory();
  const chain=all.chains.find(c=>c.name===chainName);
  if(!chain)throw Error("Chain absent from current GitHub main");
  const infrastructure=infrastructureInventory(root,[chain])[0];
  const bootstrap=bootstrapPlan(root,chain);
  return {commit,inventory:all,chain,infrastructure,bootstrap};
 }
 async function requireVersionThree(chain,infrastructure,component){
  if(component==="validatorRegistry" || component==="blsVerifier")return;
  const registry=infrastructure.components.find(p=>p.key==="validatorRegistry")?.address;
  if(!registry)throw Error("Verified ValidatorRegistry V3 required before further deployment");
  // Fail closed until the currently configured V3 is verified on chain.
  const {selector}=await import("../../apps/web/keccak.mjs");
  let version;
  try{
   version=await rpc(chain.rpcUrls[0],"eth_call",[
    {to:registry,data:selector("registryVersion()")},"latest"]);
  }catch{
   throw Error("ValidatorRegistry V3 verification failed; do not sign");
  }
  if(typeof version!=="string"||!/^0x[0-9a-f]{64}$/i.test(version)||
     BigInt(version)!==3n)
   throw Error("ValidatorRegistry V3 not verified on chain; no dependent deployment");
 }
 async function preview({chain:chainName,component,wallet,parameters={}}){
  if(!ADDRESS.test(wallet||""))throw Error("Connect a valid wallet");
  const {commit,inventory:all,chain,infrastructure,bootstrap}=await approved(chainName,{previewOnly:true});
  await requireVersionThree(chain,infrastructure,component);
  const values=deploymentParameters(component,parameters);
  if(infrastructure.components.some(p=>p.key===component&&p.status==="documented"))
   throw Error("Component already documented in GitHub");
  const preflight=await inspectConfiguredChain({chain,core:infrastructure.hyperlane,rpc,bootstrap});
  if(!preflight.basicRpcPreflightOK)throw Error("Chain or BLS preflight failed");
  let verified=bootstrap;
  if(component==="validatorRegistry"){
   const readiness=await readDeploymentReadiness({root,chain,inventory:all,boot:bootstrap,
     baseDir:publicEvidenceDir,mainCurrent:true,rpc});
   if(!readiness.evidenceVerified||readiness.verifiedValidatorCount!==bootstrap.initialValidators.length||
      !readiness.verifiedSnapshot?.validators?.length)
    throw Error("Destination Genesis BLS proofs not verified");
   verified={...bootstrap,validatorCount:bootstrap.initialValidators.length,expectedValidatorCount:bootstrap.initialValidators.length,
    validatorSnapshot:readiness.verifiedSnapshot};
  }
  const compiled=await build(root,commit);
  const draft=chainDraft({root,chain,infrastructure,bootstrap:verified,component,parameters:values,artifact:compiled.artifacts[component]});
  const artifact=compiled.artifacts[component];
  if(!artifact)throw Error("Missing trusted artifact");
  if(component!=="sourceRegistry"&&!eq(draft.transaction.data.slice(0,artifact.creation.length),artifact.creation))
   throw Error("Creation bytecode differs from trusted artifact");
  const simulation=await simulateChainDraft(draft,{rpc,url:chain.rpcUrls[0],from:wallet});
  return {chain:chain.name,component,sourceCommit:commit,
    gasEstimateWei:simulation.gasEstimateWei,gasLimit:simulation.gasLimit,
    gasPriceWei:simulation.gasPriceWei,totalWorstCaseWei:simulation.totalWorstCaseWei,
    l1DataFeeUpperBoundWei:simulation.l1DataFeeUpperBoundWei,
    operatorFeeWei:simulation.operatorFeeWei,
    depositWei:BigInt(draft.transaction.value).toString(),
    parameters:values,mode:"preview-only-no-broadcast-local-clean-main"};
 }
 async function prepare({chain:chainName,component,wallet,parameters={},forceRetry=true}){
  if(!ADDRESS.test(wallet||""))throw Error("Connect a valid EIP-1193 wallet");
  const {commit,inventory:all,chain,infrastructure,bootstrap}=await approved(chainName);
  await requireVersionThree(chain,infrastructure,component);
  const journal=journals(all.chains);
  if(component==="sourceRegistry"&&!forceRetry){
   const recovered=await resume({chain:chainName,component});
   if(recovered.stage==="documented")throw Error("Existing SourceRegistry verified and documented in GitHub. Refresh after sync; no new wallet transaction needed.");
   if(recovered.stage==="pending")throw Error("SourceRegistry on-chain verification pending: "+(recovered.reason||"unknown")+"; no new transaction signed");
  }else if(!forceRetry)await recoverBeforeWalletSignature({journal,chain,component,resume});
  if(infrastructure.components.some(p=>p.key===component&&p.status==="documented"))
   throw Error("Component already documented in GitHub");
  const preflight=await inspectConfiguredChain({chain,core:infrastructure.hyperlane,rpc,
   bootstrap});
  if(!preflight.basicRpcPreflightOK)throw Error("Destination chain RPC, core or BLS preflight failed");
  const values=deploymentParameters(component,parameters);
  let verified=bootstrap;
  if(component==="validatorRegistry"){
   const readiness=await readDeploymentReadiness({
    root,chain,inventory:all,boot:bootstrap,baseDir:publicEvidenceDir,
    mainCurrent:true,rpc
   });
   if(!readiness.evidenceVerified||readiness.verifiedValidatorCount!==bootstrap.initialValidators.length||
      !readiness.verifiedSnapshot?.validators?.length)
    throw Error("Destination Genesis BLS proofs not verified");
   verified={...bootstrap,validatorCount:bootstrap.initialValidators.length,expectedValidatorCount:bootstrap.initialValidators.length,
     validatorSnapshot:readiness.verifiedSnapshot};
  }
  const artifacts=await build(root,commit);
  const draft=chainDraft({root,chain,infrastructure,bootstrap:verified,component,parameters:values,artifact:artifacts.artifacts[component]});
  const artifact=artifacts.artifacts[component];
  if(!artifact)throw Error("No verified contract artifact");
  if(component!=="sourceRegistry"&&!eq(draft.transaction.data.slice(0,artifact.creation.length),artifact.creation))
   throw Error("Creation bytecode does not match trusted artifact");
  const simulation=await simulateChainDraft(draft,{rpc,url:chain.rpcUrls[0],from:wallet});
  const nonce=nonceWord(await rpc(chain.rpcUrls[0],"eth_getTransactionCount",[wallet,"pending"]));
  const transaction={...simulation.transaction,nonce};
  // Intent is irrevocable until hash reconciliation or explicit operator review.
  const item=journal.prepare({
   id:draft.id,chainId:chain.chainId,sourceCommit:commit,
   wallet,buildHash:artifact.buildHash,artifactHash:artifact.artifactHash,
   parameters:values,
   validatorSnapshot:component==="validatorRegistry"?verified.validatorSnapshot:null,
   transaction
  },{forceRetry});
  return {mode:"await-wallet-confirmation",commit,id:item.id,chain:chain.name,
   chainId:chain.chainId,component,buildHash:artifact.buildHash,
   simulation:{gas:transaction.gas,gasPriceWei:simulation.gasPriceWei,
    totalWorstCaseWei:simulation.totalWorstCaseWei,
    l1DataFeeUpperBoundWei:simulation.l1DataFeeUpperBoundWei,
    operatorFeeWei:simulation.operatorFeeWei},
   transaction,createdAt:item.createdAt,warning:"If wallet broadcast status is uncertain do not retry; reconcile nonce/hash."};
 }
 async function hash({id,txHash}){
  if(!TX.test(txHash||""))throw Error("Invalid signed transaction hash");
  const all=inventory();
  const journal=journals(all.chains);
  const record=journal.read().entries[id];
  if(!record)throw Error("Unknown deployment intent");
  // Wallet hash must be durably journaled BEFORE any potentially lagging
  // RPC lookup. Exact sender/nonce/calldata/value/chain are checked later,
  // BEFORE trusting receipt, bytecode or publishing the deployment.
  if(!all.chains.some(c=>c.chainId===record.chainId))
   throw Error("Wallet intent chain no longer approved");
  return persistWalletBroadcastHash({journal,id,txHash});
 }
 // SourceRegistry has one actual creation event per approved Factory.
 // This recovery applies to every configured chain and does not depend on
 // the outer calldata/target of any later MetaMask wallet transaction.
 async function publishExistingSourceRegistry({chain,commit,infrastructure,bootstrap,journal}){
  if(infrastructure.components.some(c=>c.key==="sourceRegistry"&&c.status==="documented"))
   return null;
  const factory=infrastructure.components.find(c=>c.key==="factory"&&c.status==="documented");
  if(!factory?.address)return null;
  const approvedFactory=loadChainDeployment(root,chain).xitaV315?.components?.factory;
  if(!approvedFactory?.receiptPath)throw Error("Documented Factory receipt missing");
  const factoryReceipt=JSON.parse(readFileSync(join(root,approvedFactory.receiptPath),"utf8"));
  if(!eq(factoryReceipt.address,factory.address)||
     factoryReceipt.component!=="factory"||
     !Number.isSafeInteger(factoryReceipt.blockNumber))
   throw Error("Factory deployment receipt does not match approved Factory");
  const compiled=await build(root,commit);
  const recovered=await verifyExistingSourceRegistry({
   root,chain,infrastructure,bootstrap,artifact:compiled.artifacts.sourceRegistry,
   sourceCommit:commit,factoryDeploymentBlock:factoryReceipt.blockNumber,rpc
  });
  if(!recovered)return null;
  const published=await publish(root,[recovered.input],{rpc});
  if(!/^[a-f0-9]{40}$/i.test(published.commit||""))
   throw Error("Verified SourceRegistry receipt was not published to GitHub");
  const path=deploymentReceiptPath(recovered.verified);
  const id=chain.name+":sourceRegistry";
  const old=journal.read().entries[id];
  if(old)journal.documentRecovered(id,old.createdAt,path);
  let autoSyncQueued=false;
  try{queueDeploymentSync(stateDir,published.commit);autoSyncQueued=true;}
  catch(error){console.error("SourceRegistry sync:",String(error.message||error));}
  return {stage:"documented",receiptPath:path,commit:published.commit,
   address:recovered.address,txHash:recovered.txHash,
   automaticallyRecovered:true,checkoutUpdateRequired:true,autoSyncQueued};
 }
 async function reconcile({id}){
  const all=inventory(),journal=journals(all.chains),entry=journal.read().entries[id];
  if(!entry)throw Error("Unknown deployment intent");
  const chain=all.chains.find(c=>c.chainId===entry.chainId);
  if(!chain||id!==chain.name+":"+id.split(":")[1])throw Error("Unknown chain");
  if(entry.stage==="prepared")
   throw Error("Wallet hash not reconciled; inspect sender nonce before any retry");
  // A confirmed transaction may have lost GitHub connectivity. Always
  // re-verify the SAME tx and retry only the GitHub append, never broadcast.
  const previouslyConfirmed=entry.stage==="confirmed";
  // Reconciliation must not mutate .git: the Admin process may run in a
  // read-only filesystem. Existing confirmed receipts are matched against
  // the current, separately updated main checkout below.
  // A new main may have advanced independently after signature. Never replace
  // sourceCommit to evade the main-only publisher check.
  const {commit,infrastructure,bootstrap}=await approved(chain.name);
  if(id.endsWith(":sourceRegistry")){
   const recovered=await publishExistingSourceRegistry({
    chain,commit,infrastructure,bootstrap,journal
   });
   if(recovered)return recovered;
  }
  if(commit!==entry.sourceCommit){
   // GitHub may have accepted a receipt before the HTTP response was lost.
   // Only an immutable, exact source-commit/tx/wallet receipt can settle it.
   const receiptDir=join(root,"deployments/receipts",chain.name);
   let match=null;
   try{
    for(const file of readdirSync(receiptDir)){
     if(!file.startsWith(entry.txHash.slice(2).toLowerCase()+"-")||!file.endsWith(".json"))continue;
     const record=JSON.parse(readFileSync(join(receiptDir,file),"utf8"));
     if(!eq(record.transactionHash,entry.txHash)||
        !eq(record.approval?.sourceCommit,entry.sourceCommit)||
        !eq(record.deployer,entry.wallet)||
        record.chainId!==entry.chainId||record.component!==id.split(":")[1]||
        record.status!=="onchain-deployment-verified")continue;
     match="deployments/receipts/"+chain.name+"/"+file;
    }
   }catch(e){if(e.code!=="ENOENT")throw e}
   if(match && entry.stage==="confirmed"){
    journal.document(id,match);
    return {stage:"documented",receiptPath:match,recoveredFromGitHub:true};
   }
   // Same signed transaction may outlive an Admin code update. Continue
   // only when artifact bytes and on-chain constructor bindings still match.
  }
  const built=await build(root,commit);
  const artifact=built.artifacts[id.split(":")[1]];
  if(!artifact||artifact.artifactHash!==entry.artifactHash||
     (commit===entry.sourceCommit&&artifact.buildHash!==entry.buildHash))
   throw Error("Recompiled artifact differs from original wallet-intent build");
  const verified={...bootstrap,
   reserve:entry.parameters?.minimumWei?{minimumWei:entry.parameters.minimumWei,maxExecutorReimbursementWei:entry.parameters.maxExecutorReimbursementWei,perValidatorWei:entry.parameters.perValidatorWei}:bootstrap.reserve,
   proposedFeeWei:entry.parameters?.sourceFeeWei||bootstrap.proposedFeeWei,
   initialValidators:bootstrap.initialValidators};
  const result=await reconcileDeployedContract({
   root,entry,chain,bootstrap:verified,infrastructure,artifact,rpc,url:chain.rpcUrls[0]});
  if(result.pending)return {stage:"pending",reason:result.reason,txHash:entry.txHash};
  if(!previouslyConfirmed)journal.confirm(id,entry.txHash,{
   contractAddress:result.contractAddress,runtimeKeccak:result.runtimeKeccak});
  // Preserve original GitHub issue on failure: do not erase confirmed intent.
  const inputs=[{...result.input,sourceCommit:commit}];
  if(id.endsWith(":transportBundle")){
   const transport=await verifyTransportChildren({rpc,url:chain.rpcUrls[0],
    bundle:result.contractAddress,chain,
    ism:infrastructure.components.find(p=>p.key==="ism")?.address,
    artifacts:built.artifacts,blockNumber:result.verified.blockNumber});
   for(const [component,child] of Object.entries(transport))inputs.push({
    sourceCommit:commit,chain:chain.name,component,
    contractAddress:child.address,txHash:entry.txHash,
    expectedRuntimeKeccak256:child.runtimeKeccak,expectedDeployer:entry.wallet,
    provenance:{kind:component==="mailbox"?"transport-mailbox":
      component==="dispatchHook"?"transport-dispatch-hook":"transport-unknown",
      factory:result.contractAddress}
   });
  }
  const published=await publish(root,inputs,{rpc});
  // The publisher verified GitHub's new main ref. Finalize this intent now:
  // the Admin service cannot git-pull inside its read-only deployment.
  // The next transaction is gated until ./manage.sh update syncs main.
  if(!/^[a-f0-9]{40}$/i.test(published.commit||""))
   throw Error("GitHub publisher did not return a new main commit; intent retained");
  const path=deploymentReceiptPath(result.verified);
  journal.document(id,path);
  let autoSyncQueued=false;
  try{queueDeploymentSync(stateDir,published.commit);autoSyncQueued=true;}
  catch(error){console.error("XITA deployment sync needs attention:",String(error.message||error));}
  return {stage:"documented",receiptPath:path,commit:published.commit,
   address:result.contractAddress,txHash:entry.txHash,checkoutUpdateRequired:true,autoSyncQueued};
 }
 async function cancelPrepared({id,createdAt}){
  const all=approvedWorkInventory(root);
  const j=journals(all.chains);
  const e=j.read().entries[id];
  if(!e||e.createdAt!==createdAt||e.stage!=="prepared")
   throw Error("Only exact prepared draft can be cancelled");
  const chain=all.chains.find(c=>c.chainId===e.chainId);
  if(!chain)throw Error("Unknown chain");
  const inf=infrastructureInventory(root,[chain])[0];
  if(inf.components.some(c=>c.key===id.split(":")[1]&&c.status==="documented"))
   throw Error("Contract already documented in GitHub");
  await verifyPrepared({entry:e,chain,rpc});
  return j.cancelPrepared(id,createdAt);
 }
 async function resume({chain:chainName,component=null}){
  const all=inventory();
  const chain=all.chains.find(c=>c.name===chainName);
  if(!chain)throw Error("Unapproved deployment chain");
  // A verified, published GitHub receipt is final even if an older
  // submitted WAL record survived a process restart or lost HTTP reply.
  // The normal chain plan must never wait for an obsolete journal row.
  const documented=new Set(infrastructureInventory(root,[chain])[0]
   .components.filter(c=>c.status==="documented").map(c=>c.key));
  if((component==="sourceRegistry"||component===null)&&
     !documented.has("sourceRegistry")){
   const {commit,infrastructure,bootstrap}=await approved(chainName);
   const recovered=await publishExistingSourceRegistry({
    chain,commit,infrastructure,bootstrap,journal:journals(all.chains)
   });
   if(recovered)return recovered;
  }
  const factory=infrastructureInventory(root,[chain])[0].components
   .find(c=>c.key==="factory"&&c.status==="documented");
  const approvedFactory=loadChainDeployment(root,chain).xitaV315?.components?.factory;
  let deploymentBlock=null;
  if(factory?.address&&approvedFactory?.receiptPath){
   const receipt=JSON.parse(readFileSync(join(root,approvedFactory.receiptPath),"utf8"));
   if(eq(receipt.address,factory.address)&&receipt.component==="factory"&&
      Number.isSafeInteger(receipt.blockNumber))deploymentBlock=receipt.blockNumber;
  }
  const scopedChains=all.chains.map(c=>c.name===chainName&&factory?.address
   ?{...c,sourceRegistryFactory:{address:factory.address,blockNumber:deploymentBlock}}
   :c);
  return resumeInterruptedDeployments({
   journal:journals(all.chains),chains:scopedChains,rpc,reconcile,
   include:entry=>!entry.asset&&entry.id.startsWith(chainName+":")&&
    (component===null||entry.id===chainName+":"+component)&&
    !documented.has(entry.id.split(":")[1])
  });
 }
 const status=()=>{
  const all=inventory();return journals(all.chains).read();
 };
 return {preview,prepare,hash,reconcile,cancelPrepared,resume,status};
}
