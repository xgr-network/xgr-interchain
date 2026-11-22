import test from "node:test";
import assert from "node:assert/strict";
import {assetRouteCards,filterAssetRouteCards} from "./asset-route-view.mjs";
import {approvedWorkInventory} from "./main-gate.mjs";
import {infrastructureInventory} from "./chain-state.mjs";
import {nextAssetRouteTasks} from "./route-factory-draft.mjs";

const root=new URL("../../",import.meta.url).pathname;

test("real Admin inventory shows only matching deployment entries for mixed assets",()=>{
 const inventory=approvedWorkInventory(root);
 for(const asset of Object.values(inventory.assets)){
  const xdc=asset.representations.xdc;
  if(!xdc)continue;
  xdc.deployedContracts=[];
  for(const route of asset.routes.filter(r=>r.source==="xdc"||r.destination==="xdc"))
   Object.assign(route,{status:"not-deployed",instances:[],receipts:[]});
 }
 const plan=nextAssetRouteTasks(inventory,infrastructureInventory(root,inventory.chains));
 const cards=assetRouteCards(inventory.assets,plan.eligibleRoutes,plan.tasks);
 const [open]=filterAssetRouteCards(cards,"open","").filter(card=>card.asset.key==="XGR");
 const [deployed]=filterAssetRouteCards(cards,"deployed","").filter(card=>card.asset.key==="XGR");
 assert.ok(open.tasks.some(task=>task.kind==="router"&&task.chain==="xdc"));
 assert.deepEqual(open.routers,[]);
 assert.deepEqual(open.gateways,[]);
 assert.ok(deployed.routers.some(router=>router.chain==="base"));
 assert.ok(deployed.gateways.some(({route})=>route.source==="base"||route.destination==="base"));
 assert.deepEqual(deployed.tasks,[]);
 assert.equal(deployed.showBatch,false);

 const xdc=filterAssetRouteCards(cards,"all"," XdC ");
 assert.ok(xdc.length);
 for(const card of xdc){
  assert.ok(card.tasks.length);
  assert.ok(card.tasks.every(task=>[task.chain,task.route?.source,task.route?.destination].includes("xdc")));
  assert.deepEqual(card.routers,[]);
  assert.deepEqual(card.gateways,[]);
 }
});

test("partial and network filters scope the visible tasks without enabling a wider batch",()=>{
 const asset={key:"TOKEN",name:"Token",symbol:"TOKEN",representations:{},routes:[
  {name:"first",source:"hub",destination:"one",status:"partial",instances:[]},
  {name:"second",source:"hub",destination:"two",status:"not-deployed",instances:[]}
 ]};
 const tasks=asset.routes.map(({name})=>({asset:"TOKEN",id:"TOKEN:"+name+":register",chain:"hub",kind:"gateway"}));
 const eligible=asset.routes.map(({name})=>({asset:"TOKEN",name}));
 const cards=assetRouteCards({TOKEN:asset},eligible,tasks);
 const [partial]=filterAssetRouteCards(cards,"partial","");
 assert.deepEqual(partial.tasks.map(t=>t.id),[tasks[0].id]);
 assert.equal(partial.showBatch,false);
 const [network]=filterAssetRouteCards(cards,"open","two");
 assert.deepEqual(network.tasks.map(t=>t.id),[tasks[1].id]);
 assert.equal(network.showBatch,false);
 assert.equal(filterAssetRouteCards(cards,"open","TOKEN")[0].showBatch,true);
 assert.deepEqual(filterAssetRouteCards(cards,"deployed",""),[]);
});
