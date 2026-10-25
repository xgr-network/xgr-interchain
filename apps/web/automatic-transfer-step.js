// Transfer modal wallet intent: observer evidence may trigger one local wallet
// request. Read-only transfer/status refresh never authorizes a transaction.
// startTransfer()/resumeDelivery() independently reverify chain evidence.
const HASH=/^0x[0-9a-f]{64}$/i;
const ready=(proof,now)=>proof?.state==="ready"&&
 Number.isFinite(Date.parse(proof.checkedAt||""))&&
 now>=Date.parse(proof.checkedAt)&&now-Date.parse(proof.checkedAt)<180000;
export function nextVerifiedWalletStep(record,{now=Date.now()}={}){
 if(!record?.confirmed||!HASH.test(record.messageId||""))return null;
 if(record.status==="awaiting-onward"&&record.delivered===true&&
    HASH.test(record.onwardRouteId||"")&&record.finalDestinationChain&&
    !HASH.test(record.secondHopTxHash||""))
  return {kind:"onward-source",identity:record.messageId.toLowerCase()};
 if(record.status==="awaiting-proof"&&record.delivered===false&&
    ready(record.proofObservation,now))
  return {kind:"first-delivery",identity:record.messageId.toLowerCase()};
 if(record.status==="awaiting-final-proof"&&record.delivered===true&&
    HASH.test(record.secondHopTxHash||"")&&HASH.test(record.secondHopMessageId||"")&&
    ready(record.finalProofObservation,now))
  return {kind:"final-delivery",identity:record.secondHopMessageId.toLowerCase()};
 return null;
}
export function walletStepKey(binding,step){
 if(!binding||!step||!HASH.test(binding.sourceTxHash||"")||
    !/^[a-z-]+$/.test(step.kind||"")||!HASH.test(step.identity||""))
  return null;
 return binding.key+":"+step.kind+":"+step.identity;
}

// A ready proof starts an unsigned, independently checked wallet preflight.
// Optional sponsorship status is NOT an admission gate here: a paid Execution
// Gateway fee does not prove gas grants were promised. The TX2 path separately
// verifies original quote commitments BEFORE any wallet signature is requested.
export function automaticWalletPreflightKey({binding,open=false,working=false,
 scanning=false,attemptedKeys=null,now=Date.now()}={}){
 if(!open||working||scanning)return null;
 const key=walletStepKey(binding,nextVerifiedWalletStep(binding?.record,{now}));
 return key&&!attemptedKeys?.has(key)?key:null;
}
