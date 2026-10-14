import test from "node:test";
import assert from "node:assert/strict";
import {selector} from "../../apps/web/keccak.mjs";
import {XGR_POS_STAKING_ADDRESS,decodePoSValidators,
 decodePoSValidatorInfo,readFinalizedXgrPoSSnapshot} from "./xgr-pos-snapshot.mjs";

const word=n=>BigInt(n).toString(16).padStart(64,"0");
const addr=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
const validators=[addr(11),addr(12),addr(13),addr(14)];
const keys=validators.map((_,i)=>"0x"+BigInt(i+1).toString(16).padStart(96,"0"));
const validatorsABI=addresses=>"0x"+word(32)+word(addresses.length)+
 addresses.map(x=>x.slice(2).padStart(64,"0")).join("");
const validatorInfoABI=(key,{active=true,exists=true,stake=1000}={})=>
 "0x"+word(exists?1:0)+word(active?1:0)+word(stake)+word(0)+word(160)+
 word(48)+key.slice(2)+"0".repeat(32);
function fixture({missing=false,inactive=false,duplicate=false,badBlock=false}={}){
 const calls=[];
 const rpc=async(url,method,args)=>{
  calls.push({url,method,args});
  assert.equal(url,"https://xgr.test");
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_blockNumber")return "0x80";
  if(method==="eth_getBlockByNumber"){
   assert.deepEqual(args,["0x7f",false]);
   return {number:"0x7f",hash:"0x"+(badBlock?"0":"a").repeat(64)};
  }
  assert.equal(method,"eth_call");
  assert.equal(args[0].to,XGR_POS_STAKING_ADDRESS);
  assert.equal(args[1],"0x7f");
  const calldata=args[0].data;
  if(calldata===selector("validators()"))return validatorsABI(missing?validators.slice(1):validators);
  assert.equal(calldata.slice(0,10),selector("validatorInfo(address)"));
  const account="0x"+calldata.slice(-40).toLowerCase();
  const i=validators.findIndex(a=>a.toLowerCase()===account);
  assert.ok(i>=0);
  return validatorInfoABI(duplicate&&i===1?keys[0]:keys[i],{active:!inactive||i!==0});
 };
 return {rpc,calls};
}
const input=()=>({xgrChain:{chainId:1643,confirmations:1,rpcUrls:["https://xgr.test"]},
 initial:{validators:validators.slice(0,3)}});

test("ABI decoders parse standard PoS validators() and validatorInfo(address) responses",()=>{
 assert.deepEqual(decodePoSValidators(validatorsABI(validators)),validators.map(x=>x.toLowerCase()));
 assert.deepEqual(decodePoSValidatorInfo(validatorInfoABI(keys[0])),{
  exists:true,active:true,stakeWei:"1000",deactivatedAtBlock:"0",blsPublicKey:keys[0]});
 assert.throws(()=>decodePoSValidators("0x"+word(0)+word(3)),/Malformed/);
 assert.throws(()=>decodePoSValidators(validatorsABI([validators[0],validators[0]])),/Duplicate/);
 assert.throws(()=>decodePoSValidatorInfo("0x"+word(2)+word(1)+word(1)+word(0)+word(160)+word(48)+keys[0].slice(2)),/flags/);
 assert.throws(()=>decodePoSValidatorInfo("0x"+word(1)+word(1)+word(1)+word(0)+word(128)+word(48)+keys[0].slice(2)),/layout/);
});
test("initial destination membership is verified at one confirmed XGR PoS block",async()=>{
 const {rpc,calls}=fixture();
 const result=await readFinalizedXgrPoSSnapshot({...input(),rpc});
 assert.equal(result.number,127);
 assert.equal(result.hash,"0x"+"a".repeat(64));
 assert.deepEqual(result.validators.map(v=>v.validator.Address),validators.slice(0,3));
 assert.deepEqual(result.validators.map(v=>v.validator.BLSPublicKey),keys.slice(0,3));
 assert.equal(calls.filter(x=>x.method==="eth_call").length,4);
 assert.equal(calls.filter(x=>x.method==="eth_call"&&x.args[1]!=="0x7f").length,0);
});
test("non-members, inactive validators and duplicate BLS keys cannot be bootstrapped",async()=>{
 await assert.rejects(()=>readFinalizedXgrPoSSnapshot({...input(),rpc:fixture({missing:true}).rpc}),
  /not active in confirmed XGRChain PoS/);
 await assert.rejects(()=>readFinalizedXgrPoSSnapshot({...input(),rpc:fixture({inactive:true}).rpc}),
  /not active in confirmed XGRChain PoS/);
 await assert.rejects(()=>readFinalizedXgrPoSSnapshot({...input(),rpc:fixture({duplicate:true}).rpc}),
  /Duplicate BLS key/);
});
test("invalid or insufficiently finalized XGR origin is never accepted",async()=>{
 const x=input();
 const {rpc}=fixture();
 await assert.rejects(()=>readFinalizedXgrPoSSnapshot({
  ...x,xgrChain:{...x.xgrChain,chainId:8453},rpc}),/Invalid destination-pinned/);
 await assert.rejects(()=>readFinalizedXgrPoSSnapshot({
  ...x,xgrChain:{...x.xgrChain,confirmations:128},rpc}),/No sufficiently confirmed/);
 const bad=async(url,method,args)=>method==="eth_getBlockByNumber"?
  {number:"0x7e",hash:"0x"+"a".repeat(64)}:rpc(url,method,args);
 await assert.rejects(()=>readFinalizedXgrPoSSnapshot({...x,rpc:bad}),
  /Confirmed XGRChain PoS block unavailable/);
});
