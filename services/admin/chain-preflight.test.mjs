import test from "node:test";
import assert from "node:assert/strict";
import {inspectConfiguredChain,negativeCompressedBlsCalldata} from "./chain-preflight.mjs";
import {EIP2537_VECTORS} from "./eip2537-precompile.mjs";
const addr=n=>"0x"+n.repeat(40);
const core={mailbox:addr("a"),merkleTreeHook:addr("b")};
const chain={name:"custom-network",chainId:777,domainId:777,
 rpcUrls:["https://rpc.example.org"],blsVerifierFormat:"compressed"};
const bootstrap={chain:chain.name,chainId:777,verifierAddress:addr("c")};
function mock({wrong=false,eip=false,badVector=false}={}){return async (_url,method,params)=>{
 if(method==="eth_chainId")return wrong?"0x66b":"0x309";
 if(method==="eth_blockNumber")return "0xa";
 if(method==="eth_gasPrice")return "0x5";
 if(method==="eth_getCode")return "0x";
 if(method==="eth_call"){
  if(eip){
   const v=EIP2537_VECTORS.find(x=>x.to===params[0].to&&x.data===params[0].data);
   if(v)return badVector?"0x":v.expected;
   throw Error("Invalid EIP-2537 calldata");
  }
  assert.equal(params[0].to,addr("c"));
  assert.equal(params[0].data,negativeCompressedBlsCalldata());
  return "0x"+"0".repeat(64);
 }
 throw Error("Unknown RPC method");
}}
test("any config-selected compressed verifier gets read-only smoke test",async()=>{
 const result=await inspectConfiguredChain({chain,core,bootstrap,rpc:mock()});
 assert.equal(result.chain,"custom-network");
 assert.equal(result.nativeVerifierAddress,addr("c"));
 assert.equal(result.nativeNegativeVectorRejected,true);
 assert.equal(result.readyToDeploy,false);
});
test("config-selected EIP2537 never probes native address",async()=>{
 const c={...chain,name:"new-spoke",blsVerifierFormat:"eip2537"};
 const result=await inspectConfiguredChain({chain:c,core,bootstrap:{chain:"new-spoke",chainId:777,verifierAddress:null},rpc:mock({eip:true})});
 assert.equal(result.basicRpcPreflightOK,false); // missing Hyperlane core code in mock
 assert.equal(result.eip2537PrecompileVerified,true);
 assert.equal(result.eip2537VectorsPassed,EIP2537_VECTORS.length);
 assert.equal(result.readyToDeploy,false);
});
test("mismatched chain ID is rejected independently of chain names",async()=>{
 const result=await inspectConfiguredChain({chain,core,bootstrap,rpc:mock({wrong:true})});
 assert.equal(result.basicRpcPreflightOK,false);
});

test("EIP-2537 wrong result never approves basic preflight",async()=>{
 const c={...chain,name:"new-spoke",blsVerifierFormat:"eip2537"};
 const result=await inspectConfiguredChain({chain:c,core,bootstrap:{chain:"new-spoke",chainId:777,verifierAddress:null},rpc:mock({eip:true,badVector:true})});
 assert.equal(result.basicRpcPreflightOK,false);
 assert.match(result.error,/vector mismatch/);
 assert.equal(result.readyToDeploy,false);
});
