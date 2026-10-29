import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {bootstrapPlan} from "./bootstrap.mjs";
import {buildDeploymentPlan} from "./deployment-sequence.mjs";
import {nextChainDeployment} from "./deployment-batch.mjs";

const root=new URL("../../",import.meta.url).pathname;
const load=path=>JSON.parse(readFileSync(join(root,path),"utf8"));

test("BSC is available in generic Admin without a contract or active route",()=>{
 const inventory=approvedWorkInventory(root);
 const chain=inventory.chains.find(c=>c.name==="bsc");
 assert.ok(chain);
 assert.equal(chain.chainId,56);
 assert.equal(chain.domainId,56);
 assert.equal(chain.nativeCurrency.symbol,"BNB");
 assert.equal(chain.blsVerifierFormat,"eip2537");
 assert.equal(chain.receiptFinalityTag,"finalized");
 assert.equal(chain.observedInfrastructure,"deployments/chains/bsc.json");
 assert.equal(inventory.routes.some(r=>r.source==="bsc"||r.destination==="bsc"),false);
 const infrastructure=infrastructureInventory(root,inventory.chains);
 const bsc=infrastructure.find(c=>c.name==="bsc");
 assert.equal(bsc.status,"not-deployed");
 assert.equal(bsc.documented,0);
 assert.equal(bsc.required,9);
 assert.equal(nextChainDeployment({inventory,infrastructure},"bsc").component,"blsVerifier");
 const plan=buildDeploymentPlan(inventory,infrastructure,inventory.chains.map(c=>bootstrapPlan(root,c)));
 const steps=plan.chains.find(c=>c.name==="bsc").steps;
 assert.equal(steps[0].component,"blsVerifier");
 assert.equal(steps[1].component,"validatorRegistry");
 assert.equal(steps.at(-2).component,"sourceRegistry");
});
test("BSC bootstrap refuses to invent economic terms or BLS proof evidence",()=>{
 const chain=approvedWorkInventory(root).chains.find(c=>c.name==="bsc");
 const boot=bootstrapPlan(root,chain);
 assert.equal(boot.ready,false);
 assert.equal(boot.reserveWei,null);
 assert.equal(boot.proposedFeeWei,null);
 assert.equal(boot.verifierAddress,null);
 assert.equal(boot.initialValidators.length,3);
 assert.ok(boot.missing.some(v=>v.includes("Reserve")));
 assert.ok(boot.missing.some(v=>v.includes("Source")));
 const config=load("config/chains/bsc/bootstrap.json");
 assert.equal(config.destinationDomain,56);
 assert.equal(config.genesisValidatorManifest,"config/validators/initial.json");
});
test("published catalog mirrors BSC's undeployed infrastructure only",()=>{
 const catalog=load("apps/web/catalog.json");
 assert.equal(catalog.chains.bsc.chainId,56);
 assert.equal(catalog.chains.bsc.receiptFinalityTag,"finalized");
 assert.equal(catalog.infrastructure.bsc.present,false);
 assert.deepEqual(catalog.infrastructure.bsc.xitaV315.components,{});
 assert.deepEqual(catalog.infrastructure.bsc.xitaV315.receiptPaths,[]);
});
