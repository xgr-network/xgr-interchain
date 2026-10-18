import test from "node:test";
import assert from "node:assert/strict";
import {isDeployedAsset,isPublicAsset,publicDirectoryCatalog,listingStatus} from "./listing-visibility.js";
import {deployedFixture} from "./deployed-test-fixture.mjs";
const asset=()=>deployedFixture("ABC");
const view=(status,assetId=asset().metadata.assetId,minimum=1,lockedUsd=status==="public"?2:0)=>({schemaVersion:1,kind:"xita-visibility-v1",minimumLockedUsd:minimum,assets:{ABC:{status,assetId,lockedUsd}}});
const catalog=minimum=>({assets:{ABC:asset()},publication:{schemaVersion:1,kind:"xita-publication-policy",minimumLockedUsd:minimum,maxEvidenceAgeSeconds:900}});
test("prospect lacks documentation and cannot be published",()=>{
 const c=catalog(null);c.assets.ABC.deployment.present=false;
 assert.equal(isDeployedAsset(c.assets.ABC),false);
 assert.equal(isPublicAsset("ABC",c.assets.ABC,view("public"),c),false);
});
test("any complete route suffices and incomplete future chains do not block",()=>{
 const c=catalog(null);
 assert.equal(isDeployedAsset(c.assets.ABC),true);
 c.assets.ABC.metadata.representations.push({chain:"polygon",representation:"synthetic",symbol:"wABC"});
 c.assets.ABC.routes.routes.push({name:"xgr_to_polygon",sourceChain:"xgrchain",destinationChain:"polygon"});
 assert.equal(isDeployedAsset(c.assets.ABC,c),true);
 c.assets.ABC.deployment.routeDeployments=[];
 assert.equal(isDeployedAsset(c.assets.ABC,c),false);
});
test("null lists deployed without metrics and positive threshold requires matching proof",()=>{
 const c=catalog(null),e=c.assets.ABC;
 assert.equal(listingStatus(e,null,c),"public");
 assert.deepEqual(Object.keys(publicDirectoryCatalog(c,null).assets),["ABC"]);
 c.publication.minimumLockedUsd=0;
 assert.equal(isPublicAsset("ABC",e,null,c),false);
 assert.equal(isPublicAsset("ABC",e,view("public",e.metadata.assetId,0,0),c),false);
 assert.equal(isPublicAsset("ABC",e,view("public",e.metadata.assetId,0,.01),c),true);
 c.publication.minimumLockedUsd=1;
 assert.equal(isPublicAsset("ABC",e,view("public",e.metadata.assetId,1,1),c),false);
 assert.equal(isPublicAsset("ABC",e,view("public",e.metadata.assetId,1,2),c),true);
 assert.equal(isPublicAsset("ABC",e,view("public",e.metadata.assetId,0,2),c),false);
 assert.equal(isPublicAsset("ABC",e,view("public","0x"+"f".repeat(64),1,2),c),false);
});
test("untrusted publication status does not override config policy",()=>{
 const c=catalog(null);
 c.publication.minimumLockedUsd=-1;
 assert.deepEqual(Object.keys(publicDirectoryCatalog(c,view("public")).assets),[]);
});
test("legacy no-policy catalogs still require explicit matching public snapshot",()=>{
 const c={assets:{ABC:asset()}};
 assert.deepEqual(Object.keys(publicDirectoryCatalog(c,null).assets),[]);
 assert.deepEqual(Object.keys(publicDirectoryCatalog(c,view("public")).assets),["ABC"]);
});