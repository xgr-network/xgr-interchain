import test from "node:test";
import assert from "node:assert/strict";
import {loadCatalog,validateCatalog} from "../../tools/validate-manifests.mjs";
import {buildCreatorProfileBundle} from "./creator-manifests.mjs";
const catalog=loadCatalog(),owner="0x1234567890123456789012345678901234567890",token="0x4564567890123456789012345678901234567890";
const record={kind:"token-creator",phase:"deployed",logoUrl:"https://xita.xgr.network/token-logos/"+"a".repeat(64)+".png",
 input:{name:"Creator Example",symbol:"CREA",initialSupply:"10000",ownerAddress:owner,tokenType:"fixed",decimals:18,maxSupply:"10000",permit:false,minterAddress:"0x0000000000000000000000000000000000000000",
 shortDescription:"A project-created, independent XGR token.",
 description:"Example XGR token with owner-controlled token identity and verified XITA onboarding.",
 categories:["DeFi"],tags:[],website:"https://example.org",links:{},contactEmail:"private@example.org",applicantRole:"founder"}};
const proof={chainId:1643,tokenAddress:token,ownerAddress:owner,name:"Creator Example",symbol:"CREA",
 initialSupplyBaseUnits:"10000000000000000000000",maxSupplyBaseUnits:"10000000000000000000000",tokenType:0,decimals:18,permit:false,minterAddress:"0x0000000000000000000000000000000000000000",factory:"0x1234567890123456789012345678901234567891",
 operator:"0x1234567890123456789012345678901234567892",txHash:"0x"+"a".repeat(64),tokenCodeHash:"0x"+"d".repeat(64),blockNumber:12345678};
test("verified creator deployment creates a standalone XGR token profile with NO Interchain routes",()=>{
 const output=buildCreatorJoinBundle(record,proof,catalog);
 assert.equal(output.kind,"xgrchain-profile");
 const asset=JSON.parse(Object.entries(output.files).find(([p])=>p.endsWith("/asset.json"))[1]);
 const routes=JSON.parse(Object.entries(output.files).find(([p])=>p.endsWith("/routes.json"))[1]);
 const profile=JSON.parse(Object.entries(output.files).find(([p])=>p.endsWith("/metadata.json"))[1]);
 assert.equal(asset.canonical.chain,"xgrchain");
 assert.equal(asset.canonical.tokenAddress,token);
 assert.equal(asset.creation.ownerAddress,owner);
 assert.equal(asset.creation.transactionHash,proof.txHash);
 assert.equal(profile.market.priceSource,"none");
 assert.equal(profile.market.coingeckoId,null);
 assert.equal(routes.routes.length,0);
 assert.deepEqual(asset.representations.map(r=>r.chain),["xgrchain"]);
 assert.equal(output.summary.routeCount,0);
 assert.deepEqual(output.summary.chains,["xgrchain"]);
 assert.deepEqual(validateCatalog(JSON.parse(output.files["apps/web/catalog.json"])),[]);
 assert.equal(JSON.parse(output.files["apps/web/catalog.json"]).assets.CREA.routes.routes.length,0);
 assert.ok(!JSON.stringify(output.files).includes(record.input.contactEmail));
});
test("cannot create PR from unverified, forged, or still queued creator receipt",()=>{
 assert.throws(()=>buildCreatorJoinBundle({...record,phase:"deployment-queued"},proof,catalog),/Verified/);
 assert.throws(()=>buildCreatorJoinBundle(record,{...proof,ownerAddress:"0x"+"b".repeat(40)},catalog),/proof/);
 assert.throws(()=>buildCreatorJoinBundle(record,{...proof,tokenAddress:"0x"+"0".repeat(40)},catalog),/proof/);
 assert.throws(()=>buildCreatorJoinBundle(record,{...proof,initialSupplyBaseUnits:"1"},catalog),/proof/);
 assert.throws(()=>buildCreatorJoinBundle(record,proof,{...catalog,assets:{...catalog.assets,CREA:catalog.assets.XGR}}),/Duplicate/);
});

test("mintable creator PR publishes exact on-chain cap, minter, decimals and permit",()=>{
 const minter="0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
 const custom={...record,input:{...record.input,tokenType:"mintable",decimals:6,
  initialSupply:"10000",maxSupply:"25000",minterAddress:minter,permit:true}};
 const checked={...proof,initialSupplyBaseUnits:"10000000000",maxSupplyBaseUnits:"25000000000",
  tokenType:2,decimals:6,minterAddress:minter,permit:true};
 const output=buildCreatorJoinBundle(custom,checked,catalog);
 const asset=JSON.parse(Object.entries(output.files).find(([p])=>p.endsWith("/asset.json"))[1]);
 const profile=JSON.parse(Object.entries(output.files).find(([p])=>p.endsWith("/metadata.json"))[1]);
 assert.equal(asset.decimals,6);
 assert.equal(asset.creation.tokenType,"mintable");
 assert.equal(asset.creation.minterAddress,minter);
 assert.equal(asset.creation.permit,true);
 assert.equal(asset.creation.tokenRuntimeCodeHash,checked.tokenCodeHash);
 assert.equal(profile.supply.total,checked.initialSupplyBaseUnits);
 assert.equal(profile.supply.max,checked.maxSupplyBaseUnits);
 assert.deepEqual(validateCatalog(JSON.parse(output.files["apps/web/catalog.json"])),[]);
 assert.throws(()=>buildCreatorJoinBundle(custom,{...checked,maxSupplyBaseUnits:"25000000001"},catalog),/proof/);
});

test("email-verified multiline descriptions survive receipt-backed Join PR creation without reducing validation",()=>{
 const original={...record,input:{...record.input,
  shortDescription:"An XGRChain-native test token.\nCreated using the XITA Creator.",
  description:"XITA Canary demonstrates real ERC-20 creation.\n\nThis second paragraph explains the approved supply, owner and future Interchain expansion."}};
 const bundle=buildCreatorJoinBundle(original,proof,catalog);
 const profile=JSON.parse(Object.entries(bundle.files).find(([path])=>path.endsWith("/metadata.json"))[1]);
 assert.equal(profile.shortDescription,original.input.shortDescription);
 assert.equal(profile.description,original.input.description);
 assert.equal(JSON.parse(Object.entries(bundle.files).find(([path])=>path.endsWith("/asset.json"))[1]).canonical.tokenAddress,token);
 assert.deepEqual(validateCatalog(JSON.parse(bundle.files["apps/web/catalog.json"])),[]);
 for(const bad of ["Markup <script>alert(1)</script>\nAnother line of otherwise legitimate text.",
   "A string with control character \u0007 is unsafe.",
   "Invalid tab\tinside prose."]){
  assert.throws(()=>buildCreatorJoinBundle({...original,input:{...original.input,description:bad}},proof,catalog),/Invalid public profile fields/);
 }
});

test("unverified chain-native tokens and synthetic routes cannot qualify as no-route creator profiles",()=>{
 const output=buildCreatorProfileBundle(record,proof,catalog);
 const published=JSON.parse(output.files["apps/web/catalog.json"]);
 assert.deepEqual(validateCatalog(published),[]);
 const unverified=structuredClone(published);
 delete unverified.assets.CREA.metadata.creation;
 assert.match(validateCatalog(unverified).join(" "),/missing representations/);
 const withRoute=structuredClone(published);
 withRoute.assets.CREA.routes.routes.push({name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"});
 assert.match(validateCatalog(withRoute).join(" "),/missing representations|invalid route endpoints/);
});
