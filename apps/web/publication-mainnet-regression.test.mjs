import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isDeployedAsset,isPublicAsset,isPublicRepresentation,publicDirectoryCatalog,listingStatus} from "./listing-visibility.js";
import {deployedRoutes,executableTransferRoutes} from "./route-availability.js";
import {buildExperienceModel} from "./experience.js";
import {buildLeaderboardRows} from "./leaderboard-data.js";
import {systemRanking} from "./system-rankings.js";

const catalog=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
test("mainnet XGR: null publication gives token, listing, and Base/XGR planets with NO fee adapter",()=>{
 const c=structuredClone(catalog),a=c.assets.XGR;
 assert.equal(c.publication.minimumLockedUsd,null);
 assert.equal(isDeployedAsset(a,c),true);
 assert.equal(isPublicAsset("XGR",a,null,c),true);
 assert.equal(listingStatus(a,null,c),"public");
 assert.equal(deployedRoutes(c).length,2);
 assert.equal(executableTransferRoutes(c).length,0,"optional execution gateways block NEW commercial transfers");
 const publicC=publicDirectoryCatalog(c,null);
 assert.deepEqual(Object.keys(publicC.assets),["XGR"]);
 assert.deepEqual(publicC.assets.XGR.metadata.representations.map(r=>r.chain).sort(),["base","xgrchain"]);
 const m=buildExperienceModel(publicC);
 assert.deepEqual(m.chains.find(x=>x.key==="base").tokens.map(x=>x.id),["XGR"]);
 assert.deepEqual(m.chains.find(x=>x.key==="xgrchain").tokens.map(x=>x.id),["XGR"]);
 assert.equal(m.chains.find(x=>x.key==="polygon").tokens.length,0);
 assert.equal(m.chains.find(x=>x.key==="arbitrum").tokens.length,0);
 assert.equal(m.transferRoutes.length,0);
 assert.deepEqual(buildLeaderboardRows(publicC,null).map(x=>x.id),["XGR"]);
 for(const chain of ["xgrchain","base"]){
  assert.equal(isPublicRepresentation("XGR",chain,c),true);
  assert.deepEqual(systemRanking(c,null,chain).items.map(x=>x.assetId),["XGR"]);
 }
 assert.equal(isPublicRepresentation("XGR","polygon",c),false);
 assert.deepEqual(systemRanking(c,null,"polygon").items,[]);
});
test("mainnet XGR: numeric threshold governs ALL public surfaces, independent of route readiness",()=>{
 const c=structuredClone(catalog);c.publication.minimumLockedUsd=0;
 assert.equal(isDeployedAsset(c.assets.XGR,c),true);
 assert.equal(isPublicAsset("XGR",c.assets.XGR,null,c),false);
 assert.deepEqual(Object.keys(publicDirectoryCatalog(c,null).assets),[]);
 assert.equal(isPublicRepresentation("XGR","base",c,null),false);
 assert.deepEqual(systemRanking(c,null,"base").items,[]);
 const visible={schemaVersion:1,kind:"xita-visibility-v1",minimumLockedUsd:0,
  assets:{XGR:{assetId:c.assets.XGR.metadata.assetId,status:"public",lockedUsd:1}}};
 assert.equal(isPublicAsset("XGR",c.assets.XGR,visible,c),true);
 assert.deepEqual(Object.keys(publicDirectoryCatalog(c,visible).assets),["XGR"]);
 assert.deepEqual(systemRanking(c,null,"base",{visibility:visible}).items.map(x=>x.assetId),["XGR"]);
});
