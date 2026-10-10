// Assemble a proposed, public bootstrap manifest after independent read-only
// checks. Neither this module nor its CLI authorizes on-chain transactions.
import {validatePublicBootstrapProof,verifyPublicBootstrapOnChain} from "./bls-bootstrap-proof.mjs";
import {rpcCall} from "./inspector.mjs";
const HASH=/^0x[a-f0-9]{64}$/i,ADDR=/^0x[a-f0-9]{40}$/i;
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
export async function prepareBootstrapEvidence({
 chain,bootstrap,initial,originChain,snapshot,proofs,rpc=rpcCall,
 verifyProof=verifyPublicBootstrapOnChain
}){
 if(!chain||!bootstrap||!initial||!originChain||!snapshot||!Array.isArray(proofs))
  throw Error("Incomplete bootstrap input");
 if(bootstrap.chain!==chain.name||bootstrap.chainId!==chain.chainId||
    bootstrap.destinationDomain!==chain.domainId||
    bootstrap.verifierFormat!==chain.blsVerifierFormat||
    bootstrap.membershipOriginChainId!==initial.originChainId||
    originChain.chainId!==initial.originChainId)
  throw Error("Bootstrap chain and origin identity mismatch");
 const approved=initial.validators;
 if(!Array.isArray(approved)||approved.length<1||new Set(approved.map(x=>x.toLowerCase())).size!==approved.length||
    !approved.every(x=>ADDR.test(x))||proofs.length!==approved.length)
  throw Error("Missing or duplicate pinned validator proofs");
 if(!Number.isSafeInteger(snapshot.number)||snapshot.number<1||!HASH.test(snapshot.hash)||
    !Array.isArray(snapshot.validators)||snapshot.validators.length<approved.length)
  throw Error("Invalid PoS validator snapshot");
 if(!/^https:\/\//.test(originChain.rpcUrls?.[0]||""))throw Error("Invalid origin RPC");
 const url=originChain.rpcUrls[0];
 const [id,head,block]=await Promise.all([
  rpc(url,"eth_chainId",[]),rpc(url,"eth_blockNumber",[]),
  rpc(url,"eth_getBlockByNumber",["0x"+snapshot.number.toString(16),false])
 ]);
 if(BigInt(id)!==BigInt(originChain.chainId))throw Error("Canonical origin RPC chain mismatch");
 if(!block||!eq(block.hash,snapshot.hash)||BigInt(block.number)!==BigInt(snapshot.number))
  throw Error("PoS snapshot block hash differs from canonical RPC block");
 const confirmations=originChain.confirmations;
 if(!Number.isSafeInteger(confirmations)||confirmations<1||
    BigInt(head)<BigInt(snapshot.number+confirmations))
  throw Error("PoS snapshot block not sufficiently confirmed");
 const memberMap=new Map();
 for(const row of snapshot.validators){
  const address=row?.validator?.Address,key=row?.validator?.BLSPublicKey;
  if(!ADDR.test(address||"")||!/^0x[a-f0-9]{96}$/i.test(key||"")||
     memberMap.has(address.toLowerCase()))
   throw Error("Malformed or duplicated PoS validator entry");
  memberMap.set(address.toLowerCase(),key);
 }
 const proofMap=new Map();
 for(const raw of proofs){
  const proof=typeof raw==="string"?parsePublicProof(raw):raw;
  const key=String(proof?.validator||"").toLowerCase();
  if(!ADDR.test(key)||proofMap.has(key))throw Error("Duplicate or invalid proof identity");
  proofMap.set(key,proof);
 }
 const validators=[];
 for(const address of approved){
  const proof=proofMap.get(address.toLowerCase());
  const posKey=memberMap.get(address.toLowerCase());
  if(!proof||!posKey)throw Error("Initial validator missing from proof or canonical PoS snapshot: "+address);
  if(!eq(posKey,proof.blsPublicKey))throw Error("PoS and proof BLS public keys differ: "+address);
  const reconstructed=validatePublicBootstrapProof(proof,{chain,approvedValidators:approved});
  const verified=await verifyProof(proof,{chain,bootstrap,approvedValidators:approved,rpc});
  if(verified?.verified!==true||!eq(verified.validator,address))
   throw Error("BLS proof not verified by configured destination verifier: "+address);
  if(!["compressed","eip2537"].includes(chain.blsVerifierFormat))
   throw Error("Unapproved BLS verifier format");
  validators.push({address,originChainId:initial.originChainId,
   destinationDomain:chain.domainId,blsPublicKeyCompressed:proof.blsPublicKey,
   blsPublicKeyEIP2537:proof.blsPublicKeyEIP2537,
   possessionProof:chain.blsVerifierFormat==="compressed"?
    reconstructed.compressedSignature:proof.possessionProof});
 }
 const candidate=structuredClone(bootstrap);
 candidate.validatorSnapshot={...candidate.validatorSnapshot,
  blockNumber:snapshot.number,blockHash:snapshot.hash,
  validators,notes:"Public validator BLS proofs matched to canonical origin PoS snapshot and checked by configured verifier. Live checks must be repeated before paid deployment."};
 return {candidate,report:{chain:chain.name,originChainId:initial.originChainId,
  snapshotBlock:snapshot.number,snapshotHash:snapshot.hash,
  originHeadAtCheck:BigInt(head).toString(),
  confirmedDepth:(BigInt(head)-BigInt(snapshot.number)).toString(),
  verifiedValidatorCount:validators.length,
  verification:"rpc-verified-public-bootstrap",
  deploymentAuthorized:false}};
}
