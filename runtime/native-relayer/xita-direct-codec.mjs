import {AbiCoder,solidityPacked,keccak256,getBytes} from "ethers";

export const DIRECT_BLS_DOMAIN="XITA_DIRECT_MESSAGE_V1";
export const DIRECT_ECDSA_DOMAIN="XITA_DIRECT_MESSAGE_ECDSA_V1";
export const ILN_OPERATION_EVENT="event ILNOperation(bytes32 indexed routeId,bytes32 indexed messageId,uint32 indexed destinationDomain,uint256 validatorFeeWei)";
export const DIRECT_AUTHORIZATION_TYPE=
  "tuple(uint64 sourceChainId,uint32 sourceDomain,uint32 destinationDomain,bytes32 routeId,uint64 setId,uint64 sourceBlockNumber,address sourceRegistry,address gateway,address sourceRouter,address sourceMailbox,address destinationRouter,uint256 validatorFeeWei,bytes32 messageId)";
// Keep the deployed BLS API and its tuple encoding available to existing users.
export const DIRECT_BLS_AUTHORIZATION_TYPE=DIRECT_AUTHORIZATION_TYPE;

const verifierFormats=Object.freeze({
  1:Object.freeze({format:1,scheme:"bls",domain:DIRECT_BLS_DOMAIN,signatureBytes:96}),
  2:Object.freeze({format:2,scheme:"bls",domain:DIRECT_BLS_DOMAIN,signatureBytes:256}),
  3:Object.freeze({format:3,scheme:"ecdsa",domain:DIRECT_ECDSA_DOMAIN,signatureBytes:65})
});
const secp256k1Order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// Only the already-bound destination registry chooses the codec. Archive
// fields, signature lengths and chain IDs must never select an adapter.
export function directVerifierFormat(verifierFormat){
  if(typeof verifierFormat!=="number"&&typeof verifierFormat!=="bigint")
    throw Error("Unsupported destination verifier format");
  const value=Number(verifierFormat);
  if(!Number.isInteger(value)||!Object.hasOwn(verifierFormats,value))
    throw Error("Unsupported destination verifier format");
  return verifierFormats[value];
}

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

export function encodeDirectPayload(a,verifierFormat){
  const {domain}=directVerifierFormat(verifierFormat);
  const values=signedFieldNames.map(k=>{
    if(a?.[k]===undefined||a[k]===null)throw Error("Missing direct signed field: "+k);
    return a[k];
  });
  if(BigInt(a.sourceChainId)<=0n||BigInt(a.sourceDomain)<=0n||
     BigInt(a.destinationDomain)<=0n||BigInt(a.sourceDomain)===BigInt(a.destinationDomain)||
     BigInt(a.setId)<=0n||BigInt(a.sourceBlockNumber)<=0n||
     BigInt(a.validatorFeeWei)<=0n||
     !/^0x[0-9a-f]{64}$/i.test(a.messageId)||
     !/^0x[0-9a-f]{64}$/i.test(a.routeId)||
     BigInt(a.messageId)===0n||BigInt(a.routeId)===0n)
    throw Error("Invalid direct message identity or validator fee");
  for(const field of signedFieldNames.filter(k=>k.startsWith("source")&&k!=="sourceChainId"&&k!=="sourceDomain"&&k!=="sourceBlockNumber").concat(["gateway","destinationRouter","destinationIsm","destinationRegistry"])){
    if(!/^0x[0-9a-f]{40}$/i.test(a[field])||BigInt(a[field])===0n)
      throw Error("Invalid direct address: "+field);
  }
  return solidityPacked(["string",...signedFieldTypes],[domain,...values]);
}

export function encodeDirectBLSPayload(a){return encodeDirectPayload(a,1)}
export function encodeDirectECDSAPayload(a){return encodeDirectPayload(a,3)}

function encodeMetadata({authorization,signerBitmap,signature}){
  const a=authorization;
  const fields=signedFieldNames.slice(0,-2);
  const values=fields.map(key=>{
    if(a[key]===undefined||a[key]===null)throw Error("Missing direct metadata field: "+key);
    return a[key];
  });
  return AbiCoder.defaultAbiCoder().encode(
    ["tuple("+DIRECT_AUTHORIZATION_TYPE+",bytes,bytes)"],
    [[values,signerBitmap,signature]]
  );
}

