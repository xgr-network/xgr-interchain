import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildExperienceModel} from "./experience.js";
import {createUniverseTopology} from "./universe-3d.js";

const catalog=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
const modelFor=c=>buildExperienceModel(c);
const starFor=(c,name)=>modelFor(c).chains.find(x=>x.key===name)?.infrastructureDeployed;

test("receipt-complete ECDSA XDC Mainnet is a visible Universe star with its configured routes",()=>{
 assert.equal(catalog.chains.xdc.blsVerifierFormat,"ecdsa");
 assert.ok(catalog.infrastructure.xdc.xitaV315.components.ecdsaVerifier);
 assert.equal(starFor(catalog,"xdc"),true);
 const model=modelFor(catalog);
 assert.ok(model.routes.some(r=>(r.source==="xdc"||r.destination==="xdc")&&r.assetId==="XGR"));
 const topology=createUniverseTopology(model);
 assert.ok(topology.byKey.has("xdc"),"XDC must be represented as an orbiting star");
 assert.equal(topology.byKey.get("xdc").system.label,"XDC Mainnet");
});

test("ECDSA stars fail closed if their ECDSA verifier is missing or its receipt is absent",()=>{
 const c=structuredClone(catalog);
 delete c.infrastructure.xdc.xitaV315.components.ecdsaVerifier;
 assert.equal(starFor(c,"xdc"),false);
 assert.equal(createUniverseTopology(modelFor(c)).byKey.has("xdc"),false);
 const d=structuredClone(catalog);
 const ref=d.infrastructure.xdc.xitaV315.components.ecdsaVerifier.receiptPath;
 d.infrastructure.xdc.xitaV315.receiptPaths=d.infrastructure.xdc.xitaV315.receiptPaths.filter(p=>p!==ref);
 assert.equal(starFor(d,"xdc"),false);
});

test("ECDSA verifier cannot replace BLS EIP-2537 evidence; unsupported verification fails closed",()=>{
 assert.equal(starFor(catalog,"base"),true);
 const b=structuredClone(catalog);
 delete b.infrastructure.base.xitaV315.components.blsVerifier;
 b.infrastructure.base.xitaV315.components.ecdsaVerifier=b.infrastructure.xdc.xitaV315.components.ecdsaVerifier;
 assert.equal(starFor(b,"base"),false);
 const unknown=structuredClone(catalog);
 unknown.chains.xdc.blsVerifierFormat="unknown";
 assert.equal(starFor(unknown,"xdc"),false);
 assert.equal(starFor(catalog,"xgrchain"),true);
});
