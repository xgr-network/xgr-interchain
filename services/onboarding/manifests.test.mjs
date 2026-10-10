import test from "node:test";
import assert from "node:assert/strict";
import {loadCatalog,validateCatalog} from "../../tools/validate-manifests.mjs";
import {buildManifestBundle} from "./manifests.mjs";
const catalog=loadCatalog();
const application={
 name:"Example Protocol",symbol:"EXMP",slug:"example-protocol",
 website:"https://example.org",shortDescription:"A sample test token for cross-chain routing.",
 description:"A sample project with valid fields for testing the XITA onboarding manifest generation process.",
 canonicalChain:"base",canonicalAddress:"0x1234567890123456789012345678901234567890",
 decimals:18,targets:["xgrchain","polygon"],categories:["DeFi"],tags:["Cross-chain"],
 logoUrl:"https://example.org/logo.png",confirmed:true
};
test("route bundle matches authoritative main schemas and transits XGR",()=>{
 const b=buildManifestBundle(application,catalog);
 assert.equal(Object.keys(b.files).length,6);
 const asset=JSON.parse(b.files["config/assets/EXMP/asset.json"]);
 const routes=JSON.parse(b.files["config/assets/EXMP/routes.json"]);
 assert.equal(asset.canonical.tokenAddress,application.canonicalAddress);
 assert.match(asset.assetId,/^0x[0-9a-f]{64}$/);
 assert.equal(routes.routes.length,4);
 assert.ok(routes.routes.every(x=>[x.sourceChain,x.destinationChain].includes("xgrchain")));
 assert.equal(routes.routes.filter(x=>x.sourceChain==="xgrchain").length,2);
 const deployment=JSON.parse(b.files["deployments/mainnet/assets/EXMP.json"]);
 assert.deepEqual(deployment.receiptPaths,[]);
 const newCat=JSON.parse(b.files["apps/web/catalog.json"]);
 assert.deepEqual(validateCatalog(newCat),[]);
});
test("reject direct bridge and duplicate canonical token",()=>{
 assert.throws(()=>buildManifestBundle({...application,targets:["polygon","polygon"]},catalog),/distinct/);
 assert.throws(()=>buildManifestBundle({...application,canonicalChain:"unknown"},catalog),/Unknown canonical/);
 assert.throws(()=>buildManifestBundle({...application,canonicalAddress:"0x0000000000000000000000000000000000000000"},catalog),/Original ERC-20/);
 assert.throws(()=>buildManifestBundle({...application,confirmed:false},catalog),/confirmation/);
});
test("reject unsafe public metadata",()=>{
 assert.throws(()=>buildManifestBundle({...application,name:"<script>alert(1)</script>"},catalog),/Invalid project/);
 assert.throws(()=>buildManifestBundle({...application,website:"http://localhost:3000"},catalog),/HTTPS/);
 assert.throws(()=>buildManifestBundle({...application,logoPngBase64:"R0lGODlh",logoUrl:""},catalog),/Logo/);
});
test("never leak private contact information into generated public files",()=>{
 const b=buildManifestBundle({...application,contact:"private@example.org"},catalog);
 assert.equal(JSON.stringify(b.files).includes("private@example.org"),false);
});
