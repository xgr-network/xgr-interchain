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
 assert.equal(bsc.status,bsc.documented===bsc.required?"documented":"partial");
 assert.ok(bsc.documented>=1&&bsc.documented<=bsc.required);
 assert.equal(bsc.required,9);
 if(bsc.documented<bsc.required){
  const next=nextChainDeployment({inventory,infrastructure},"bsc");
  assert.ok(next?.component);
  assert.equal(bsc.components.find(x=>x.key===next.component)?.status,"not-deployed");
 }
 const plan=buildDeploymentPlan(inventory,infrastructure,inventory.chains.map(c=>bootstrapPlan(root,c)));
 const steps=plan.chains.find(c=>c.name==="bsc").steps;
 assert.equal(steps[0].component,"blsVerifier");
 assert.equal(steps[1].component,"validatorRegistry");
 assert.equal(steps.at(-2).component,"sourceRegistry");
});
test("BSC bootstrap uses reviewed economics and keeps public BLS proof verification separate",()=>{
 const chain=approvedWorkInventory(root).chains.find(c=>c.name==="bsc");
 const boot=bootstrapPlan(root,chain);
 assert.equal(boot.ready,true);
 assert.equal(boot.reserveWei,"450000000000000");
 assert.equal(boot.proposedFeeWei,"100000000000");
 assert.equal(boot.verifierAddress,null);
 assert.equal(boot.initialValidators.length,3);
 assert.deepEqual(boot.missing,[]);
 assert.equal(boot.reserve.minimumWei,"112500000000000");
 assert.equal(boot.reserve.maxExecutorReimbursementWei,"75000000000000");
 assert.equal(boot.reserve.perValidatorWei,"150000000000000");
 const config=load("config/chains/bsc/bootstrap.json");
 assert.equal(config.destinationDomain,56);
 assert.equal(config.genesisValidatorManifest,"config/validators/initial.json");
});
test("published catalog mirrors BSC's undeployed infrastructure only",()=>{
 const catalog=load("apps/web/catalog.json");
 assert.equal(catalog.chains.bsc.chainId,56);
 assert.equal(catalog.chains.bsc.receiptFinalityTag,"finalized");
 assert.equal(catalog.infrastructure.bsc.present,true);
 assert.ok(catalog.infrastructure.bsc.xitaV315.components.blsVerifier);
 assert.ok(Object.keys(catalog.infrastructure.bsc.xitaV315.components).length>=1);
 assert.ok(catalog.infrastructure.bsc.xitaV315.receiptPaths.length>=1);
});
