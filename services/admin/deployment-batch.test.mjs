import test from "node:test";
import assert from "node:assert/strict";
import {nextChainDeployment,nextAssetDeployment,chainDeploymentParameters} from "./deployment-batch.mjs";

const chains=[{name:"xgrchain",chainId:1643},{name:"base",chainId:8453}];
const queue={inventory:{chains,assets:{XGR:{key:"XGR"}}},
 infrastructure:[
  {name:"xgrchain",components:[{key:"validatorRegistry",status:"documented"},
   {key:"ism",status:"documented"}]},
  {name:"base",components:[{key:"blsVerifier",status:"documented"},
   {key:"validatorRegistry",status:"not-deployed"},
   {key:"ism",status:"not-deployed"},
   {key:"transportBundle",status:"not-deployed"}]}
 ]};
test("one click deploys only first missing infrastructure component in canonical order",()=>{
 assert.deepEqual(nextChainDeployment(queue,"base"),{
  kind:"chain",chain:"base",component:"validatorRegistry",id:"base:validatorRegistry"});
 assert.equal(nextChainDeployment(queue,"xgrchain"),null);
 assert.throws(()=>nextChainDeployment(queue,"unknown"),/Unknown/);
 const progressed=structuredClone(queue);
 progressed.infrastructure[1].components[1].status="documented";
 assert.equal(nextChainDeployment(progressed,"base").component,"ism");
});
test("asset batch creates routers once and registers both directions only after both exist",()=>{
 const tasks=[
  {id:"XGR:base:representation",asset:"XGR",kind:"router",chain:"base",
   blockers:[],status:"ready-for-independent-validation"},
  {id:"XGR:base_to_xgr:register",asset:"XGR",kind:"gateway",chain:"base",
   blockers:["Router-Paar"],status:"waiting-dependencies"},
  {id:"XGR:xgr_to_base:register",asset:"XGR",kind:"gateway",chain:"xgrchain",
   blockers:["Router-Paar"],status:"waiting-dependencies"}
 ];
 const first=nextAssetDeployment(queue,tasks,"XGR");
 assert.equal(first.id,"XGR:base:representation");
 assert.equal(first.kind,"asset");
 const waiting=nextAssetDeployment(queue,tasks.slice(1),"XGR");
 assert.equal(waiting.kind,"blocked");
 const enabled=tasks.slice(1).map(t=>({...t,blockers:[],status:"ready-for-independent-validation"}));
 assert.equal(nextAssetDeployment(queue,enabled,"XGR").id,"XGR:base_to_xgr:register");
 assert.equal(nextAssetDeployment(queue,enabled.slice(1),"XGR").id,"XGR:xgr_to_base:register");
 assert.equal(nextAssetDeployment(queue,[],"XGR"),null);
});
test("batch constructor inputs use destination approved and verified values",()=>{
 assert.deepEqual(chainDeploymentParameters("validatorRegistry",{
  evidenceVerified:true,verifiedValidatorCount:4,values:{
   minimumReserveWei:"50",maxExecutorReimbursementWei:"30",perValidatorReserveWei:"100"
  }}),{minimumWei:"50",maxExecutorReimbursementWei:"30",perValidatorWei:"100"});
 assert.throws(()=>chainDeploymentParameters("validatorRegistry",{evidenceVerified:false,
  evidenceError:"BLS proof rejected"}),/BLS proof rejected/);
 assert.deepEqual(chainDeploymentParameters("factory",{values:{sourceFeeWei:"10"}}),{sourceFeeWei:"10"});
 assert.deepEqual(chainDeploymentParameters("ism",{}),{});
});
