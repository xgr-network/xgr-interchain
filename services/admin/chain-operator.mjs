// The only server-backed, main-authorized core deployment coordinator.
// EIP-1193 wallet signs in the browser. All transactions are server-authored;
// browser input may select chain/component and provide the public wallet/hash.
import {resolve} from "node:path";
import {checkedLocalMain} from "./main-gate.mjs";
import {recoverPublishedReceipt} from "./deployment-recovery.mjs";
import {assertCurrentMain,approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
import {readDeploymentReadiness} from "./deployment-readiness.mjs";
import {inspectConfiguredChain} from "./chain-preflight.mjs";
import {chainDraft,simulateChainDraft} from "./chain-transaction-draft.mjs";
import {trustedBuild} from "./trusted-artifacts.mjs";
import {reconcileDeployedContract} from "./chain-reconcile.mjs";
import {deploymentIntents} from "./deployment-intents.mjs";
import {verifyPrepared} from "./prepared-override.mjs";
import {publishDeploymentBatch,deploymentReceiptPath} from "./deployment-ledger.mjs";
import {rpcCall} from "./inspector.mjs";
import {deploymentParameters} from "./deployment-parameters.mjs";

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
  const journal=journals(all.chains);
  if(journal.read().entries[chain.name+":"+component])
   throw Error("Existing transaction must be recovered, never re-created");
  const preflight=await inspectConfiguredChain({chain,core:infrastructure.hyperlane,rpc,bootstrap});
  if(!preflight.basicRpcPreflightOK)throw Error("Chain or BLS preflight failed");
  let verified=bootstrap;
  if(component==="validatorRegistry"){
   const readiness=await readDeploymentReadiness({root,chain,inventory:all,boot:bootstrap,
     baseDir:publicEvidenceDir,mainCurrent:true,rpc});
   if(!readiness.evidenceVerified||readiness.verifiedValidatorCount!==3||
      !readiness.verifiedSnapshot?.validators?.length)
    throw Error("Three independently verified validator proofs required");
   verified={...bootstrap,validatorCount:3,expectedValidatorCount:3,
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
    depositWei:BigInt(draft.transaction.value).toString(),
    parameters:values,mode:"preview-only-no-broadcast-local-clean-main"};
 }
 async function prepare({chain:chainName,component,wallet,parameters={}}){
  if(!ADDRESS.test(wallet||""))throw Error("Connect a valid EIP-1193 wallet");
  const {commit,inventory:all,chain,infrastructure,bootstrap}=await approved(chainName);
  await requireVersionThree(chain,infrastructure,component);
  const journal=journals(all.chains);
  if(journal.read().entries[chain.name+":"+component])
   throw Error("Existing wallet intent must be reconciled before any new request");
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
   if(!readiness.evidenceVerified||readiness.verifiedValidatorCount!==3||
      !readiness.verifiedSnapshot?.validators?.length)
    throw Error("Independently verified PoS/BLS public snapshot unavailable");
   verified={...bootstrap,validatorCount:3,expectedValidatorCount:3,
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
  });
  return {mode:"await-wallet-confirmation",commit,id:item.id,chain:chain.name,
   chainId:chain.chainId,component,buildHash:artifact.buildHash,
   simulation:{gas:transaction.gas,gasPriceWei:simulation.gasPriceWei,
    totalWorstCaseWei:simulation.totalWorstCaseWei},
   transaction,warning:"If wallet broadcast status is uncertain do not retry; reconcile nonce/hash."};
 }
 async function hash({id,txHash}){
  if(!TX.test(txHash||""))throw Error("Invalid signed transaction hash");
  const all=inventory();
  const journal=journals(all.chains);
  const record=journal.read().entries[id];
  if(!record)throw Error("Unknown deployment intent");
  // A submitted hash MUST be for the pinned payload. May be pending or mined.
  const chain=all.chains.find(c=>c.chainId===record.chainId);
  const tx=await rpc(chain.rpcUrls[0],"eth_getTransactionByHash",[txHash]);
  if(!tx)throw Error("Hash not yet visible on RPC; intent remains locked");
  if(!eq(tx.from,record.wallet)||!eq(tx.input,record.transaction.data)||
     BigInt(tx.nonce)!==BigInt(record.transaction.nonce)||
     BigInt(tx.value)!==BigInt(record.transaction.value)||
     (record.transaction.to===null?tx.to!==null:!eq(tx.to,record.transaction.to)))
   throw Error("Wallet submitted non-matching transaction");
  return journal.attachHash(id,txHash);
 }
 async function reconcile({id}){
  const all=inventory(),journal=journals(all.chains),entry=journal.read().entries[id];
  if(!entry)throw Error("Unknown deployment intent");
  const chain=all.chains.find(c=>c.chainId===entry.chainId);
  if(!chain||id!==chain.name+":"+id.split(":")[1])throw Error("Unknown chain");
  if(entry.stage==="prepared")
   throw Error("Wallet hash not reconciled; inspect sender nonce before any retry");
  // Check remote GitHub main for an already published receipt; no git pull
  // or second transaction is allowed inside the read-only Admin service.
  const previouslyConfirmed=entry.stage==="confirmed";
  if(previouslyConfirmed){
   const recovered=await recoverPublishedReceipt({
    entry,chain,component:id.split(":")[1],rpc
   });
   if(recovered){
    journal.document(id,recovered.receiptPath);
    return {stage:"documented",receiptPath:recovered.receiptPath,
     commit:recovered.commit,address:recovered.address,txHash:entry.txHash,
     recoveredFromGitHub:true,serverUpdateRequired:checkedLocalMain(root)!==recovered.commit};
   }
  }
  const {commit,infrastructure,bootstrap}=await approved(chain.name);
  const built=await build(root,commit);
  const artifact=built.artifacts[id.split(":")[1]];
  if(!artifact||artifact.artifactHash!==entry.artifactHash||
     (commit===entry.sourceCommit&&artifact.buildHash!==entry.buildHash))
   throw Error("Recompiled artifact differs from original wallet-intent build");
  const verified={...bootstrap,
   reserve:entry.parameters?.minimumWei?{minimumWei:entry.parameters.minimumWei,maxExecutorReimbursementWei:entry.parameters.maxExecutorReimbursementWei,perValidatorWei:entry.parameters.perValidatorWei}:bootstrap.reserve,
   proposedFeeWei:entry.parameters?.sourceFeeWei||bootstrap.proposedFeeWei,
   initialValidators:bootstrap.initialValidators};
  const effectiveChain={...chain,defaultDestinationGasLimit:entry.parameters?.defaultDestinationGasLimit||chain.defaultDestinationGasLimit};
  const result=await reconcileDeployedContract({
   root,entry,chain:effectiveChain,bootstrap:verified,infrastructure,artifact,rpc,url:chain.rpcUrls[0]});
  if(result.pending)return {stage:"pending",reason:result.reason,txHash:entry.txHash};
  if(!previouslyConfirmed)journal.confirm(id,entry.txHash,{
   contractAddress:result.contractAddress,runtimeKeccak:result.runtimeKeccak});
  // Preserve original GitHub issue on failure: do not erase confirmed intent.
  const published=await publish(root,[{...result.input,sourceCommit:commit}],{rpc});
  // GitHub now has a NEW main SHA. The next UI step must immediately use
  // that approved manifest, not a stale server checkout or a second TX.
  if(!/^[a-f0-9]{40}$/i.test(published.commit||""))
   throw Error("GitHub publisher did not return a new main commit; intent retained");
  if(checkedLocalMain(root)!==commit)
   throw Error("Local main moved during receipt publication; intent retained");
  // The GitHub fast-forward commit is the publication receipt. The
  // operator refreshes the read-only checkout using manage.sh update.
  const path=deploymentReceiptPath(result.verified);
  journal.document(id,path);
  return {stage:"documented",receiptPath:path,commit:published.commit,
   address:result.contractAddress,txHash:entry.txHash};
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
 const status=()=>{
  const all=inventory();return journals(all.chains).read();
 };
 return {preview,prepare,hash,reconcile,cancelPrepared,status};
}
