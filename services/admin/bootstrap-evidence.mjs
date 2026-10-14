// Assemble a proposed, public bootstrap manifest after independent read-only
// checks. Neither this module nor its CLI authorizes on-chain transactions.
import {validatePublicBootstrapProof,verifyPublicBootstrapOnChain} from "./bls-bootstrap-proof.mjs";
import {rpcCall} from "./inspector.mjs";
const ADDR=/^0x[a-f0-9]{40}$/i;
const eq=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
export function parsePublicProof(text){
 if(typeof text!=="string"||!text.trim())throw Error("Empty public bootstrap proof");
 if(text.trimStart().startsWith("{")){
  const raw=JSON.parse(text);
  return raw.result||raw;
 }
 const entries=text.split(/\r?\n/).filter(s=>s.includes("|")).map(line=>{
  const pos=line.indexOf("|");
  return [line.slice(0,pos).trim(),line.slice(pos+1).trim()];
 });
 const fields=Object.fromEntries(entries);
 return {validator:fields["Validator"],originChainId:Number(fields["Origin chain ID"]),
  destinationDomain:Number(fields["Destination domain"]),blsPublicKey:fields["BLS public key"],
  blsPublicKeyEIP2537:fields["BLS public key EIP-2537"],payload:fields["Payload"],
  possessionProof:fields["Possession proof EIP-2537"]};
}
// Initial Interchain membership is a hand-approved Genesis selection, not
// a dynamically inferred XGR PoS snapshot. Each public CLI proof is bound to
// its destination domain and independently checked by THAT chain's verifier.
// No origin RPC, PoS Registry, snapshot or extra chain transaction is needed.
export async function prepareBootstrapEvidence({
 chain,bootstrap,initial,proofs,rpc=rpcCall,
 verifyProof=verifyPublicBootstrapOnChain
}){
 if(!chain||!bootstrap||!initial||!Array.isArray(proofs))
  throw Error("Incomplete explicit Interchain Genesis");
 if(bootstrap.chain!==chain.name||bootstrap.chainId!==chain.chainId||
    bootstrap.destinationDomain!==chain.domainId||
    bootstrap.verifierFormat!==chain.blsVerifierFormat||
    bootstrap.membershipOriginChainId!==initial.originChainId||
    initial.originChainId!==1643)
  throw Error("Genesis chain and origin identity mismatch");
 const approved=initial.validators;
 if(!Array.isArray(approved)||approved.length<3||approved.length>128||
    new Set(approved.map(x=>String(x).toLowerCase())).size!==approved.length||
    !approved.every(x=>ADDR.test(x))||proofs.length!==approved.length)
  throw Error("Missing or duplicate explicit Genesis validator proofs");
 const proofMap=new Map();
 for(const raw of proofs){
  const proof=typeof raw==="string"?parsePublicProof(raw):raw;
  const key=String(proof?.validator||"").toLowerCase();
  if(!ADDR.test(key)||proofMap.has(key))throw Error("Duplicate or invalid Genesis proof identity");
  proofMap.set(key,proof);
 }
 const validators=[],keys=new Set();
 for(const address of approved){
  const proof=proofMap.get(address.toLowerCase());
  if(!proof)throw Error("Public Genesis BLS proof missing for validator: "+address);
  const reconstructed=validatePublicBootstrapProof(proof,{chain,approvedValidators:approved});
  const compressed=reconstructed.compressedPublicKey.toLowerCase();
  if(keys.has(compressed))throw Error("Duplicate BLS key in approved Interchain Genesis");
  keys.add(compressed);
  const verified=await verifyProof(proof,{chain,bootstrap,approvedValidators:approved,rpc});
  if(verified?.verified!==true||!eq(verified.validator,address))
   throw Error("BLS proof rejected by destination verifier: "+address);
  validators.push({address,originChainId:1643,destinationDomain:chain.domainId,
   blsPublicKeyCompressed:reconstructed.compressedPublicKey,
   blsPublicKeyEIP2537:proof.blsPublicKeyEIP2537,
   possessionProof:chain.blsVerifierFormat==="compressed"?
    reconstructed.compressedSignature:proof.possessionProof});
 }
 const candidate=structuredClone(bootstrap);
 candidate.validatorSnapshot={...candidate.validatorSnapshot,
  blockNumber:null,blockHash:null,validators,
  notes:"Explicit initial Interchain Genesis; public chain-domain BLS possession proofs verified against destination verifier. No PoS snapshot or origin Interchain Registry."};
 return {candidate,report:{chain:chain.name,originChainId:1643,
  snapshotBlock:null,snapshotHash:null,originHeadAtCheck:null,
  confirmedDepth:null,verifiedValidatorCount:validators.length,
  verification:"destination-verifier-verified-genesis",deploymentAuthorized:false}};
}
