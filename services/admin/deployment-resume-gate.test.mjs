import test from "node:test";
import assert from "node:assert/strict";
import {advanceDeploymentBeforeSignature} from "./deployment-resume-gate.mjs";

test("asset batch uses the existing server-side nonce and receipt recovery before signing",async()=>{
 const calls=[];
 const post=async(path,payload)=>{calls.push({path,payload});return {result:{stage:"ready",retryReason:"wallet-nonce-unused"}}};
 const result=await advanceDeploymentBeforeSignature({post,type:"asset",target:"XGR"});
 assert.equal(result.stage,"ready");
 assert.equal(result.retryReason,"wallet-nonce-unused");
 assert.deepEqual(calls,[{path:"/admin/api/deploy/advance",payload:{type:"asset",target:"XGR"}}]);
});
test("a previous submitted transaction stays pending; never interpreted as permission to resend",async()=>{
 const hash="0x"+"1".repeat(64);
 const result=await advanceDeploymentBeforeSignature({post:async()=>({result:{stage:"pending",txHash:hash,reason:"confirmations"}}),type:"asset",target:"XGR"});
 assert.equal(result.stage,"pending");assert.equal(result.txHash,hash);
});
test("a recovered confirmed contract is documented without a new wallet request",async()=>{
 const result=await advanceDeploymentBeforeSignature({post:async()=>({result:{stage:"documented",commit:"a".repeat(40)}}),type:"asset",target:"XGR"});
 assert.equal(result.stage,"documented");
});
test("chain batch shares the exact same continuation gate",async()=>{
 const calls=[];
 await advanceDeploymentBeforeSignature({post:async(path,data)=>{calls.push(data);return {result:{stage:"ready"}}},type:"chain",target:"base"});
 assert.deepEqual(calls,[{type:"chain",target:"base"}]);
});
test("missing, failed or malformed recovery does not authorize a new signature",async()=>{
 for(const result of [undefined,{stage:"bogus"},{}])
  await assert.rejects(()=>advanceDeploymentBeforeSignature({post:async()=>({result}),type:"asset",target:"XGR"}),/Invalid deployment recovery response/);
 await assert.rejects(()=>advanceDeploymentBeforeSignature({post:async()=>{throw Error("RPC unavailable")},type:"asset",target:"XGR"}),/RPC unavailable/);
});
