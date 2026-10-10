// The only server-backed, main-authorized core deployment coordinator.
// EIP-1193 wallet signs in the browser. All transactions are server-authored;
// browser input may select chain/component and provide the public wallet/hash.
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {checkedLocalMain} from "./main-gate.mjs";
import {readdirSync,readFileSync} from "node:fs";
import {assertCurrentMain,approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
import {readDeploymentReadiness} from "./deployment-readiness.mjs";
import {inspectConfiguredChain} from "./chain-preflight.mjs";
import {chainDraft,simulateChainDraft} from "./chain-transaction-draft.mjs";
import {trustedBuild} from "./trusted-artifacts.mjs";
import {reconcileDeployedContract} from "./chain-reconcile.mjs";
import {deploymentIntents} from "./deployment-intents.mjs";
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
 async function approved(chainName){
  const commit=await mainCheck(root);
  const all=inventory();
  const chain=all.chains.find(c=>c.name===chainName);
  if(!chain)throw Error("Chain absent from current GitHub main");
  const infrastructure=infrastructureInventory(root,[chain])[0];
  const bootstrap=bootstrapPlan(root,chain);
  return {commit,inventory:all,chain,infrastructure,bootstrap};
 }
 async function preview({chain:chainName,component,wallet,parameters={}}){
  if(!ADDRESS.test(wallet||""))throw Error("Connect a valid wallet");
  const {commit,inventory:all,chain,infrastructure,bootstrap}=await approved(chainName);
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
  const draft=chainDraft({root,chain,infrastructure,bootstrap:verified,component,parameters:values});
  const artifact=compiled.artifacts[component];
  if(!artifact)throw Error("Missing trusted artifact");
  if(component!=="sourceRegistry"&&!eq(draft.transaction.data.slice(0,artifact.creation.length),artifact.creation))
   throw Error("Creation bytecode differs from trusted artifact");
  const simulation=await simulateChainDraft(draft,{rpc,url:chain.rpcUrls[0],from:wallet});
  return {chain:chain.name,component,sourceCommit:commit,
    gasEstimateWei:simulation.gasEstimateWei,gasLimit:simulation.gasLimit,
    gasPriceWei:simulation.gasPriceWei,totalWorstCaseWei:simulation.totalWorstCaseWei,
    depositWei:BigInt(draft.transaction.value).toString(),
    parameters:values,mode:"preview-only-no-broadcast"};
 }
 async function prepare({chain:chainName,component,wallet,parameters={}}){
  if(!ADDRESS.test(wallet||""))throw Error("Connect a valid EIP-1193 wallet");
  const {commit,inventory:all,chain,infrastructure,bootstrap}=await approved(chainName);
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
  const draft=chainDraft({root,chain,infrastructure,bootstrap:verified,component,parameters:values});
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
  if(entry.stage==="documented")return {stage:"documented",receiptPath:entry.receiptPath};
  if(entry.stage==="prepared")
   throw Error("Wallet hash not reconciled; inspect sender nonce before any retry");
  // A confirmed transaction may have lost GitHub connectivity. Always
  // re-verify the SAME tx and retry only the GitHub append, never broadcast.
  const previouslyConfirmed=entry.stage==="confirmed";
  // A confirmed hash cannot cause another broadcast. Refresh verified
  // GitHub receipt state in case the writer succeeded before an HTTP loss.
  if(entry.stage==="confirmed"){
   checkedLocalMain(root);
   execFileSync("git",["pull","--ff-only","origin","main"],{
    cwd:root,encoding:"utf8",timeout:30000,maxBuffer:1024*512
   });
  }
  // A new main may have advanced independently after signature. Never replace
  // sourceCommit to evade the main-only publisher check.
  const {commit,infrastructure,bootstrap}=await approved(chain.name);
  if(commit!==entry.sourceCommit){
   // GitHub may have accepted a receipt before the HTTP response was lost.
   // Only an immutable, exact source-commit/tx/wallet receipt can settle it.
   const receiptDir=join(root,"deployments/mainnet/receipts",chain.name);
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
     match="deployments/mainnet/receipts/"+chain.name+"/"+file;
    }
   }catch(e){if(e.code!=="ENOENT")throw e}
   if(match && entry.stage==="confirmed"){
    journal.document(id,match);
    return {stage:"documented",receiptPath:match,recoveredFromGitHub:true};
   }
   throw Error("GitHub main advanced; hold signed transaction for manual source-commit reconciliation");
  }
  const built=await build(root,commit);
  const artifact=built.artifacts[id.split(":")[1]];
  if(artifact.buildHash!==entry.buildHash||artifact.artifactHash!==entry.artifactHash)
   throw Error("Recompiled artifact differs from original wallet-intent build");
  const verified={...bootstrap,
   reserve:entry.parameters?.minimumWei?{minimumWei:entry.parameters.minimumWei,maxExecutorReimbursementWei:entry.parameters.maxExecutorReimbursementWei,perValidatorWei:entry.parameters.perValidatorWei}:bootstrap.reserve,
   proposedFeeWei:entry.parameters?.sourceFeeWei||bootstrap.proposedFeeWei,
   initialValidators:bootstrap.initialValidators};
  const effectiveChain={...chain,defaultDestinationGasLimit:entry.parameters?.defaultDestinationGasLimit||chain.defaultDestinationGasLimit};
  const result=await reconcileDeployedContract({
   root,entry,chain:effectiveChain,bootstrap:verified,infrastructure,artifact,rpc,url:chain.rpcUrls[0]});
  if(!previouslyConfirmed)journal.confirm(id,entry.txHash,{
   contractAddress:result.contractAddress,runtimeKeccak:result.runtimeKeccak});
  // Preserve original GitHub issue on failure: do not erase confirmed intent.
  const published=await publish(root,[result.input],{rpc});
  // GitHub now has a NEW main SHA. The next UI step must immediately use
  // that approved manifest, not a stale server checkout or a second TX.
  if(!/^[a-f0-9]{40}$/i.test(published.commit||""))
   throw Error("GitHub publisher did not return a new main commit; intent retained");
  if(checkedLocalMain(root)!==entry.sourceCommit)
   throw Error("Local main moved during receipt publication; intent retained");
  execFileSync("git",["pull","--ff-only","origin","main"],{
   cwd:root,encoding:"utf8",timeout:30000,maxBuffer:1024*512
  });
  if(checkedLocalMain(root)!==published.commit.toLowerCase())
   throw Error("Post-publication checkout differs from GitHub receipt commit");
  const path=deploymentReceiptPath(result.verified);
  journal.document(id,path);
  return {stage:"documented",receiptPath:path,commit:published.commit,
   address:result.contractAddress,txHash:entry.txHash};
 }
 const status=()=>{
  const all=inventory();return journals(all.chains).read();
 };
 return {preview,prepare,hash,reconcile,status};
}