export function validateDirectProof({signerBitmap,signature,verifierFormat,validatorCount}){
  const format=directVerifierFormat(verifierFormat);
  if(typeof signerBitmap!=="string"||!/^0x(?:[0-9a-f]{2})+$/i.test(signerBitmap))
    throw Error("Invalid direct signer bitmap");
  const bitmap=getBytes(signerBitmap);
  if(format.scheme==="bls"){
    if(bitmap[0]===0)throw Error("Noncanonical BLS signer bitmap");
    if(typeof signature!=="string"||!new RegExp("^0x[0-9a-f]{"+format.signatureBytes*2+"}$","i").test(signature))
      throw Error("Invalid destination BLS signature format");
    return;
  }
  if(!Number.isInteger(validatorCount)||validatorCount<1||validatorCount>64)
    throw Error("Invalid ECDSA validator count");
  if(bitmap.length!==Math.ceil(validatorCount/8)||
     (validatorCount%8!==0&&bitmap.at(-1)>>(validatorCount%8)!==0))
    throw Error("Noncanonical ECDSA signer bitmap");
  let selected=0;
  for(let byte of bitmap)while(byte){selected+=byte&1;byte>>=1}
  if(selected<Math.floor((2*validatorCount+2)/3))
    throw Error("ECDSA signer bitmap is below quorum");
  if(typeof signature!=="string"||!new RegExp("^0x[0-9a-f]{"+selected*65*2+"}$","i").test(signature))
    throw Error("ECDSA signature count does not match bitmap");
  for(let i=0;i<selected;i++){
    const offset=2+i*130;
    const r=BigInt("0x"+signature.slice(offset,offset+64));
    const s=BigInt("0x"+signature.slice(offset+64,offset+128));
    const v=Number.parseInt(signature.slice(offset+128,offset+130),16);
    if(r===0n||r>=secp256k1Order||s===0n||s>secp256k1Order/2n||(v!==27&&v!==28))
      throw Error("Noncanonical ECDSA signature");
  }
}

export function encodeDirectAuthorizationMetadata(proof){
  encodeDirectPayload(proof.authorization,proof.verifierFormat);
  validateDirectProof(proof);
  return encodeMetadata(proof);
}

// BLS compatibility wrapper: the selected format is always a BLS format.
export function encodeDirectISMMetadata({authorization,signerBitmap,aggregateSignature}){
  if(!authorization||!/^0x(?:[0-9a-f]{2})+$/i.test(signerBitmap||"")||
     !/^0x(?:[0-9a-f]{192}|[0-9a-f]{512})$/i.test(aggregateSignature||""))
    throw Error("Direct BLS ISM requires bitmap and 96/256-byte aggregate signature");
  return encodeMetadata({authorization,signerBitmap,signature:aggregateSignature});
}

const archiveFields=Object.freeze({
  originChainId:"sourceChainId",originDomain:"sourceDomain",destinationDomain:"destinationDomain",
  setId:"setId",sourceBlockNumber:"sourceBlockNumber",validatorFeeWei:"validatorFeeWei"
});
const archiveAddresses=Object.freeze({
  authorizedMessageId:"messageId",routeId:"routeId",registry:"sourceRegistry",
  gateway:"gateway",sourceRouter:"sourceRouter",mailbox:"sourceMailbox",
  destinationRouter:"destinationRouter",destinationIsm:"destinationIsm",destinationRegistry:"destinationRegistry"
});
const present=value=>value!==undefined&&value!==null&&value!=="";

// Receipt-first and already-attested recovery share the same typed identity,
// current-set binding and proof encoding. This validates structure; the caller
// must still ask the bound registry and ISM to verify the exact proof and message.
export function prepareDirectAttestation({authorization,attestation,route,verifierFormat,validatorCount}){
  const format=directVerifierFormat(verifierFormat);
  if(!attestation||attestation.version!==format.domain||
     (format.scheme==="ecdsa"?attestation.signatureScheme!=="ecdsa":
      present(attestation.signatureScheme)&&attestation.signatureScheme!=="bls"))
    throw Error("Attestation signature scheme/domain differs from destination verifier");
  if(typeof attestation.chain!=="string"||attestation.chain.toLowerCase()!==route.toLowerCase())
    throw Error("Attestation route name mismatch");
  for(const [field,expected] of Object.entries(archiveAddresses)){
    if(typeof attestation[field]!=="string"||attestation[field].toLowerCase()!==String(authorization[expected]).toLowerCase())
      throw Error("Attestation "+field+" mismatch");
  }
  for(const [field,expected] of Object.entries(archiveFields)){
    let equal=false;
    try{equal=BigInt(attestation[field])===BigInt(authorization[expected])}catch{}
    if(!equal)throw Error("Attestation "+field+" mismatch");
  }
  const payload=encodeDirectPayload(authorization,format.format);
  if(typeof attestation.payload!=="string"||payload.toLowerCase()!==attestation.payload.toLowerCase())
    throw Error("Canonical signed authorization payload mismatch");
  let signature;
  if(format.scheme==="bls"){
    if(present(attestation.signatures))throw Error("Mixed BLS/ECDSA archive proof fields");
    for(const [field,length] of [["aggregateSignatureCompressed",96],["aggregateSignature",256]]){
      if(present(attestation[field])&&(typeof attestation[field]!=="string"||
         !new RegExp("^0x[0-9a-f]{"+length*2+"}$","i").test(attestation[field])))
        throw Error("Invalid BLS archive proof field: "+field);
    }
    signature=format.format===1?attestation.aggregateSignatureCompressed:attestation.aggregateSignature;
  }else{
    if(present(attestation.aggregateSignature)||present(attestation.aggregateSignatureCompressed))
      throw Error("Mixed BLS/ECDSA archive proof fields");
    signature=attestation.signatures;
  }
  const signerBitmap=attestation.signerBitmap;
  const metadata=encodeDirectAuthorizationMetadata({
    authorization,signerBitmap,signature,verifierFormat:format.format,validatorCount
  });
  return {payload,signerBitmap,signature,metadata};
}

export function hashDirectBLSPayload(a){
  return keccak256(encodeDirectBLSPayload(a));
}
