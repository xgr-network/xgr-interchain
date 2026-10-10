import test from "node:test";
import assert from "node:assert/strict";
import {isPublicAsset,publicDirectoryCatalog,listingStatus} from "./listing-visibility.js";
const wrap=(status)=>({listing:{schemaVersion:1,kind:"xita-asset-listing",asset:"ABC",status}});
test("accepted assets are direct-link only and never searchable/listed",()=>{
 const catalog={assets:{ABC:wrap("accepted"),XGR:{listing:{kind:"xita-asset-listing",asset:"XGR",status:"public"}}}};
 const publicAssets=publicDirectoryCatalog(catalog);
 assert.deepEqual(Object.keys(publicAssets.assets),["XGR"]);
 assert.equal(listingStatus(catalog.assets.ABC),"accepted");
});
test("missing and mismatched manifest cannot publish a token",()=>{
 assert.equal(isPublicAsset("ABC",{listing:{asset:"XYZ",kind:"xita-asset-listing",status:"public"}}),false);
 assert.equal(isPublicAsset("ABC",{}),false);
});
