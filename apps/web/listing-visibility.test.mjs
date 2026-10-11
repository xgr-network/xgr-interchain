import test from "node:test";
import assert from "node:assert/strict";
import {isDeployedAsset,isPublicAsset,publicDirectoryCatalog,listingStatus} from "./listing-visibility.js";
import {deployedFixture} from "./deployed-test-fixture.mjs";
const asset=()=>deployedFixture("ABC");
const view=(status,assetId=asset().metadata.assetId)=>({schemaVersion:1,kind:"xita-visibility-v1",
 assets:{ABC:{status,assetId}}});
test("prospect has no token page and no public listing",()=>{
 const a=asset();a.deployment.present=false;
 assert.equal(listingStatus(a),"prospect");
 assert.equal(isDeployedAsset(a),false);
 assert.equal(isPublicAsset("ABC",a,view("public")),false);
});
test("all router and route receipts are required for deployed token",()=>{
 const a=asset();assert.equal(isDeployedAsset(a),true);
 assert.equal(listingStatus(a),"unknown");
 const partial=structuredClone(a);partial.deployment.routeDeployments[0].components.feeVault=null;
 assert.equal(isDeployedAsset(partial),false);
 const absent=structuredClone(a);absent.deployment.representations.pop();
 assert.equal(isDeployedAsset(absent),false);
 const unrelated=structuredClone(a);
 unrelated.deployment.routeDeployments[0].components.gateway.receiptPath="outside/repo.json";
 assert.equal(isDeployedAsset(unrelated),false);
});
test("derived accepted and public visibility are reversible without touching GitHub",()=>{
 const a=asset(),catalog={assets:{ABC:a}};
 assert.equal(listingStatus(a,view("accepted").assets.ABC),"accepted");
 assert.deepEqual(Object.keys(publicDirectoryCatalog(catalog,view("accepted")).assets),[]);
 assert.equal(listingStatus(a,view("public").assets.ABC),"public");
 assert.deepEqual(Object.keys(publicDirectoryCatalog(catalog,view("public")).assets),["ABC"]);
 assert.deepEqual(Object.keys(publicDirectoryCatalog(catalog,view("accepted")).assets),[]);
 assert.deepEqual(Object.keys(publicDirectoryCatalog(catalog,view("public")).assets),["ABC"]);
 assert.equal(isPublicAsset("ABC",a,view("public","0x"+"f".repeat(64))),false);
});
test("missing or spoofed DB snapshots cannot publish",()=>{
 assert.equal(isPublicAsset("ABC",asset(),null),false);
 assert.equal(isPublicAsset("ABC",{},view("public")),false);
 assert.equal(isPublicAsset("ABC",asset(),{kind:"unknown",assets:{ABC:{status:"public"}}}),false);
});
