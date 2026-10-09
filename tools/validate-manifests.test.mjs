import test from "node:test";
import assert from "node:assert/strict";
import {loadCatalog,validateCatalog} from "./validate-manifests.mjs";
const copy=()=>structuredClone(loadCatalog());
test("XETA four-chain XGR/wXGR plan validates",()=>assert.deepEqual(validateCatalog(copy()),[]));
test("six directed hub routes exist",()=>{const x=copy();assert.equal(x.assets.XGR.routes.routes.length,6)});
test("rejects missing reverse route",()=>{const x=copy();x.assets.XGR.routes.routes.pop();assert.ok(validateCatalog(x).some(s=>s.includes("missing reverse route")))});
test("rejects external-to-external direct routes",()=>{const x=copy(),r=x.assets.XGR.routes.routes[0];r.sourceChain="base";r.destinationChain="polygon";assert.ok(validateCatalog(x).some(s=>s.includes("direct external-to-external")))});
test("rejects phantom chain",()=>{const x=copy();x.assets.XGR.routes.routes[0].destinationChain="unknown";assert.ok(validateCatalog(x).some(s=>s.includes("invalid route endpoints")))});
test("rejects fabricated pending gateway",()=>{const x=copy();x.assets.XGR.deployment.ilnV314.routes[0].gateway="0x"+"1".repeat(40);assert.ok(validateCatalog(x).some(s=>s.includes("fictitious deployment")))});
test("rejects premature route ID without fee",()=>{const x=copy();x.assets.XGR.routes.routes[0].routeId="0x"+"a".repeat(64);assert.ok(validateCatalog(x).some(s=>s.includes("unapproved route")))});
test("rejects fabricated planned chain security",()=>{const x=copy();x.infrastructure.polygon.ilnV314.sourceRegistry="0x"+"2".repeat(40);assert.ok(validateCatalog(x).some(s=>s.includes("pending infrastructure")))});
test("rejects duplicate domains",()=>{const x=copy();x.chains.base.domainId=1643;assert.ok(validateCatalog(x).some(s=>s.includes("duplicate chainId or domainId")))});
test("no hardcoded legacy router address",()=>{const x=copy();assert.equal(x.assets.XGR.deployment.ilnV314.routes.filter(r=>r.warpRouter!==null).length,0)});

test("rejects missing token profile logo",()=>{const c=copy();c.assets.XGR.profile.branding.logoUrl=null;assert.ok(validateCatalog(c).some(e=>e.includes("profile branding")))});
test("rejects unsafe public profile URL",()=>{const c=copy();c.assets.XGR.profile.links.website="javascript:alert(1)";assert.ok(validateCatalog(c).some(e=>e.includes("profile links")))});
test("rejects mismatched token profile",()=>{const c=copy();c.assets.XGR.profile.asset="OTHER";assert.ok(validateCatalog(c).some(e=>e.includes("public token profile")))});
