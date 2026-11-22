import test from "node:test";
import assert from "node:assert/strict";
import {assetRouteCards,matchesAssetRouteCard} from "./asset-route-view.mjs";

test("a deployed asset with open routes still appears under open deployments",()=>{
 const asset={key:"TOKEN",name:"Token",symbol:"TOKEN",canonicalChain:"hub",
  routes:[
   {name:"current",source:"hub",destination:"first",status:"deployed"},
   {name:"new",source:"second",destination:"hub",status:"not-deployed"},
   {name:"ineligible",source:"hub",destination:"third",status:"not-deployed"}
  ]};
 const eligible=asset.routes.slice(0,2).map(({name})=>({asset:asset.key,name}));
 const [card]=assetRouteCards({TOKEN:asset},eligible);
 assert.equal(card.status,"partial");
 assert.equal(card.complete,1);
 assert.equal(matchesAssetRouteCard(card,"open","second"),true);
 assert.equal(matchesAssetRouteCard(card,"open","third"),false);
 assert.equal(matchesAssetRouteCard(card,"deployed",""),false);

 for(const status of ["partial","deployed"]){
  asset.routes[1].status=status;
  const [updated]=assetRouteCards({TOKEN:asset},eligible);
  assert.equal(matchesAssetRouteCard(updated,"open",""),status==="partial");
 }
});
