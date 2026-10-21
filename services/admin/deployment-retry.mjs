// One Deploy click first resolves the PREVIOUS intent for that exact component.
// No failed or abandoned deployment is published as a contract on GitHub.
// A real submitted/successful transaction is reconciled, never broadcast twice.
export async function recoverBeforeWalletSignature({journal,chain,component,resume}){
 if(!journal||!chain?.name||typeof component!=="string"||
    typeof resume!=="function")
  throw Error("Missing chain deployment retry coordinator");
 const id=chain.name+":"+component;
 if(!journal.read().entries[id])return null;
 const result=await resume({chain:chain.name,component});
 if(result?.stage==="ready")return result;
 if(result?.stage==="documented")
  throw Error("Previous "+id+" transaction was verified and documented in GitHub. Refresh the deployment list; no second wallet signature is needed.");
 if(result?.stage==="pending"){
  const hash=result.txHash?" TX "+result.txHash+".":"";
  const detail=String(result.detail||result.reason||"receipt pending").slice(0,220);
  throw Error("Previous "+id+" deployment still needs verification."+hash+
   " "+detail+". No new MetaMask signature has been requested; retry this button to check its status.");
 }
 throw Error("Unexpected deployment recovery status: "+String(result?.stage||"unknown"));
}
