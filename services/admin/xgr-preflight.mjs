// Live XGRChain-first, READ-ONLY smoke test (no wallet or private keys).
// Native precompiles have no EVM bytecode: a code == "0x" result at 0x2040
// MUST NOT be treated as evidence the verifier does not exist.
// Negative vector here proves ABI dispatch/rejection only. A positive
// known-good signature MUST be tested separately before deployment.
import {selector} from "../../apps/web/keccak.mjs";
import {rpcCall} from "./inspector.mjs";

export const XGR_NATIVE_VERIFIER="0x0000000000000000000000000000000000002040";
const BYTEHEX=/^0x(?:[0-9a-fA-F]{2})*$/;
const CODE=/^0x(?:[0-9a-fA-F]{2})+$/;
const WORD_FALSE="0x"+"0".repeat(64);
const word=n=>BigInt(n).toString(16).padStart(64,"0");
function bytesHex(value){
 if(!BYTEHEX.test(value||""))throw Error("Malformed ABI bytes");
 return value.slice(2).toLowerCase();
}
function encodeBytes(value){
 const data=bytesHex(value);
 return word(data.length/2)+data.padEnd(Math.ceil(data.length/64)*64,"0");
}
function encodeBytesArray(values){
 const tails=values.map(encodeBytes);
 let offset=tails.length*32;
 const head=tails.map(chunk=>{const at=word(offset);offset+=chunk.length/2;return at;}).join("");
 return word(tails.length)+head+tails.join("");
}
export function negativeNativeBlsCalldata(){
 // EIP-712 signatures are deliberately NOT involved: the native precompile
 // uses compressed 48-byte G1 public keys / 96-byte G2 signatures.
 const args=[
  encodeBytes("0x01"),
  encodeBytesArray(["0x"+"00".repeat(48)]),
  encodeBytes("0x01"),
  encodeBytes("0x"+"00".repeat(96))
 ];
 let offset=4*32;
 const heads=args.map(a=>{const out=word(offset);offset+=a.length/2;return out;}).join("");
 return selector("verify(bytes,bytes[],bytes,bytes)")+heads+args.join("");
}
export async function inspectXgrFirstDeploy({
 url,mailbox,merkleTreeHook,verifier=XGR_NATIVE_VERIFIER,rpc=rpcCall
}={}){
 if(typeof url!=="string"||!url.startsWith("https://"))
  throw Error("XGRChain RPC must be HTTPS");
 if(![mailbox,merkleTreeHook,verifier].every(a=>/^0x[a-fA-F0-9]{40}$/.test(a||"")))
  throw Error("Missing main-approved core/precompile addresses");
 const result={chain:"xgrchain",chainId:1643,mode:"read-only",rpcUrl:url,
  verifier,positiveBlsVector:"not-tested",nativeBlsVerified:false,
  codeAtPrecompile:null,readyToDeploy:false,
  checkedAt:new Date().toISOString()};
 try{
  const id=await rpc(url,"eth_chainId",[]);
  if(BigInt(id)!==1643n)throw Error("XGRChain RPC chain ID mismatch");
  result.chainIdVerified=true;
  const [block,gasPrice,mailCode,hookCode,precompileCode]=await Promise.all([
   rpc(url,"eth_blockNumber",[]),rpc(url,"eth_gasPrice",[]),
   rpc(url,"eth_getCode",[mailbox,"latest"]),
   rpc(url,"eth_getCode",[merkleTreeHook,"latest"]),
   rpc(url,"eth_getCode",[verifier,"latest"])
  ]);
  result.head=BigInt(block).toString();
  result.gasPriceWei=BigInt(gasPrice).toString();
  result.standardTransferGasFloorWei=(BigInt(gasPrice)*21000n).toString();
  result.mailboxCode=CODE.test(mailCode||"");
  result.merkleTreeHookCode=CODE.test(hookCode||"");
  result.codeAtPrecompile=precompileCode;
  const negative=await rpc(url,"eth_call",[{
   to:verifier,data:negativeNativeBlsCalldata(),gas:"0x1e8480"
  },"latest"]);
  result.nativeNegativeVectorRejected=negative===WORD_FALSE;
  if(!result.nativeNegativeVectorRejected)
   result.error="Native verifier failed canonical negative BLS test (expected ABI false)";
  else if(!result.mailboxCode||!result.merkleTreeHookCode)
   result.error="Hyperlane Core code missing";
 }catch(e){
  result.error=String(e.message||e).slice(0,200);
  result.nativeNegativeVectorRejected=false;
 }
 result.basicRpcPreflightOK=Boolean(result.chainIdVerified&&result.mailboxCode&&
  result.merkleTreeHookCode&&result.nativeNegativeVectorRejected);
 // Deliberately incomplete: never confuse negative BLS test with positive
 // cryptographic attestation of the three initial validators.
 result.readyToDeploy=false;
 return result;
}
