import test from "node:test";
import assert from "node:assert/strict";
import {deployedFixture} from "./deployed-test-fixture.mjs";
import {deployedRoutes,deployedRouteRecord,isDeployedChain,supportedRouteChains,documentedExecutionGateway,executableTransferRoutes} from "./route-availability.js";
import {buildExperienceModel,renderPlanRoute} from "./experience.js";
const hash=d=>"0x"+d.repeat(64),addr=d=>"0x"+d.repeat(40);
function catalog(){
 const asset=deployedFixture("ABC","xgrchain"),xgr=asset.deployment.routeDeployments;
 const infra=key=>{
  const items=Object.fromEntries(["factory","sourceRegistry","mailbox","ism","validatorRegistry"].map((name,i)=>{
   const address=addr(String(i+1));
   return [name,{address,runtimeCodeKeccak256:hash("e"),receiptPath:
    "deployments/receipts/"+key+"/"+("a".repeat(64))+"-"+address.slice(2)+".json"}];
  }));
  return {present:true,chainId:key==="base"?8453:1643,xitaV315:{
   components:items,receiptPaths:Object.values(items).map(x=>x.receiptPath)}};
 };
 return {chains:{xgrchain:{chainId:1643},base:{chainId:8453},polygon:{chainId:137}},
  infrastructure:{xgrchain:infra("xgrchain"),base:infra("base"),polygon:{present:false}},
  assets:{ABC:asset}};
}
test("two fully documented directed routes are transfer candidates immediately",()=>{
 const c=catalog(),routes=deployedRoutes(c);
 assert.equal(routes.length,2);
 assert.deepEqual(supportedRouteChains(c),["xgrchain","base"]);
 assert.equal(isDeployedChain(c,"base"),true);
 assert.ok(routes.every(r=>r.gateway&&r.feeVault&&r.sourceRouter&&r.destinationRouter));
});
test("a configured-only spoke is never offered as a transferable route",()=>{
 const c=catalog();c.assets.ABC.metadata.representations.push({
  chain:"polygon",representation:"synthetic",symbol:"wABC"});
 c.assets.ABC.routes.routes.push({name:"xgr_to_polygon",sourceChain:"xgrchain",destinationChain:"polygon"});
 assert.equal(deployedRoutes(c).length,2);
 assert.equal(supportedRouteChains(c).includes("polygon"),false);
});
test("incomplete or forged deployment documentation never unlocks transfers",()=>{
 const mutate=[
  c=>{c.infrastructure.base.present=false;},
  c=>{delete c.infrastructure.base.xitaV315.components.mailbox;},
  c=>{c.assets.ABC.deployment.routeDeployments[0].components.feeVault=null;},
  c=>{c.assets.ABC.deployment.receiptPaths=[];},
  c=>{c.assets.ABC.deployment.present=false;},
  c=>{c.assets.ABC.deployment.routeDeployments[0].routeId="bad";},
  c=>{c.assets.ABC.deployment.routeDeployments.push(structuredClone(c.assets.ABC.deployment.routeDeployments[0]));}
 ];
 for(const fn of mutate){const c=catalog();fn(c);assert.ok(deployedRoutes(c).length<2);}
});

function deployFeeGateway(c,chain,seed){
 const contract={address:addr(seed),runtimeCodeKeccak256:hash("e"),
  receiptPath:"deployments/receipts/"+chain+"/"+("a".repeat(64))+"-"+seed.repeat(40)+".json"};
 const core=c.infrastructure[chain].xitaV315;
 core.components.executionGateway=contract;
 core.receiptPaths.push(contract.receiptPath);
}
test("the public commercial transfer UI remains closed until BOTH execution gateways are documented",()=>{
 const c=catalog(),history=deployedRoutes(c);
 assert.equal(history.length,2,"Canonical existing ILN operations remain discoverable");
 assert.equal(executableTransferRoutes(c).length,0);
 const before=renderPlanRoute(buildExperienceModel(c));
 assert.match(before,/Interchain Fee · Execution Gateway/);
 assert.doesNotMatch(before,/<option value="xgrchain"/);
 assert.doesNotMatch(before,/<option value="base"/);
 deployFeeGateway(c,"xgrchain","d");
 assert.equal(documentedExecutionGateway(c,"xgrchain"),addr("d"));
 assert.equal(executableTransferRoutes(c).length,0,"A partial chain rollout is NOT a live route");
 assert.doesNotMatch(renderPlanRoute(buildExperienceModel(c)),/<option value="xgrchain"/);
 deployFeeGateway(c,"base","e");
 assert.equal(executableTransferRoutes(c).length,2);
 const ready=renderPlanRoute(buildExperienceModel(c));
 assert.match(ready,/<option value="xgrchain"/);
 assert.match(ready,/<option value="base"/);
 c.infrastructure.base.xitaV315.receiptPaths.pop();
 assert.equal(executableTransferRoutes(c).length,0,"Missing GitHub receipt deactivates commercial transfer");
 assert.equal(deployedRoutes(c).length,2,"Historical Gateway discovery never depends on GmbH fee contract");
});
test("old source locks stay recoverable when the new commercial gateway is absent",()=>{
 const c=catalog(),account=addr("a"),txHash=hash("b");
 const html=renderPlanRoute(buildExperienceModel(c),{origin:"xgrchain",destination:"base",asset:"ABC"},"ready",
  {account},{items:[{account,txHash,sourceChain:"xgrchain",destinationChain:"base",
   asset:"ABC",status:"awaiting-proof",confirmed:true,delivered:false}],
   selectedTxHash:txHash});
 assert.match(html,/Previous transfers awaiting delivery/);
 assert.match(html,/<option value="xgrchain"/);
 assert.match(html,/Continue delivery/);
 assert.match(html,/Source confirmed/);
 assert.doesNotMatch(html,/<button type="button" class="ux-button" id="xita-transfer-primary" disabled/);
});

test("collateral source must use underlying ERC20 rather than the router address",()=>{
 const c=catalog();
 const original=deployedFixture("XYZ","base");
 c.assets.XYZ=original;
 const outgoing=deployedRoutes(c).find(r=>r.asset==="XYZ"&&r.source==="base");
 const reverse=deployedRoutes(c).find(r=>r.asset==="XYZ"&&r.source==="xgrchain");
 assert.ok(outgoing&&reverse,"both collateral/synthetic routes must be discoverable");
 const token=original.metadata.representations.find(r=>r.chain==="base").assetAddress;
 assert.equal(outgoing.sourceToken,token);
 assert.notEqual(outgoing.sourceToken,outgoing.sourceRouter);
 assert.equal(reverse.sourceToken,reverse.sourceRouter,"synthetic ERC20 is its own Warp router");
 const incomplete=structuredClone(c);
 incomplete.assets.XYZ.metadata.representations.find(r=>r.chain==="base").assetAddress=null;
 assert.equal(deployedRoutes(incomplete).some(r=>r.asset==="XYZ"&&r.source==="base"),false);
 const mismatch=structuredClone(c);
 mismatch.assets.XYZ.metadata.representations.find(r=>r.chain==="base").representation="synthetic";
 assert.equal(deployedRoutes(mismatch).some(r=>r.asset==="XYZ"),false,
  "a contradictory manifest must not expose either direction as transferable");
});
