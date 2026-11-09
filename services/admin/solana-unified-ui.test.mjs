import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {readSolanaPlan,solanaInfrastructurePlan,solanaInfrastructureObservation}
 from "./solana-plan.mjs";
import {buildWorkItems} from "./work-items.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const read=path=>readFileSync(resolve(root,path),"utf8");

test("Solana uses regular infrastructure cards, no standalone Solana panel",()=>{
 const html=read("services/admin/index.html");
 const js=read("services/admin/admin.js");
 const server=read("services/admin/server.mjs");
 assert.ok(html.includes('id="infrastructure-list"'));
 assert.ok(!html.includes("solana-integration-panel"));
 assert.ok(!js.includes("loadSolanaIntegration"));
 assert.ok(js.includes('const svm=c.runtime==="svm"'));
 assert.ok(js.includes('data-probe-native'));
 assert.ok(server.includes('const infrastructure=[...infrastructureInventory(root,queue.inventory.chains),solana]'));
 assert.ok(!server.includes('"/admin/api/solana/plan"'));
});
test("Solana produces blocked tasks using common deployment workqueue shape",()=>{
 const plan=readSolanaPlan(root);
 const solana=solanaInfrastructurePlan(plan);
 const items=buildWorkItems({assets:{}},[solana],[]);
 assert.equal(items.length,solana.required);
 assert.ok(items.every(x=>x.status==="blocked"));
 assert.equal(items.filter(x=>x.runtime==="svm").length,1);
 assert.equal(items.filter(x=>x.runtime==="evm").length,3);
 assert.ok(items.every(x=>x.reason.includes("Wallet-Signer")));
 assert.equal(items.filter(x=>x.network==="xgrchain").length,3);
 assert.ok(items.filter(x=>x.network==="xgrchain").every(x=>x.runtime==="evm"));
 assert.equal(items.filter(x=>x.network==="solana").length,1);
});
test("Solana RPC health cannot mark any SVM or XGR components deployed",()=>{
 const plan=readSolanaPlan(root);
 const observed=solanaInfrastructureObservation(plan,{chain:"solana",
  deploymentEnabled:false,rpcPreflightOK:true,independentWitnesses:2,rpc:[]});
 assert.equal(observed.status,"not-deployed");
 assert.ok(observed.components.every(c=>c.status==="not-deployed"&&!c.live));
});
test("existing EVM wallet/balance/deployment safety separation remains",()=>{
 const js=read("services/admin/admin.js");
 assert.ok(js.includes('filter(c=>c.runtime!=="svm").map(async c=>'));
 assert.ok(js.includes('filter(c=>c.runtime!=="svm").map(async chain=>'));
 const server=read("services/admin/server.mjs");
 assert.ok(server.includes('if(requested==="solana")'));
 assert.ok(server.includes('verifyChainInfrastructure(configured)'));
});
