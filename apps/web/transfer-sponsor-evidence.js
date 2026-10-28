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
 return evidence.upfrontRequired===true&&["confirmed","spendable"].includes(evidence.status);
}

// This is not a sponsorship inference from an ExecutionGateway fee.
// It is an independently indexed exact-match immutable quote and COUNT=0
// of committed grants. All unknown/mismatched/positive commitments fail closed.
export function verifiedZeroGrantSource(row,expected){
 return Boolean(row&&expected&&
  row.confirmed===true&&row.sponsorCommitmentEvidence==="no-grants"&&
  row.account?.toLowerCase()===expected.account?.toLowerCase()&&
  row.sourceChain===expected.sourceChain&&
  row.txHash?.toLowerCase()===expected.txHash?.toLowerCase()&&
  row.messageId?.toLowerCase()===expected.messageId?.toLowerCase()&&
  row.executionAdapter?.toLowerCase()===expected.executionAdapter?.toLowerCase()&&
  String(row.interchainFeeWei)===String(expected.interchainFeeWei));
}
