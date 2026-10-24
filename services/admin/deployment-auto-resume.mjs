// A normal Deploy click also resumes any interrupted transaction. Users never
// have to locate hashes, delete WAL files or choose a separate recovery path.
// Existing confirmed or in-flight transactions are reused; only a provably
// unused, failed, replaced or mined-but-untraceable nonce gets a fresh wallet
// request. Every fresh request still requires an explicit MetaMask signature.
import {classifyInterruptedDeployment} from "./deployment-auto-recovery.mjs";
import {isPreResetIntent} from "./deployment-generation.mjs";

export async function resumeInterruptedDeployments({
 journal,chains,rpc,reconcile,include,root=null
}){
 if(!journal||!Array.isArray(chains)||typeof rpc!=="function"||
    typeof reconcile!=="function"||typeof include!=="function")
  throw Error("Incomplete automatic deployment continuation");
 const existing=Object.values(journal.read().entries)
  .filter(include)
  .sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
 let retiredPrevious=null;
 for(const original of existing){
  const current=journal.read().entries[original.id];
  if(!current)continue;
  const chain=chains.find(c=>c.chainId===current.chainId);
  if(!chain)throw Error("Interrupted deployment chain not configured");
  // Exactly provable pre-hard-reset WAL entries are outside this Direct-BLS
  // generation. Never confuse them with confirmations for a fresh deployment.
  if(root&&isPreResetIntent(root,current)){
   retiredPrevious=journal.discardPreResetIntent({id:current.id,createdAt:current.createdAt,root});
   continue;
  }
  const verdict=await classifyInterruptedDeployment({entry:current,chain,rpc});
  if(verdict.action==="pending")
   return {stage:"pending",id:current.id,chain:chain.name,
    reason:verdict.reason,txHash:current.txHash||null};
  if(verdict.action==="retry"){
   const retired=journal.retireForFreshWalletAttempt({
    id:current.id,createdAt:current.createdAt,reason:verdict.reason
   });
   // The receipt/code might be untraceable on a pruning RPC. We explicitly
   // tell the UI that a NEW MetaMask tx can duplicate prior gas/deployment.
   retiredPrevious={...retired,warning:verdict.warning||null,
    chain:chain.name,id:current.id};
   // Another unresolved entry from this batch may still be pending. Do not
   // sign any new transaction before all earlier intents have been checked.
   continue;
  }
  if(verdict.action!=="reconcile")throw Error("Unknown recovery classification");
  if(verdict.txHash){
   if(current.stage==="prepared")journal.attachHash(current.id,verdict.txHash);
   else if(current.txHash?.toLowerCase()!==verdict.txHash.toLowerCase())
    journal.adoptObservedHash(current.id,current.createdAt,verdict.txHash);
  }
  try{
   const outcome=await reconcile({id:current.id});
   if(outcome.stage==="documented")
    return {...outcome,id:current.id,chain:chain.name,automaticallyRecovered:true};
   if(outcome.stage==="pending")
    return {...outcome,id:current.id,chain:chain.name};
   throw Error("Unexpected auto-reconcile stage: "+outcome.stage);
  }catch(e){
   // Nonce/receipt classification can be retried on next ordinary Deploy
   // click. Never throw an instruction to manually recover or blindly drop
   // a transaction that may have succeeded.
   return {stage:"pending",id:current.id,chain:chain.name,
    txHash:current.txHash||verdict.txHash||null,
    reason:"automatic-verification-pending",
    detail:String(e.message||e).slice(0,220)};
  }
 }
 return retiredPrevious||{stage:"ready"};
}
