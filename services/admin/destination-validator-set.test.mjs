import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {approvedValidatorSet} from "./bootstrap.mjs";
import {readFinalizedXgrPoSSnapshot,XGR_POS_STAKING_ADDRESS} from "./xgr-pos-snapshot.mjs";
import {selector} from "../../apps/web/keccak.mjs";
const addr=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
const word=n=>BigInt(n).toString(16).padStart(64,"0");
test("Base and Polygon may approve DISTINCT PoS validator sets in their own manifests",()=>{
 const root=mkdtempSync(join(tmpdir(),"xita-sets-"));
 try{
  mkdirSync(join(root,"config/validators"),{recursive:true});
  const a=[addr(1),addr(2),addr(3)],b=[addr(2),addr(3),addr(4),addr(5)];
  const meta=validators=>({schemaVersion:1,kind:"xita-initial-validator-set",originChainId:1643,validators});
  writeFileSync(join(root,"config/validators/initial.json"),JSON.stringify(meta(a)));
  writeFileSync(join(root,"config/validators/polygon.json"),JSON.stringify(meta(b)));
  assert.deepEqual(approvedValidatorSet(root,{initialValidatorsManifest:"config/validators/initial.json"}).validators,a);
  assert.deepEqual(approvedValidatorSet(root,{initialValidatorsManifest:"config/validators/polygon.json"}).validators,b);
  assert.throws(()=>approvedValidatorSet(root,{initialValidatorsManifest:"../../etc/passwd"}),/approved/);
  writeFileSync(join(root,"config/validators/polygon.json"),JSON.stringify(meta([addr(1),addr(1),addr(2)])));
  assert.throws(()=>approvedValidatorSet(root,{initialValidatorsManifest:"config/validators/polygon.json"}),/Invalid/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test("a target chain can select four PoS validators absent from the origin Interchain Registry",async()=>{
 const validators=[addr(201),addr(202),addr(203),addr(204)];
 const keys=validators.map((_,i)=>"0x"+BigInt(i+1).toString(16).padStart(96,"0"));
 const rpc=async(url,method,args)=>{
  assert.equal(url,"https://origin.test");
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_blockNumber")return "0x80";
  if(method==="eth_getBlockByNumber")return {number:"0x7f",hash:"0x"+"a".repeat(64)};
  if(method==="eth_call"){
   assert.equal(args[1],"0x7f");
   assert.equal(args[0].to,XGR_POS_STAKING_ADDRESS);
   const calldata=args[0].data,sig=calldata.slice(0,10);
   if(sig===selector("validators()"))
    return "0x"+word(32)+word(validators.length)+validators.map(a=>a.slice(2).padStart(64,"0")).join("");
   if(sig===selector("validatorInfo(address)")){
    const v="0x"+calldata.slice(-40).toLowerCase();
    const index=validators.findIndex(a=>a.toLowerCase()===v);
    assert.ok(index>=0);
    return "0x"+word(1)+word(1)+word(1000)+word(0)+word(160)+word(48)+
     keys[index].slice(2)+"0".repeat(32);
   }
   throw Error("An origin Interchain Registry is not the source of initial PoS membership");
  }
  throw Error("Unexpected RPC method");
 };
 const snapshot=await readFinalizedXgrPoSSnapshot({
  xgrChain:{chainId:1643,confirmations:1,rpcUrls:["https://origin.test"]},
  initial:{validators},rpc
 });
 assert.equal(snapshot.number,127);
 assert.deepEqual(snapshot.validators.map(v=>v.validator.BLSPublicKey),keys);
});
