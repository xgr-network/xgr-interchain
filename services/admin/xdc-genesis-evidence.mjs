// Read-only XGR MAINNET trust boundary for XDC (chain/domain 50).
// BOTH configured XGR RPCs must agree at an identical IBFT-committed block.
// Same-operator RPCs are consistency witnesses, not independent operators.
// The source registry address and bytecode fingerprint MUST be receipt-pinned
// in approved GitHub main. No operator-supplied bootstrap root is accepted.
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {selector,keccak256} from "../../apps/web/keccak.mjs";
import {encodeAbi} from "./abi-encoder.mjs";
import {rpcCall} from "./inspector.mjs";

const A=/^0x[a-f0-9]{40}$/i,H=/^0x[a-f0-9]{64}$/i;
const hex=x=>typeof x==="string"&&/^0x(?:[a-f0-9]{2})+$/i.test(x);
const equal=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const uintWord=x=>BigInt(x).toString(16).padStart(64,"0");
const digest=raw=>keccak256(Buffer.from(raw.slice(2),"hex"));
function decodeXGRValidatorSet(hexValue){
 if(!hex(hexValue)||hexValue.length>131074)throw Error("Invalid XGR registry ABI response");
 const bytes=Buffer.from(hexValue.slice(2),"hex");
 if(bytes.length<96||bytes.length%32!==0)throw Error("Invalid XGR registry return size");
 const word=offset=>{
  if(!Number.isSafeInteger(offset)||offset<0||offset+32>bytes.length)
   throw Error("Truncated XGR ABI word");
  return BigInt("0x"+bytes.subarray(offset,offset+32).toString("hex"));
 };
 const num=v=>{if(v>BigInt(bytes.length))throw Error("Invalid XGR ABI offset");return Number(v)};
 const aStart=num(word(0)),kStart=num(word(32)),setId=word(64);
 if(!setId||aStart<96||kStart<96||aStart%32||kStart%32)
  throw Error("Invalid XGR registry ABI offsets");
 const count=num(word(aStart));
 if(count<3||count>64||count!==num(word(kStart)))throw Error("Invalid XGR validator count");
 const addresses=[],keys=[],seen=new Set();
 for(let i=0;i<count;i++){
  const encoded=bytes.subarray(aStart+32+i*32,aStart+64+i*32);
  if(encoded.length!==32||encoded.subarray(0,12).some(b=>b!==0))
   throw Error("Invalid XGR EVM validator identity");
  const addr="0x"+encoded.subarray(12).toString("hex");
  if(BigInt(addr)===0n||seen.has(addr))throw Error("Duplicate XGR validator");
  seen.add(addr);addresses.push(addr);
  const off=num(word(kStart+32+i*32));
  const item=kStart+32+off;
  const length=num(word(item));
  if(length!==48||item+32+length>bytes.length)throw Error("Invalid XGR compressed BLS key");
  keys.push("0x"+bytes.subarray(item+32,item+32+length).toString("hex"));
 }
 return {setId:setId.toString(),validators:addresses.map((address,i)=>({
  address,blsPublicKeyCompressed:keys[i]
 }))};
}
export function computeXGRSetCommitment(validators){
 if(!Array.isArray(validators)||validators.length<3||validators.length>64)
  throw Error("Invalid XGR source membership");
 let packed=Buffer.concat([Buffer.from("XGR_INTERCHAIN_SET_V2"),Buffer.from(uintWord(validators.length),"hex")]);
 let root=digest("0x"+packed.toString("hex"));
 for(const v of validators){
  if(!A.test(v.address||"")||!/^0x[a-f0-9]{96}$/i.test(v.blsPublicKeyCompressed||""))
   throw Error("Invalid XGR validator commitment input");
  packed=Buffer.concat([Buffer.from(root.slice(2),"hex"),
   Buffer.from(v.address.slice(2),"hex"),
   Buffer.from(digest(v.blsPublicKeyCompressed).slice(2),"hex")]);
  root=digest("0x"+packed.toString("hex"));
 }
 return root;
}
export async function readXDCGenesisFromXGR(root,{rpc=rpcCall}={}){
 const source=JSON.parse(readFileSync(join(root,"config/chains/xgrchain/chain.json"),"utf8"));
 const deployed=JSON.parse(readFileSync(join(root,"deployments/chains/xgrchain.json"),"utf8"));
 const approved=deployed.xitaV315?.components?.validatorRegistry;
 if(source.chainId!==1643||source.domainId!==1643||
  !Array.isArray(source.rpcUrls)||source.rpcUrls.length<2||
  source.rpcUrls[0]===source.rpcUrls[1]||!A.test(approved?.address||"")||
  !H.test(approved?.runtimeCodeKeccak256||"")||
  !String(approved.receiptPath||"").startsWith("deployments/receipts/xgrchain/"))
  throw Error("Receipt-pinned XGR Registry V3 and two source RPCs are required");
 const urls=source.rpcUrls.slice(0,2);
 const heads=await Promise.all(urls.map(async url=>{
  const [id,head]=await Promise.all([rpc(url,"eth_chainId",[]),rpc(url,"eth_blockNumber",[])]);
  if(BigInt(id)!==1643n||BigInt(head)<10n)throw Error("XGR mainnet chain/head unavailable");
  return BigInt(head);
 }));
 // Both XGR endpoints MUST serve the SAME historical committed height.
 const height=(heads[0]<heads[1]?heads[0]:heads[1])-2n;
 const blockTag="0x"+height.toString(16);
 const results=await Promise.all(urls.map(async url=>{
  const [block,bytecode,version,domain,origin,setWord,validatorData]=await Promise.all([
   rpc(url,"eth_getBlockByNumber",[blockTag,false]),
   rpc(url,"eth_getCode",[approved.address,blockTag]),
   rpc(url,"eth_call",[{to:approved.address,data:selector("registryVersion()")},blockTag]),
   rpc(url,"eth_call",[{to:approved.address,data:selector("destinationDomain()")},blockTag]),
   rpc(url,"eth_call",[{to:approved.address,data:selector("originChainId()")},blockTag]),
   rpc(url,"eth_call",[{to:approved.address,data:selector("setId()")},blockTag]),
   rpc(url,"eth_call",[{to:approved.address,data:selector("getValidatorSet()")},blockTag])
  ]);
  if(!H.test(block?.hash||"")||BigInt(block.number)!==height||
   !equal(digest(bytecode),approved.runtimeCodeKeccak256)||
   BigInt(version)!==3n||BigInt(domain)!==1643n||BigInt(origin)!==1643n)
   throw Error("XGR source registry fingerprint or canonical header mismatch");
  const set=decodeXGRValidatorSet(validatorData);
  if(BigInt(set.setId)!==BigInt(setWord))throw Error("XGR validator epoch mismatch");
  const rootCommit=computeXGRSetCommitment(set.validators);
  const onchain=await rpc(url,"eth_call",[{
   to:approved.address,
   data:selector("validatorSetCommitment(uint64)")+encodeAbi(["uint64"],[set.setId]).slice(2)
  },blockTag]);
  if(!equal(onchain,rootCommit))throw Error("XGR validator root not canonical");
  return {setId:set.setId,commitment:rootCommit,validators:set.validators,
   xgrBlockNumber:Number(height),xgrBlockHash:block.hash.toLowerCase(),
   xgrRegistry:approved.address.toLowerCase()};
 }));
 if(JSON.stringify(results[0])!==JSON.stringify(results[1]))
  throw Error("XGR mainnet RPCs disagree on validator root or canonical block");
 return results[0];
}
