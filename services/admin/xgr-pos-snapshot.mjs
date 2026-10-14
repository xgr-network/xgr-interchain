// Canonical XGRChain PoS membership for the INITIAL destination bootstrap.
// Source: xgr-node contracts/staking/StakingV2.sol, deployed system contract
// 0x1001. This is NOT the XGRChain Interchain ValidatorRegistry V3.
//
// Every eth_call is pinned to the same confirmed XGRChain block. The public
// PoS addresses and BLS keys are evidence only; the destination-specific PoPs
// still need cryptographic verification on the destination BLS verifier.
import {selector} from "../../apps/web/keccak.mjs";
import {rpcCall} from "./inspector.mjs";

export const XGR_POS_STAKING_ADDRESS="0x0000000000000000000000000000000000001001";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const BLOCK_HASH=/^0x[0-9a-f]{64}$/i;
const BLS_KEY=/^0x[0-9a-f]{96}$/i;
const WORD=/^[0-9a-f]{64}$/i;

function readWord(data,index){
 const pos=2+index*64;
 const chunk=data?.slice(pos,pos+64);
 if(!WORD.test(chunk||""))throw Error("Malformed XGRChain PoS StakingV2 ABI response");
 return chunk;
}
function safeNumber(hex,max,label){
 const n=BigInt("0x"+hex);
 if(n>BigInt(max))throw Error("Invalid XGRChain PoS "+label);
 return Number(n);
}
function readBytes(data,offset,maxLength){
 if(offset%32!==0||offset<32||offset>65536)
  throw Error("Invalid XGRChain PoS dynamic ABI offset");
 const start=2+offset*2;
 const lenWord=data?.slice(start,start+64);
 if(!WORD.test(lenWord||""))
  throw Error("Malformed XGRChain PoS dynamic ABI length");
 const len=safeNumber(lenWord,maxLength,"ABI bytes length");
 const hex=data?.slice(start+64,start+64+len*2);
 if(typeof hex!=="string"||hex.length!==len*2||!/^[0-9a-f]*$/i.test(hex))
  throw Error("Truncated XGRChain PoS dynamic ABI result");
 return "0x"+hex;
}
export function decodePoSValidators(data){
 if(!/^0x[0-9a-f]*$/i.test(data||"")||safeNumber(readWord(data,0),65536,"offset")!==32)
  throw Error("Malformed XGRChain PoS validators() response");
 const count=safeNumber(readWord(data,1),4096,"validator count");
 if(count===0)throw Error("XGRChain PoS validator set is empty");
 const out=[],seen=new Set();
 for(let i=0;i<count;i++){
  const value=readWord(data,i+2);
  if(!/^0{24}[0-9a-f]{40}$/i.test(value))
   throw Error("Malformed XGRChain PoS validator address");
  const address="0x"+value.slice(24).toLowerCase();
  if(/^0x0{40}$/.test(address)||seen.has(address))
   throw Error("Duplicate or zero XGRChain PoS validator");
  out.push(address);seen.add(address);
 }
 return out;
}
export function decodePoSValidatorInfo(data){
 if(!/^0x[0-9a-f]*$/i.test(data||""))throw Error("Malformed XGRChain PoS validatorInfo() response");
 const exists=BigInt("0x"+readWord(data,0));
 const active=BigInt("0x"+readWord(data,1));
 if(exists>1n||active>1n)throw Error("Malformed XGRChain PoS active/existence flags");
 const stake=BigInt("0x"+readWord(data,2));
 const deactivated=BigInt("0x"+readWord(data,3));
 const offset=safeNumber(readWord(data,4),65536,"validatorInfo offset");
 if(offset!==160)throw Error("Unexpected XGRChain StakingV2 validatorInfo ABI layout");
 const key=readBytes(data,offset,256);
 if(!BLS_KEY.test(key))throw Error("Invalid XGRChain PoS BLS public key");
 return {exists:exists===1n,active:active===1n,stakeWei:stake.toString(),
  deactivatedAtBlock:deactivated.toString(),blsPublicKey:key.toLowerCase()};
}

// The approved destination list is EXPLICIT, per chain. PoS membership is
// checked against XGRChain's staking source; no Interchain registry needs to
// exist yet on any destination. Read-only, no secrets, CLI, or writes.
export async function readFinalizedXgrPoSSnapshot({
 xgrChain,initial,rpc=rpcCall
}){
 const selected=initial?.validators;
 if(xgrChain?.chainId!==1643||
    !Number.isSafeInteger(xgrChain.confirmations)||xgrChain.confirmations<1||
    !Array.isArray(selected)||selected.length<3||selected.length>128||
    !selected.every(v=>ADDRESS.test(v)&&!/^0x0{40}$/i.test(v))||
    new Set(selected.map(v=>v.toLowerCase())).size!==selected.length)
  throw Error("Invalid destination-pinned XGRChain PoS validator selection");
 const url=xgrChain.rpcUrls?.[0];
 if(typeof url!=="string"||!url.startsWith("https://"))
  throw Error("Unapproved XGRChain PoS RPC URL");
 const [chainId,headHex]=await Promise.all([
  rpc(url,"eth_chainId",[]),rpc(url,"eth_blockNumber",[])
 ]);
 if(BigInt(chainId)!==1643n)throw Error("Wrong XGRChain PoS RPC chain ID");
 const number=BigInt(headHex)-BigInt(xgrChain.confirmations);
 if(number<1n||number>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error("No sufficiently confirmed XGRChain PoS snapshot block");
 const tag="0x"+number.toString(16);
 const [block,allRaw,...records]=await Promise.all([
  rpc(url,"eth_getBlockByNumber",[tag,false]),
  rpc(url,"eth_call",[{to:XGR_POS_STAKING_ADDRESS,data:selector("validators()")},tag]),
  ...selected.map(address=>rpc(url,"eth_call",[{
   to:XGR_POS_STAKING_ADDRESS,
   data:selector("validatorInfo(address)")+address.slice(2).padStart(64,"0")
  },tag]))
 ]);
 if(!block||BigInt(block.number||"0x0")!==number||!BLOCK_HASH.test(block.hash))
  throw Error("Confirmed XGRChain PoS block unavailable");
 const available=new Set(decodePoSValidators(allRaw));
 const keys=new Set();
 const validators=selected.map((address,index)=>{
  const info=decodePoSValidatorInfo(records[index]);
  if(!available.has(address.toLowerCase())||!info.exists||!info.active||
     BigInt(info.stakeWei)===0n)
   throw Error("Validator not active in confirmed XGRChain PoS staking set: "+address);
  if(keys.has(info.blsPublicKey))
   throw Error("Duplicate BLS key in confirmed XGRChain PoS staking set");
  keys.add(info.blsPublicKey);
  return {validator:{Address:address,BLSPublicKey:info.blsPublicKey}};
 });
 return {number:Number(number),hash:block.hash,validators};
}
