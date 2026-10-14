// Compatibility wrapper for the optional Base public Genesis precheck.
// Initial membership is explicitly selected; no XGR PoS/Interchain query.
import {rpcCall} from "./inspector.mjs";
import {prepareBootstrapEvidence} from "./bootstrap-evidence.mjs";
export async function prepareBaseFromXgr({
 xgrChain,baseChain,initial,bootstrap,proofs,rpc=rpcCall,verifyProof
}){
 if(xgrChain?.chainId!==1643||baseChain?.chainId!==8453||
    baseChain.domainId!==8453||bootstrap?.destinationDomain!==8453||
    initial?.originChainId!==1643||
    !Array.isArray(initial.validators)||initial.validators.length<3||
    initial.validators.length>128||proofs?.length!==initial.validators.length)
  throw Error("Invalid pinned Interchain Genesis / Base bootstrap identity");
 const result=await prepareBootstrapEvidence({
  chain:baseChain,bootstrap,initial,proofs,rpc,
  ...(verifyProof?{verifyProof}:{})
 });
 return {...result,proofMode:"destination-verifier",
  destinationVerifierVerified:true,deploymentAuthorized:false};
}
