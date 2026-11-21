import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {readSolanaPlan,validateSolanaPlan,probeSolanaPlan,solanaInfrastructurePlan,solanaInfrastructureObservation,SOLANA_DOMAIN,SOLANA_GENESIS}
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

test("Solana mirrors EVM BLS quorum, per-route fees, owned routers and optional service isolation",()=>{
 const valid=clone();
 assert.deepEqual(validateSolanaPlan(valid),[]);
 const quorum=clone();quorum.evmParity.feeUpdates="gmbh-admin";
 assert.ok(validateSolanaPlan(quorum).some(x=>x.includes("protocol invariants")));
 const routes=clone();routes.evmParity.routeRegistration="manual-approval";
 assert.ok(validateSolanaPlan(routes).some(x=>x.includes("protocol invariants")));
 const service=clone();service.authorityPolicy.serviceOperatorAdmin="none";
 assert.ok(validateSolanaPlan(service).some(x=>x.includes("permissionless authority")));
 const owner=clone();owner.authorityPolicy.serviceOperatorAdmin="core-protocol-owner";
 assert.ok(validateSolanaPlan(owner).some(x=>x.includes("permissionless authority")));
});

test("Solana is represented in the shared infrastructure schema, never as EVM",()=>{
 const plan=clone(),infra=solanaInfrastructurePlan(plan);
 assert.equal(infra.runtime,"svm");
 assert.equal(infra.chainId,null);
 assert.equal(infra.domainId,SOLANA_DOMAIN);
 assert.equal(infra.deployable,false);
 assert.equal(infra.documented,0);
 assert.equal(infra.required,4);
 assert.equal(infra.components.filter(x=>x.network==="solana").length,1);
 assert.equal(infra.components[0].key,"xitaProtocol");
 assert.equal(infra.components[0].modules.length,8);
 assert.equal(infra.components.filter(x=>x.network==="xgrchain").length,3);
 assert.deepEqual(infra.components.slice(1).map(x=>x.key),["solanaValidatorRegistry","solanaHubFactory","solanaHub"]);
 assert.ok(infra.components.slice(1).every(x=>x.runtime==="evm"));
 assert.ok(infra.components.every(x=>x.status==="not-deployed"&&!x.deployable));
});
test("RPC witness health cannot make any Solana programs deployed",()=>{
 const plan=clone();
 const probe={chain:"solana",deploymentEnabled:false,rpcPreflightOK:true,
  independentWitnesses:3,rpc:[]};
 const status=solanaInfrastructureObservation(plan,probe);
 assert.equal(status.status,"not-deployed");
 assert.equal(status.rpc,true);
 assert.ok(status.components.every(x=>x.status==="not-deployed"&&x.live===false));
});
