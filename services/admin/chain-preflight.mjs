import {selector} from "../../apps/web/keccak.mjs";
import {rpcCall} from "./inspector.mjs";
const BYTEHEX=/^0x(?:[0-9a-fA-F]{2})*$/;
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
export function negativeCompressedBlsCalldata(){
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

const CODE=/^0x(?:[0-9a-f]{2})+$/i;
export async function inspectConfiguredChain({chain,core,bootstrap,rpc=rpcCall}){
 if(!chain||!core||!bootstrap||bootstrap.chain!==chain.name||bootstrap.chainId!==chain.chainId)
  throw Error("Configuration identity mismatch");
 const url=chain.rpcUrls?.[0];
 if(!/^https:\/\//.test(url||""))throw Error("No approved HTTPS RPC");
 const result={chain:chain.name,chainId:chain.chainId,verifierFormat:chain.blsVerifierFormat,
  mode:"read-only",readyToDeploy:false,positiveBlsVector:"not-tested",checkedAt:new Date().toISOString()};
 try{
  const remote=await rpc(url,"eth_chainId",[]);
  if(BigInt(remote)!==BigInt(chain.chainId))throw Error("RPC chain ID mismatch");
  result.chainIdVerified=true;
  const [block,price,mail,hook]=await Promise.all([
   rpc(url,"eth_blockNumber",[]),rpc(url,"eth_gasPrice",[]),
   rpc(url,"eth_getCode",[core.mailbox,"latest"]),
   rpc(url,"eth_getCode",[core.merkleTreeHook,"latest"])
  ]);
  result.head=BigInt(block).toString();result.gasPriceWei=BigInt(price).toString();
  result.standardTransferGasFloorWei=(BigInt(price)*21000n).toString();
  result.mailboxCode=CODE.test(mail||"");result.merkleTreeHookCode=CODE.test(hook||"");
  if(chain.blsVerifierFormat==="compressed"){
   if(!/^0x[a-f0-9]{40}$/i.test(bootstrap.verifierAddress||""))
    throw Error("Configured native verifier address missing");
   result.nativeVerifierAddress=bootstrap.verifierAddress;
   const code=await rpc(url,"eth_getCode",[bootstrap.verifierAddress,"latest"]);
   result.codeAtPrecompile=code;
   const negative=await rpc(url,"eth_call",[{to:bootstrap.verifierAddress,
    data:negativeCompressedBlsCalldata(),gas:"0x1e8480"},"latest"]);
   result.nativeNegativeVectorRejected=negative==="0x"+"0".repeat(64);
   if(!result.nativeNegativeVectorRejected)throw Error("Native compressed verifier rejected negative smoke-test format");
  } else if(chain.blsVerifierFormat==="eip2537"){
   result.verifierStatus="EIP-2537 precompile positive/negative vectors pending";
  } else throw Error("Unsupported BLS verifier format");
  result.basicRpcPreflightOK=Boolean(result.chainIdVerified&&result.mailboxCode&&result.merkleTreeHookCode&&
    (chain.blsVerifierFormat!=="compressed"||result.nativeNegativeVectorRejected));
 }catch(e){result.error=String(e.message||e).slice(0,200);result.basicRpcPreflightOK=false;}
 return result;
}
