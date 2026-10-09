export const statuses=["queued","preflight","deployment","verification","validator-approval-required","quorum-confirmed","activation","end-to-end-tests","completed","blocked"];
export function nextStatus(status){
 const i=statuses.indexOf(status);
 if(i<0||i===statuses.length-1)return null;
 return statuses[i+1];
}
export function validatorHandoff(job){
 if(!job||job.status!=="validator-approval-required")throw Error("Approval gate not reached");
 return {route:job.route,sourceChain:job.sourceChain,nonce:job.nonce,fee:job.fee,
  message:"Collect validator CLI signatures; do not treat GitHub approvals as governance"};
}
