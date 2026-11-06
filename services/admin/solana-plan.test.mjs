import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {readSolanaPlan,validateSolanaPlan,probeSolanaPlan,SOLANA_DOMAIN,SOLANA_GENESIS}
 from "./solana-plan.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const source=JSON.parse(readFileSync(resolve(root,"config/chains/solana/integration.json"),"utf8"));
const clone=()=>structuredClone(source);

test("Solana plan is valid but not an active EVM chain",()=>{
 const plan=readSolanaPlan(root);
 assert.equal(plan.domainId,SOLANA_DOMAIN);
 assert.equal(plan.deploymentEnabled,false);
 assert.equal(plan.protocolAdmissionEnabled,false);
 assert.deepEqual(validateSolanaPlan(plan),[]);
 assert.notEqual(plan.networkIdentity.value,undefined);
});
test("Solana plan rejects missing SVM isolation or a second independent operator",()=>{
 const plan=clone();plan.deploymentEnabled=true;
 assert.ok(validateSolanaPlan(plan).some(x=>x.includes("inactive")));
 const other=clone();other.rpcWitnesses[1].operatorId=other.rpcWitnesses[0].operatorId;
 assert.ok(validateSolanaPlan(other).some(x=>x.includes("operator")));
});
test("Solana RPC preflight is diagnostics only, never deployment authorization",async()=>{
 const fetcher=async(url,init)=>{
  const req=JSON.parse(init.body);
  assert.equal(init.method,"POST");
  if(req.method==="getSlot")assert.equal(req.params[0].commitment,"finalized");
  return {ok:true,text:async()=>JSON.stringify({jsonrpc:"2.0",id:1,
   result:req.method==="getGenesisHash"?SOLANA_GENESIS:12345})};
 };
 const result=await probeSolanaPlan(source,{fetcher});
 assert.equal(result.rpcPreflightOK,true);
 assert.equal(result.independentWitnesses,3);
 assert.equal(result.deploymentEnabled,false);
 assert.ok(result.programs.every(x=>x.status==="not-deployed"));
});
test("Solana RPC genesis mismatch is fail-closed",async()=>{
 const fetcher=async(url,init)=>{
  const req=JSON.parse(init.body);
  return {ok:true,text:async()=>JSON.stringify({jsonrpc:"2.0",id:1,
   result:req.method==="getGenesisHash"?(url.includes("publicnode")?"wrong":SOLANA_GENESIS):99})};
 };
 const result=await probeSolanaPlan(source,{fetcher});
 assert.equal(result.independentWitnesses,2);
 assert.equal(result.rpc.find(x=>x.operatorId==="publicnode").healthy,false);
 assert.equal(result.deploymentEnabled,false);
});

test("No operator/GmbH admin, upgrade, pause or freeze authority is allowed",()=>{
 const p=clone();
 p.authorityPolicy.programUpgradeAuthority="gmbh-multisig";
 assert.ok(validateSolanaPlan(p).some(x=>x.includes("permissionless authority")));
 const f=clone();f.authorityPolicy.wrappedFreezeAuthority="service-wallet";
 assert.ok(validateSolanaPlan(f).some(x=>x.includes("permissionless authority")));
 const m=clone();m.authorityPolicy.wrappedMintAuthority="none";
 assert.ok(validateSolanaPlan(m).some(x=>x.includes("permissionless authority")));
});
