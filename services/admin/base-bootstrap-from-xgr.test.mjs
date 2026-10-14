import test from "node:test";
import assert from "node:assert/strict";
import {prepareBaseFromXgr} from "./base-bootstrap-from-xgr.mjs";
import {XGR_POS_STAKING_ADDRESS} from "./xgr-pos-snapshot.mjs";
import {selector} from "../../apps/web/keccak.mjs";

const word=n=>BigInt(n).toString(16).padStart(64,"0");
const addr=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");

test("invalid initial membership, wrong chain and missing proofs fail before RPC",async()=>{
 await assert.rejects(()=>prepareBaseFromXgr({
  xgrChain:{chainId:1643},baseChain:{chainId:8453,domainId:8453},
  initial:{originChainId:1643,validators:[]},bootstrap:{destinationDomain:8453},proofs:[]
 }),/Invalid pinned/);
});

test("Base public PoP precheck reads ONLY XGRChain StakingV2, not an Interchain Registry",async()=>{
 // The native verifier return is simulated; a real verifier is still required
 // for authorization to perform a paid destination deployment.
 const validators=[addr(1),addr(2),addr(3)];
 const proofs=validators.map((validator,i)=>{
  const x=BigInt(i+1).toString(16).padStart(96,"0");
  const y=BigInt(i+12).toString(16).padStart(96,"0");
  const key="0x80"+x.slice(2);
  const eip="0x"+"0".repeat(32)+x+"0".repeat(32)+y;
  const payload="0x"+Buffer.from("XGR_INTERCHAIN_BOOTSTRAP_V1").toString("hex")+
   "000000000000066b"+"00002105"+validator.slice(2)+
   "0030"+key.slice(2)+"0080"+eip.slice(2);
  return {validator,originChainId:1643,destinationDomain:8453,blsPublicKey:key,
   blsPublicKeyEIP2537:eip,possessionProof:"0x"+"0".repeat(512),payload};
 });
 const origin={name:"xgrchain",chainId:1643,domainId:1643,confirmations:12,
  rpcUrls:["https://xgr.test"],blsVerifierFormat:"compressed"};
 const base={name:"base",chainId:8453,domainId:8453,confirmations:12,
  rpcUrls:["https://base.test"],blsVerifierFormat:"eip2537"};
 const bootstrap={chain:"base",chainId:8453,destinationDomain:8453,
  membershipOriginChainId:1643,verifierFormat:"eip2537",
  validatorSnapshot:{blockNumber:null,validators:[]},reserve:{}};
 const initial={originChainId:1643,validators};
 const hash="0x"+"a".repeat(64);
 let posCalls=0,verifierCalls=0;
 const rpc=async(url,method,args)=>{
  assert.equal(url,"https://xgr.test");
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_blockNumber")return "0x77";
  if(method==="eth_getBlockByNumber")return {number:"0x6b",hash};
  if(method!=="eth_call")throw Error("Unexpected method "+method);
  const to=args[0].to.toLowerCase();
  if(to===XGR_POS_STAKING_ADDRESS){
   posCalls++;assert.equal(args[1],"0x6b");
   const data=args[0].data;
   if(data===selector("validators()"))
    return "0x"+word(32)+word(validators.length)+validators.map(a=>a.slice(2).padStart(64,"0")).join("");
   if(data.startsWith(selector("validatorInfo(address)"))){
    const i=validators.findIndex(v=>v.toLowerCase()==="0x"+data.slice(-40).toLowerCase());
    assert.ok(i>=0);
    return "0x"+word(1)+word(1)+word(1000)+word(0)+word(160)+word(48)+
     proofs[i].blsPublicKey.slice(2)+"0".repeat(32);
   }
   throw Error("Unexpected staking method");
  }
  if(to==="0x0000000000000000000000000000000000002040"){
   verifierCalls++;
   assert.ok(args[0].data.startsWith(selector("verify(bytes,bytes[],bytes,bytes)")));
   return "0x"+word(1);
  }
  throw Error("Unexpected origin Interchain Registry access");
 };
 const result=await prepareBaseFromXgr({xgrChain:origin,baseChain:base,
  initial,bootstrap,proofs,rpc});
 assert.equal(result.report.verifiedValidatorCount,3);
 assert.equal(result.staking.address,XGR_POS_STAKING_ADDRESS);
 assert.equal(result.staking.blockNumber,107);
 assert.equal(result.candidate.validatorSnapshot.blockNumber,107);
 assert.equal(result.candidate.validatorSnapshot.validators[2].destinationDomain,8453);
 assert.equal(result.proofMode,"xgr-native-precheck-only");
 assert.equal(result.destinationVerifierVerified,false);
 assert.equal(result.deploymentAuthorized,false);
 assert.equal(posCalls,4);
 assert.equal(verifierCalls,3);
 const wrong=proofs.map(x=>({...x}));
 wrong[2].destinationDomain=1643;
 await assert.rejects(()=>prepareBaseFromXgr({xgrChain:origin,baseChain:base,
  initial,bootstrap,proofs:wrong,rpc}),/Base-domain PoP differs/);
});
