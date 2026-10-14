// Prepare public Base bootstrap from the ACTUAL XGRChain registry and
// finalized PoS snapshot. Read-only: no keys, deployment or manifest writes.
import {selector} from "../../apps/web/keccak.mjs";
import {rpcCall} from "./inspector.mjs";
import {prepareBootstrapEvidence,parsePublicProof} from "./bootstrap-evidence.mjs";
import {validatePublicBootstrapProof,encodeBlsVerify} from "./bls-bootstrap-proof.mjs";
const ADDR=/^0x[0-9a-f]{40}$/i;
const WORD=/^[0-9a-f]{64}$/i;
const equal=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function word(data,n){
 if(typeof data!=="string"||!/^0x[0-9a-f]+$/i.test(data)||data.length<2+(n+1)*64)
  throw Error("Invalid Registry ABI response");
 return data.slice(2+n*64,2+(n+1)*64);
}
function dynamicBytes(data,offset){
 if(offset>32768||offset%32!==0)throw Error("Invalid dynamic Registry offset");
 const len=Number(BigInt("0x"+word(data,offset/32)));
 if(len<1||len>256||data.length<2+offset*2+64+len*2)throw Error("Invalid dynamic Registry bytes");
 return "0x"+data.slice(2+offset*2+64,2+offset*2+64+len*2);
}
function decodeValidator(data){
 const active=BigInt("0x"+word(data,0))===1n;
 const offset=Number(BigInt("0x"+word(data,1)));
 const key=dynamicBytes(data,offset);
 const reserve=BigInt("0x"+word(data,2)).toString();
 if(!active||!/^0x[0-9a-f]{96}$/i.test(key))throw Error("Inactive validator or malformed on-chain BLS key");
 return {key,reserve};
}
// Build a verified membership snapshot from a CONFIRMED XGRChain Registry V3
// block. This replaces manual copying of a second PoS snapshot file on Base;
// the Base-specific PoPs are still independently verified on Base.
export async function readFinalizedXgrRegistrySnapshot({
 xgrChain,registryAddress,initial,rpc=rpcCall
}){
 if(xgrChain?.chainId!==1643||!ADDR.test(registryAddress||"")||
    !Array.isArray(initial?.validators)||(initial.validators.length<3||initial.validators.length>128)||
    !initial.validators.every(v=>ADDR.test(v))||
    new Set(initial.validators.map(v=>v.toLowerCase())).size!==initial.validators.length||
    !Number.isSafeInteger(xgrChain.confirmations)||xgrChain.confirmations<1)
  throw Error("Invalid XGRChain Registry snapshot request");
 const url=xgrChain.rpcUrls?.[0];
 if(!/^https:\/\//.test(url||""))throw Error("Unapproved origin RPC");
 const [chainId,headHex]=await Promise.all([
  rpc(url,"eth_chainId",[]),rpc(url,"eth_blockNumber",[])]);
 if(BigInt(chainId)!==1643n)throw Error("Canonical origin chain ID mismatch");
 const number=BigInt(headHex)-BigInt(xgrChain.confirmations);
 if(number<1n||number>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error("No confirmed origin snapshot block");
 const tag="0x"+number.toString(16);
 const [block,domain,origin,version,setId,quorum,...records]=await Promise.all([
  rpc(url,"eth_getBlockByNumber",[tag,false]),
  ...["destinationDomain()","originChainId()","registryVersion()","setId()","quorumThreshold()"]
    .map(signature=>rpc(url,"eth_call",[{to:registryAddress,data:selector(signature)},tag])),
  ...initial.validators.map(address=>rpc(url,"eth_call",[
   {to:registryAddress,data:selector("getValidator(address)")+
    address.slice(2).padStart(64,"0")},tag]))
 ]);
 if(!block||BigInt(block.number||"0x0")!==number||
    !/^0x[0-9a-f]{64}$/i.test(block.hash||""))
  throw Error("Confirmed XGRChain block unavailable");
 if(BigInt(domain)!==1643n||BigInt(origin)!==1643n||
    BigInt(version)!==3n||BigInt(setId)<1n||BigInt(quorum)<1n)
  throw Error("Confirmed XGRChain Registry V3 identity/quorum mismatch");
 const keys=records.map(record=>decodeValidator(record).key);
 if(new Set(keys.map(k=>k.toLowerCase())).size!==initial.validators.length)
  throw Error("Duplicate compressed BLS key in XGRChain Registry V3");
 return {number:Number(number),hash:block.hash,
  validators:initial.validators.map((address,i)=>({
   validator:{Address:address,BLSPublicKey:keys[i]}}))};
}
export async function prepareBaseFromXgr({
 xgrChain,baseChain,registryAddress,initial,bootstrap,snapshot,proofs,
 rpc=rpcCall,verifyProof
}){
 if(!ADDR.test(registryAddress||"")||initial?.originChainId!==1643||
   xgrChain?.chainId!==1643||baseChain?.chainId!==8453||
   baseChain.domainId!==8453||bootstrap?.destinationDomain!==8453||
   initial.validators?.length!==3||proofs?.length!==3)
  throw Error("Invalid pinned source/destination bootstrap identity");
 const url=xgrChain.rpcUrls?.[0];
 const id=await rpc(url,"eth_chainId",[]);
 if(BigInt(id)!==1643n)throw Error("Wrong XGRChain registry RPC");
 const [domain,origin,version,setId]=await Promise.all([
  "destinationDomain()","originChainId()","registryVersion()","setId()"
 ].map(name=>rpc(url,"eth_call",[{to:registryAddress,data:selector(name)},"latest"])));
 if(BigInt(domain)!==1643n||BigInt(origin)!==1643n||
    BigInt(version)!==3n||BigInt(setId)<1n)
  throw Error("Deployed XGRChain Registry identity/epoch mismatch");
 const ordered=initial.validators;
 const entries=[];
 for(const address of ordered){
  if(!ADDR.test(address))throw Error("Invalid pinned validator");
  const reply=await rpc(url,"eth_call",[{to:registryAddress,
   data:selector("getValidator(address)")+address.slice(2).padStart(64,"0")},"latest"]);
  entries.push({address,...decodeValidator(reply)});
 }
 const vetted=proofs.map(p=>typeof p==="string"?parsePublicProof(p):p);
 for(let i=0;i<ordered.length;i++){
  if(!equal(vetted[i]?.validator,ordered[i])||
     !equal(vetted[i]?.blsPublicKey,entries[i].key)||
     vetted[i]?.destinationDomain!==8453||vetted[i]?.originChainId!==1643)
   throw Error("Base-domain PoP differs from deployed XGRChain validator "+(i+1));
 }
 const verifyNative=async(proof)=>{
  const checked=validatePublicBootstrapProof(proof,{chain:baseChain,approvedValidators:ordered});
  const output=await rpc(url,"eth_call",[{
   to:"0x0000000000000000000000000000000000002040",
   data:encodeBlsVerify(checked.payload,checked.compressedPublicKey,checked.compressedSignature),
   gas:"0x1e8480"
  },"latest"]);
  return {validator:proof.validator,verified:output==="0x"+"0".repeat(63)+"1"};
 };
 // A predeploy cryptographic check on the proven native XGR verifier is
 // possible because the signed BOOTSTRAP payload itself binds Base domain 8453.
 const result=await prepareBootstrapEvidence({
  chain:baseChain,bootstrap,initial,originChain:xgrChain,snapshot,proofs:vetted,rpc,
  verifyProof:verifyProof||verifyNative
 });
 return {...result,registry:{address:registryAddress,setId:BigInt(setId).toString(),
  validators:entries},proofMode:verifyProof?"destination-verifier":"xgr-native-precheck-only",
  destinationVerifierVerified:Boolean(verifyProof),deploymentAuthorized:false};
}
