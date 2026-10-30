// Always check an existing write-ahead wallet intent before offering another signature.
// The server reconciles published receipts, holds pending transactions, and retires
// independently proven unused/failed nonces. GitHub main remains the deployment index.
export async function advanceDeploymentBeforeSignature({post,type,target}){
 if(typeof post!=="function"||!["chain","asset"].includes(type)||typeof target!=="string"||!target)
  throw Error("Invalid deployment continuation");
 const answer=await post("/admin/api/deploy/advance",{type,target});
 const result=answer?.result;
 if(!result||!["ready","pending","documented"].includes(result.stage))
  throw Error("Invalid deployment recovery response");
 return result;
}
