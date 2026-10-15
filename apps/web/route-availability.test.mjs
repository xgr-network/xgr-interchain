import test from "node:test";
import assert from "node:assert/strict";
import {deployedFixture} from "./deployed-test-fixture.mjs";
import {deployedRoutes,deployedRouteRecord,isDeployedChain,supportedRouteChains} from "./route-availability.js";
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
