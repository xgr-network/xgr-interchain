import test from "node:test";
import assert from "node:assert/strict";
import {loadCatalog,validateCatalog} from "../../tools/validate-manifests.mjs";
import {buildCreatorJoinBundle} from "./creator-manifests.mjs";
const catalog=loadCatalog(),owner="0x1234567890123456789012345678901234567890",token="0x4564567890123456789012345678901234567890";
const record={kind:"token-creator",phase:"deployed",logoUrl:"https://xita.xgr.network/token-logos/"+"a".repeat(64)+".png",
 input:{name:"Creator Example",symbol:"CREA",initialSupply:"10000",ownerAddress:owner,
 shortDescription:"A project-created, independent XGR token.",
 description:"Example XGR token with owner-controlled token identity and verified XITA onboarding.",
 categories:["DeFi"],tags:[],website:"https://example.org",links:{},contactEmail:"private@example.org",applicantRole:"founder"}};
const proof={chainId:1643,tokenAddress:token,ownerAddress:owner,name:"Creator Example",symbol:"CREA",
 initialSupplyBaseUnits:"10000000000000000000000",factory:"0x1234567890123456789012345678901234567891",
 operator:"0x1234567890123456789012345678901234567892",txHash:"0x"+"a".repeat(64),blockNumber:12345678};
test("verified creator deployment creates ordinary XITA bidirectional hub Draft PR manifests",()=>{
 const output=buildCreatorJoinBundle(record,proof,catalog);
 assert.equal(output.kind,"origin-xgrchain");
 const asset=JSON.parse(Object.entries(output.files).find(([p])=>p.endsWith("/asset.json"))[1]);
 const routes=JSON.parse(Object.entries(output.files).find(([p])=>p.endsWith("/routes.json"))[1]);
 const profile=JSON.parse(Object.entries(output.files).find(([p])=>p.endsWith("/metadata.json"))[1]);
 assert.equal(asset.canonical.chain,"xgrchain");
 assert.equal(asset.canonical.tokenAddress,token);
 assert.equal(asset.creation.ownerAddress,owner);
 assert.equal(asset.creation.transactionHash,proof.txHash);
 assert.equal(profile.market.priceSource,"none");
 assert.equal(profile.market.coingeckoId,null);
 assert.equal(routes.routes.length,8);
 assert.ok(routes.routes.every(r=>r.sourceChain==="xgrchain"||r.destinationChain==="xgrchain"));
 assert.deepEqual(validateCatalog(JSON.parse(output.files["apps/web/catalog.json"])),[]);
 assert.ok(!JSON.stringify(output.files).includes(record.input.contactEmail));
});
test("cannot create PR from unverified, forged, or still queued creator receipt",()=>{
 assert.throws(()=>buildCreatorJoinBundle({...record,phase:"deployment-queued"},proof,catalog),/Verified/);
 assert.throws(()=>buildCreatorJoinBundle(record,{...proof,ownerAddress:"0x"+"b".repeat(40)},catalog),/proof/);
 assert.throws(()=>buildCreatorJoinBundle(record,{...proof,tokenAddress:"0x"+"0".repeat(40)},catalog),/proof/);
 assert.throws(()=>buildCreatorJoinBundle(record,{...proof,initialSupplyBaseUnits:"1"},catalog),/proof/);
 assert.throws(()=>buildCreatorJoinBundle(record,proof,{...catalog,assets:{...catalog.assets,CREA:catalog.assets.XGR}}),/Duplicate/);
});
