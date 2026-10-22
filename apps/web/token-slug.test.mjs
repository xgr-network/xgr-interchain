import test from "node:test";
import assert from "node:assert/strict";
import {suggestedTokenSlug} from "./token-slug.js";
const asset=slug=>({profile:{slug}});
const origin={name:"Arbitrum",symbol:"ARB",canonicalChain:"arbitrum",
 canonicalAddress:"0x912ce59144191c1204e64559fe8253a0e49e6548"};
test("Token Holder does not choose a slug, ARB URL is generated from public identity",()=>{
 assert.equal(suggestedTokenSlug(origin,{XGR:asset("xgr")}),"arbitrum");
 assert.equal(suggestedTokenSlug(origin,{XGR:asset("xgr")}),"arbitrum");
 assert.equal(suggestedTokenSlug({...origin,name:"  Arbitrum  "}),"arbitrum");
});
test("Existing profile URLs remain reserved; fallback stays stable",()=>{
 assert.equal(suggestedTokenSlug(origin,{A:asset("arbitrum")}),"arbitrum-arb");
 const existing={A:asset("arbitrum"),B:asset("arbitrum-arb")};
 assert.equal(suggestedTokenSlug(origin,existing),"arbitrum-arb-arbitrum");
 existing.C=asset("arbitrum-arb-arbitrum");
 const fallback=suggestedTokenSlug(origin,existing);
 assert.match(fallback,/^arbitrum-arb-arbitrum-912ce591$/);
 assert.equal(suggestedTokenSlug(origin,existing),fallback);
});
test("URL-safe transliteration, long names, symbols and incomplete preview",()=>{
 assert.equal(suggestedTokenSlug({name:"Münchner Token",symbol:"MUC"}),"munchner-token");
 assert.equal(suggestedTokenSlug({name:"🐉🐉",symbol:"ARB"}),"arb");
 assert.equal(suggestedTokenSlug({name:"😄"}),null);
 assert.equal(suggestedTokenSlug({name:"A",symbol:"ARB"}),"arb");
 assert.equal(suggestedTokenSlug({name:"A".repeat(120),symbol:"AAA"}).length,61);
 assert.doesNotMatch(suggestedTokenSlug(origin),/[<>&@]/);
});
test("Slug cannot be supplied by an applicant",()=>{
 assert.equal(suggestedTokenSlug({...origin,slug:"user-chosen"}),"arbitrum");
});
