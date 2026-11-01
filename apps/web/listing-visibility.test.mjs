import test from "node:test";
import assert from "node:assert/strict";
import {isDeployedAsset,isPublicAsset,publicDirectoryCatalog,listingStatus} from "./listing-visibility.js";
import {deployedFixture} from "./deployed-test-fixture.mjs";

const creatorOrigin=()=>{
 const e=deployedFixture("XTK","xgrchain");
 e.metadata.canonical={chain:"xgrchain",tokenAddress:"0x1234567890123456789012345678901234567890"};
 e.metadata.creation={kind:"xgrchain-creator-v1",
  ownerAddress:"0x1234567890123456789012345678901234567890",factory:"0x2234567890123456789012345678901234567890",
  transactionHash:"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",tokenRuntimeCodeHash:"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",blockNumber:123};
 e.profile={name:"XGR Created Token",slug:"xgr-created-token",market:{priceSource:"none",coingeckoId:null}};
 e.deployment.present=false;
 return e;
};
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
test("reviewed XGR creator enters public token directory even before ILN route deployment",()=>{
 const e=creatorOrigin();
 const c={assets:{XTK:e},publication:{schemaVersion:1,kind:"xita-publication-policy",minimumLockedUsd:null,maxEvidenceAgeSeconds:900}};
 assert.equal(isDeployedAsset(e,c),false);
 assert.equal(isPublicAsset("XTK",e,null,c),true);
 assert.equal(listingStatus(e,null,c),"public");
 assert.deepEqual(Object.keys(publicDirectoryCatalog(c,null).assets),["XTK"]);
 assert.ok(publicDirectoryCatalog(c,null).assets.XTK.metadata.representations.some(x=>x.chain==="xgrchain"));
 const bad=structuredClone(e);
 delete bad.metadata.creation.transactionHash;
 assert.equal(isPublicAsset("XTK",bad,null,c),false);
});
