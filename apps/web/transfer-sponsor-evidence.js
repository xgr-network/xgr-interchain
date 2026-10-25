// Only a parent-bound immutable sponsor commitment warrants a transfer-stage gate.
// Paying an ExecutionGateway fee is not proof of gas sponsorship.
export function transferSponsorVisible(state,key){
 return Boolean(key&&state?.key===key&&state.upfrontRequired===true);
}
export function sponsorAllowsContinuation(evidence){
 if(evidence?.ok!==true)return false;
 // A quote with no committed gas grants must never wait for the sponsor worker.
 if(evidence.upfrontRequired===false)return evidence.status==="not-required";
 // Promised gas grants remain a strict pre-TX2 security/economic gate.
 return evidence.upfrontRequired===true&&evidence.status==="confirmed";
}
