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

/**
 * One automatic wallet intent per source/message/stage while the dialog is open.
 * Only a wallet-request callback makes a step terminal. Transient read-only
 * preflight failures never consume the wallet intent; they get a bounded,
 * gradually increasing retry delay. The main process owns the timer so closing
 * the dialog cannot start a signing request.
 */
export function createAutomaticWalletAttemptLedger({now=Date.now}={}){
 if(typeof now!=="function")throw Error("Clock must be a function");
 const prompted=new Set(),pending=new Map();
 return {
  canStart(key){
   return Boolean(key)&&!prompted.has(key)&&
    (pending.get(key)?.retryAt??0)<=now();
  },
  retryAt(key){return pending.get(key)?.retryAt??null;},
  walletRequested(key){return Boolean(key)&&prompted.has(key);},
  markWalletRequested(key){
   if(!key)return;
   prompted.add(key);
   pending.delete(key);
  },
  schedulePreflightRetry(key){
   if(!key||prompted.has(key))return null;
   const attempts=Math.min(12,(pending.get(key)?.attempts||0)+1);
   // Retry at 12s / 24s / 48s / 90s maximum. No tight RPC loops.
   const delay=Math.min(90000,12000*2**Math.min(3,attempts-1));
   const retryAt=now()+delay;
   pending.set(key,{attempts,retryAt});
   return retryAt;
  },
  reset(){prompted.clear();pending.clear();}
 };
}
