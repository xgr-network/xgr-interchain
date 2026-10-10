// Read-only public BLS proof reconstruction. No validator private keys.
import {selector} from "../../apps/web/keccak.mjs";
import {rpcCall} from "./inspector.mjs";
const P=BigInt("0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab");
const h=(s,n)=>typeof s==="string"&&new RegExp("^0x[0-9a-fA-F]{"+n+"}$").test(s);
const word=n=>BigInt(n).toString(16).padStart(64,"0");
const bytes=s=>{const v=s.slice(2);return word(v.length/2)+v.padEnd(Math.ceil(v.length/64)*64,"0")};
function arr(values){let offset=values.length*32;const chunks=values.map(bytes);return word(values.length)+chunks.map(c=>{const a=word(offset);offset+=c.length/2;return a}).join("")+chunks.join("")}
export function encodeBlsVerify(payload,key,signature){
 const chunks=[bytes(payload),arr([key]),bytes("0x01"),bytes(signature)];
 let offset=128;return selector("verify(bytes,bytes[],bytes,bytes)")+
  chunks.map(c=>{const o=word(offset);offset+=c.length/2;return o}).join("")+chunks.join("");
}
function fp(x){const v=BigInt("0x"+x);if(v>=P)throw Error("Noncanonical BLS field element");return v}
function greatestFp2(c0,c1){const a=fp(c1),b=fp(c0);return (a===0n?b:a)*2n>P}
export function compressPublicG1(uncompressed){
 if(!h(uncompressed,256))throw Error("Expected EIP2537 G1 128-byte key");
 const a=uncompressed.slice(2).toLowerCase(),x=a.slice(32,128),y=a.slice(160,256);
 if(a.slice(0,32)!=="0".repeat(32)||a.slice(128,160)!=="0".repeat(32))throw Error("EIP2537 G1 padding must be zero");
 fp(x);const neg=fp(y)*2n>P;const start=(parseInt(x.slice(0,2),16)|128|(neg?32:0)).toString(16).padStart(2,"0");
 return "0x"+start+x.slice(2);
}
export function compressSignatureG2(eip){
 if(!h(eip,512))throw Error("Expected EIP2537 G2 256-byte signature");
 const a=eip.slice(2).toLowerCase();
 const limbs=Array.from({length:4},(_,i)=>{const chunk=a.slice(i*128,(i+1)*128);if(chunk.slice(0,32)!=="0".repeat(32))throw Error("EIP2537 G2 padding must be zero");return chunk.slice(32)});
 const [x0,x1,y0,y1]=limbs;limbs.forEach(fp);
 const sign=greatestFp2(y0,y1);
 return "0x"+(parseInt(x1.slice(0,2),16)|128|(sign?32:0)).toString(16).padStart(2,"0")+x1.slice(2)+x0;
}
export function validatePublicBootstrapProof(proof,{chain,approvedValidators}){
 if(!proof||!chain||!approvedValidators?.some(a=>a.toLowerCase()===String(proof.validator).toLowerCase()))throw Error("Validator is not in approved initial set");
 if(!h(proof.validator,40)||proof.originChainId!==1643||proof.destinationDomain!==chain.domainId)throw Error("Invalid validator identity or domain");
 if(!h(proof.blsPublicKey,96)||!h(proof.blsPublicKeyEIP2537,256)||!h(proof.possessionProof,512))throw Error("Invalid BLS proof field length");
 const key=compressPublicG1(proof.blsPublicKeyEIP2537);
 if(key.toLowerCase()!==proof.blsPublicKey.toLowerCase())throw Error("Compressed/uncompressed BLS keys differ");
 const want="0x"+Buffer.from("XGR_INTERCHAIN_BOOTSTRAP_V1").toString("hex")+
  BigInt(proof.originChainId).toString(16).padStart(16,"0")+
  BigInt(proof.destinationDomain).toString(16).padStart(8,"0")+
  proof.validator.slice(2).toLowerCase()+"0030"+proof.blsPublicKey.slice(2).toLowerCase()+
  "0080"+proof.blsPublicKeyEIP2537.slice(2).toLowerCase();
 if(String(proof.payload).toLowerCase()!==want)throw Error("Bootstrap payload mismatch");
 return {validator:proof.validator,chain:chain.name,domainId:chain.domainId,
  compressedSignature:compressSignatureG2(proof.possessionProof),
  compressedPublicKey:key,payload:want};
}
export async function verifyPublicBootstrapOnChain(proof,{chain,bootstrap,approvedValidators,rpc=rpcCall}){
 const checked=validatePublicBootstrapProof(proof,{chain,approvedValidators});
 if(chain.blsVerifierFormat!=="compressed"||!h(bootstrap.verifierAddress,40))
  throw Error("Compressed verifier must be configured for read-only verification");
 const id=await rpc(chain.rpcUrls[0],"eth_chainId",[]);
 if(BigInt(id)!==BigInt(chain.chainId))throw Error("Wrong target chain");
 const result=await rpc(chain.rpcUrls[0],"eth_call",[{to:bootstrap.verifierAddress,
  data:encodeBlsVerify(checked.payload,checked.compressedPublicKey,checked.compressedSignature),
  gas:"0x1e8480"},"latest"]);
 return {validator:checked.validator,chain:chain.name,verified:result==="0x"+"0".repeat(63)+"1",
  payloadBound:true,publicKeyConsistent:true,mode:"read-only"};
}
