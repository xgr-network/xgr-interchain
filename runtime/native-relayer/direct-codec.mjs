import {AbiCoder, solidityPacked, getAddress, isHexString} from "ethers";

// One BLS attestation per fee-qualified Hyperlane Message ID.
// No Merkle root, proof siblings, leaf index or checkpoint is transmitted.
export const XITA_DIRECT_DOMAIN="XITA_DIRECT_MESSAGE_V1";
export const XITA_DIRECT_FIELDS=Object.freeze([
 "uint64","uint32","uint32","bytes32","uint64","uint64",
 "address","address","address","address","address","uint256","bytes32"
]);
export const XITA_DIRECT_NAMES=Object.freeze([
 "sourceChainId","sourceDomain","destinationDomain","routeId",
 "setId","sourceBlockNumber","sourceRegistry","gateway",
 "sourceRouter","sourceMailbox","destinationRouter","validatorFeeWei","messageId"
]);
const ADDRESS_FIELDS=new Set([
 "sourceRegistry","gateway","sourceRouter","sourceMailbox","destinationRouter"
]);
const POSITIVE_FIELDS=new Set(["sourceChainId","sourceDomain","destinationDomain",
 "setId","sourceBlockNumber","validatorFeeWei"]);
const HASH_FIELDS=new Set(["routeId","messageId"]);

export function requireDirectAuthorization(p){
 if(!p||typeof p!=="object")throw Error("Missing direct BLS authorization");
 const values=XITA_DIRECT_NAMES.map(name=>{
  const v=p[name];
  if(POSITIVE_FIELDS.has(name)){
   const n=BigInt(v??0);
   if(n<=0n)throw Error("Invalid direct BLS "+name);
   return n;
  }
  if(HASH_FIELDS.has(name)){
   if(!isHexString(v,32)||/^0x0{64}$/i.test(v))
    throw Error("Invalid direct BLS "+name);
   return v.toLowerCase();
  }
  if(ADDRESS_FIELDS.has(name)){
   const normalized=getAddress(v);
   if(BigInt(normalized)===0n)throw Error("Invalid zero "+name);
   return normalized;
  }
  throw Error("Unexpected direct BLS "+name);
 });
 if(values[1]===values[2])throw Error("Direct message cannot target its source domain");
 return values;
}

export function encodeDirectSigningPayload(p,{destinationIsm,destinationRegistry}={}){
 const values=requireDirectAuthorization(p);
 const ism=getAddress(destinationIsm), registry=getAddress(destinationRegistry);
 if(BigInt(ism)===0n||BigInt(registry)===0n)
  throw Error("Direct message destination authority unavailable");
 return solidityPacked(
  ["string",...XITA_DIRECT_FIELDS,"address","address"],
  [XITA_DIRECT_DOMAIN,...values,ism,registry]
 );
}

const AUTHORIZATION_TUPLE=
 "tuple(uint64 sourceChainId,uint32 sourceDomain,uint32 destinationDomain,"+
 "bytes32 routeId,uint64 setId,uint64 sourceBlockNumber,address sourceRegistry,"+
 "address gateway,address sourceRouter,address sourceMailbox,address destinationRouter,"+
 "uint256 validatorFeeWei,bytes32 messageId)";
export const DIRECT_METADATA_TYPE="tuple("+AUTHORIZATION_TUPLE+
 " authorization,bytes signerBitmap,bytes aggregateSignature)";

export function encodeDirectISMMetadata(p,{signerBitmap,aggregateSignature}={}){
 const values=requireDirectAuthorization(p);
 if(!isHexString(signerBitmap)||signerBitmap.length<4||
    !isHexString(aggregateSignature)||aggregateSignature.length<4)
  throw Error("Direct BLS quorum signature/bitmap missing");
 return AbiCoder.defaultAbiCoder().encode(
  [DIRECT_METADATA_TYPE], [[values,signerBitmap,aggregateSignature]]
 );
}
