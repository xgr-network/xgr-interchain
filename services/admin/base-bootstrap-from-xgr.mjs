// Read-only public Base bootstrap precheck against the canonical XGRChain
// PoS StakingV2 contract. Does not require any Interchain Registry on either
// chain, does not use private validator keys, and never broadcasts a tx.
import {rpcCall} from "./inspector.mjs";
import {prepareBootstrapEvidence,parsePublicProof} from "./bootstrap-evidence.mjs";
import {validatePublicBootstrapProof,encodeBlsVerify} from "./bls-bootstrap-proof.mjs";
import {readFinalizedXgrPoSSnapshot,XGR_POS_STAKING_ADDRESS} from "./xgr-pos-snapshot.mjs";

const equal=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();

export async function prepareBaseFromXgr({
 xgrChain,baseChain,initial,bootstrap,proofs,
 rpc=rpcCall,verifyProof
}){
 if(initial?.originChainId!==1643||xgrChain?.chainId!==1643||
    baseChain?.chainId!==8453||baseChain?.domainId!==8453||
    bootstrap?.destinationDomain!==8453||
    !Array.isArray(initial.validators)||
    initial.validators.length<3||initial.validators.length>128||
    proofs?.length!==initial.validators.length)
  throw Error("Invalid pinned XGR PoS / Base bootstrap identity");
 const snapshot=await readFinalizedXgrPoSSnapshot({xgrChain,initial,rpc});
 const ordered=initial.validators;
 const vetted=proofs.map(p=>typeof p==="string"?parsePublicProof(p):p);
 for(let i=0;i<ordered.length;i++){
  if(!equal(vetted[i]?.validator,ordered[i])||
     !equal(vetted[i]?.blsPublicKey,snapshot.validators[i].validator.BLSPublicKey)||
     vetted[i]?.destinationDomain!==8453||vetted[i]?.originChainId!==1643)
   throw Error("Base-domain PoP differs from confirmed XGR PoS validator "+(i+1));
 }
 const verifyNative=async(proof)=>{
  const checked=validatePublicBootstrapProof(proof,{chain:baseChain,approvedValidators:ordered});
  const output=await rpc(xgrChain.rpcUrls[0],"eth_call",[{
   to:"0x0000000000000000000000000000000000002040",
   data:encodeBlsVerify(checked.payload,checked.compressedPublicKey,checked.compressedSignature),
   gas:"0x1e8480"
  },"latest"]);
  return {validator:proof.validator,verified:output==="0x"+"0".repeat(63)+"1"};
 };
 // The CLI proof is bound to Base domain 8453 even when the XGR native
 // verifier is used for an optional public precheck. Authorization to deploy
 // still requires actual verification on the target-chain verifier in Admin.
 const result=await prepareBootstrapEvidence({
  chain:baseChain,bootstrap,initial,originChain:xgrChain,snapshot,proofs:vetted,rpc,
  verifyProof:verifyProof||verifyNative
 });
 return {...result,
  staking:{address:XGR_POS_STAKING_ADDRESS,blockNumber:snapshot.number,
   blockHash:snapshot.hash,validators:snapshot.validators},
  proofMode:verifyProof?"destination-verifier":"xgr-native-precheck-only",
  destinationVerifierVerified:Boolean(verifyProof),deploymentAuthorized:false};
}
