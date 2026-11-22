import {AbiCoder,solidityPacked,keccak256,getBytes} from "ethers";

export const DIRECT_BLS_DOMAIN="XITA_DIRECT_MESSAGE_V1";
const DIRECT_ECDSA_DOMAIN="XITA_DIRECT_MESSAGE_ECDSA_V1";
export const DIRECT_PROOF_SCHEMES=Object.freeze(["bls","ecdsa"]);
export const ILN_OPERATION_EVENT="event ILNOperation(bytes32 indexed routeId,bytes32 indexed messageId,uint32 indexed destinationDomain,uint256 validatorFeeWei)";
export const DIRECT_BLS_AUTHORIZATION_TYPE=
  "tuple(uint64 sourceChainId,uint32 sourceDomain,uint32 destinationDomain,bytes32 routeId,uint64 setId,uint64 sourceBlockNumber,address sourceRegistry,address gateway,address sourceRouter,address sourceMailbox,address destinationRouter,uint256 validatorFeeWei,bytes32 messageId)";

const signedFieldNames=[
  "sourceChainId","sourceDomain","destinationDomain","routeId",
  "setId","sourceBlockNumber","sourceRegistry","gateway",
  "sourceRouter","sourceMailbox","destinationRouter","validatorFeeWei",
  "messageId","destinationIsm","destinationRegistry"
];
const signedFieldTypes=[
  "uint64","uint32","uint32","bytes32","uint64","uint64",
  "address","address","address","address","address",
  "uint256","bytes32","address","address"
];

function encodeDirectPayload(a,domain){
  const values=signedFieldNames.map(k=>{
    if(a[k]===undefined||a[k]===null)throw Error("Missing direct signed field: "+k);
    return a[k];
  });
  if(BigInt(a.sourceChainId)<=0n||BigInt(a.sourceDomain)<=0n||
     BigInt(a.destinationDomain)<=0n||BigInt(a.sourceDomain)===BigInt(a.destinationDomain)||
     BigInt(a.setId)<=0n||BigInt(a.sourceBlockNumber)<=0n||
     BigInt(a.validatorFeeWei)<=0n||
     !/^0x[0-9a-f]{64}$/i.test(a.messageId)||
     !/^0x[0-9a-f]{64}$/i.test(a.routeId)||
     BigInt(a.messageId)===0n||BigInt(a.routeId)===0n)
    throw Error("Invalid direct BLS message identity or validator fee");
  for(const field of signedFieldNames.filter(k=>k.startsWith("source")&&k!=="sourceChainId"&&k!=="sourceDomain"&&k!=="sourceBlockNumber").concat(["gateway","destinationRouter","destinationIsm","destinationRegistry"])){
    if(!/^0x[0-9a-f]{40}$/i.test(a[field])||BigInt(a[field])===0n)
      throw Error("Invalid direct address: "+field);
  }
  return solidityPacked(["string",...signedFieldTypes],[domain,...values]);
}

export function encodeDirectBLSPayload(a){
  return encodeDirectPayload(a,DIRECT_BLS_DOMAIN);
}

export function encodeDirectISMMetadata({authorization,signerBitmap,aggregateSignature}){
  if(!/^0x(?:[0-9a-f]{192}|[0-9a-f]{512})$/i.test(aggregateSignature||""))
    throw Error("Direct BLS ISM requires bitmap and 96/256-byte aggregate signature");
  return encodeMetadata(authorization,signerBitmap,aggregateSignature);
}

function encodeMetadata(authorization,signerBitmap,signature){
  if(!authorization||!/^0x(?:[0-9a-f]{2})+$/i.test(signerBitmap||""))
    throw Error("Direct ISM requires a signer bitmap");
  const a=authorization;
  const fields=signedFieldNames.slice(0,-2);
  const values=fields.map(key=>{
    if(a[key]===undefined||a[key]===null)throw Error("Missing direct metadata field: "+key);
    return a[key];
  });
  return AbiCoder.defaultAbiCoder().encode(
    ["tuple("+DIRECT_BLS_AUTHORIZATION_TYPE+",bytes,bytes)"],
    [[values,signerBitmap,signature]]
  );
}

export function hashDirectBLSPayload(a){
  return keccak256(encodeDirectBLSPayload(a));
}

export function buildDirectProof(authorization,attestation,keyFormat){
  const format=Number(keyFormat);
  if(![1,2,3].includes(format))throw Error("Unsupported destination signature format");
  const ecdsa=format===3;
  const domain=ecdsa?DIRECT_ECDSA_DOMAIN:DIRECT_BLS_DOMAIN;
  const scheme=ecdsa?"ecdsa":"bls";
  if(attestation?.version!==domain||(attestation.signatureScheme||"bls")!==scheme)
    throw Error("Attestation signature scheme or domain differs from destination registry");
  const payload=encodeDirectPayload(authorization,domain);
  if(payload.toLowerCase()!==String(attestation.payload||"").toLowerCase())
    throw Error("Canonical signed authorization payload mismatch");
  const signature=ecdsa?attestation.signatures:
    format===1?attestation.aggregateSignatureCompressed:attestation.aggregateSignature;
  const bitmap=attestation.signerBitmap;
  if(!/^0x(?:[0-9a-f]{2})+$/i.test(signature||"")||!/^0x(?:[0-9a-f]{2})+$/i.test(bitmap||""))
    throw Error("Invalid destination quorum signature or bitmap");
  if(ecdsa){
    const bytes=getBytes(bitmap);
    let signerCount=0;
    for(const byte of bytes){
      for(let bits=byte;bits;bits&=bits-1)signerCount++;
    }
    if(bytes.length>8||signerCount===0||getBytes(signature).length!==65*signerCount)
      throw Error("Invalid ECDSA signature count or bitmap length");
  }else if(getBytes(signature).length!==(format===1?96:256)){
    throw Error("Invalid destination BLS signature length");
  }
  return {payload,signature,metadata:encodeMetadata(authorization,bitmap,signature)};
}
