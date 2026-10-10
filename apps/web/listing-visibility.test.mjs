import test from "node:test";
import assert from "node:assert/strict";
import {isPublicAsset,publicDirectoryCatalog,listingStatus} from "./listing-visibility.js";
const wrap=(status)=>({listing:{schemaVersion:1,kind:"xita-asset-listing",asset:"ABC",status}});
test("accepted hub and partner assets remain hidden from public catalog",()=>{
 const catalog={assets:{
  ABC:wrap("accepted"),
  XGR:{listing:{kind:"xita-asset-listing",asset:"XGR",status:"accepted",basis:"protocol-hub"}},
  LIVE:{listing:{kind:"xita-asset-listing",asset:"LIVE",status:"public"}}
 }};
 const publicAssets=publicDirectoryCatalog(catalog);
 assert.deepEqual(Object.keys(publicAssets.assets),["LIVE"]);
 assert.equal(listingStatus(catalog.assets.ABC),"accepted");
 assert.equal(listingStatus(catalog.assets.XGR),"accepted");
});
test("current XGRHub remains configured while unpublished XGR has no public planets",async()=>{
 const {readFileSync}=await import("node:fs");
 const catalog=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
 const publicCatalog=publicDirectoryCatalog(catalog);
 assert.equal(isPublicAsset("XGR",catalog.assets.XGR),false);
 assert.equal(Object.keys(publicCatalog.assets).length,0);
 assert.ok(publicCatalog.chains.xgrchain);
 assert.ok(publicCatalog.chains.polygon);
});
test("missing and mismatched manifest cannot publish a token",()=>{
 assert.equal(isPublicAsset("ABC",{listing:{asset:"XYZ",kind:"xita-asset-listing",status:"public"}}),false);
 assert.equal(isPublicAsset("ABC",{}),false);
});
