import test from "node:test";
import assert from "node:assert/strict";
import {negativeNativeBlsCalldata,inspectXgrFirstDeploy,XGR_NATIVE_VERIFIER} from "./xgr-preflight.mjs";
const MAIL="0x"+"a".repeat(40),HOOK="0x"+"b".repeat(40);
function rpcMock({chain="0x66b",negative="0x"+"0".repeat(64)}={}){
 return async (_url,method,params)=>{
  if(method==="eth_chainId")return chain;
  if(method==="eth_blockNumber")return "0x100";
  if(method==="eth_gasPrice")return "0xe8d4a51000";
  if(method==="eth_getCode")return params[0].toLowerCase()===XGR_NATIVE_VERIFIER.toLowerCase()?"0x":"0x6000";
  if(method==="eth_call"){assert.equal(params[0].to,XGR_NATIVE_VERIFIER);assert.equal(params[0].data,negativeNativeBlsCalldata());return negative;}
  throw Error("Unexpected RPC method "+method);
 };
}
test("native 0x2040 precompile uses encoded negative vector and stays non-executable",async()=>{
 const data=negativeNativeBlsCalldata();
 assert.match(data,/^0x[0-9a-f]+$/);
 const status=await inspectXgrFirstDeploy({url:"https://rpc.xgr.network",mailbox:MAIL,merkleTreeHook:HOOK,rpc:rpcMock()});
 assert.equal(status.codeAtPrecompile,"0x");
 assert.equal(status.nativeNegativeVectorRejected,true);
 assert.equal(status.basicRpcPreflightOK,true);
 assert.equal(status.nativeBlsVerified,false);
 assert.equal(status.readyToDeploy,false);
 assert.equal(status.positiveBlsVector,"not-tested");
});
test("wrong chain, malformed verifier response and invalid RPC all fail closed",async()=>{
 let x=await inspectXgrFirstDeploy({url:"https://rpc.xgr.network",mailbox:MAIL,merkleTreeHook:HOOK,rpc:rpcMock({chain:"0x2105"})});
 assert.equal(x.basicRpcPreflightOK,false);assert.equal(x.readyToDeploy,false);
 x=await inspectXgrFirstDeploy({url:"https://rpc.xgr.network",mailbox:MAIL,merkleTreeHook:HOOK,rpc:rpcMock({negative:"0x"+"0".repeat(63)+"1"})});
 assert.equal(x.nativeNegativeVectorRejected,false);assert.equal(x.readyToDeploy,false);
 await assert.rejects(()=>inspectXgrFirstDeploy({url:"http://localhost",mailbox:MAIL,merkleTreeHook:HOOK}),/HTTPS/);
});
