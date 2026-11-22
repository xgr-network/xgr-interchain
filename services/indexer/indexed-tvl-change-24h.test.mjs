import test from "node:test";
import assert from "node:assert/strict";
import {indexedTvlChange24h} from "./indexed-tvl-change-24h.mjs";

const base={status:"verified",unknown24h:0,decimals:18,priceUsd:2,
 openingRaw:100n*10n**18n,events:[
  {at:100,raw:20n*10n**18n},{at:200,raw:-10n*10n**18n}
 ]};
test("24h indexed change is independent of 7d or 30d TVL chart",()=>{
 const result=indexedTvlChange24h([base],[{status:"verified",lockedUsd:220}],
  {required:1,now:1000});
 assert.equal(result.status,"verified");
 assert.equal(result.openingUsd,200);
 assert.equal(result.currentUsd,220);
 assert.equal(result.percent,10);
});
test("all deployed assets use one consistent current-price reference",()=>{
 const alt={status:"verified",unknown24h:0,decimals:6,priceUsd:3,
  openingRaw:50n*10n**6n,events:[{at:300,raw:-10n*10n**6n}]};
 const result=indexedTvlChange24h([base,alt],
  [{status:"verified",lockedUsd:220},{status:"verified",lockedUsd:120}],
  {required:2,now:1000});
 assert.equal(result.status,"verified");
 assert.equal(result.openingUsd,350);
 assert.equal(result.currentUsd,340);
 assert.ok(Math.abs(result.percent-(-10/350*100))<1e-10);
});
test("missing recent source timestamps or a mismatched index cannot fabricate a percentage",()=>{
 assert.equal(indexedTvlChange24h([{...base,unknown24h:1}],
  [{status:"verified",lockedUsd:220}],{required:1}).status,"unavailable");
 assert.equal(indexedTvlChange24h([base],[{status:"verified",lockedUsd:221}],
  {required:1}).reason,"indexed-position-history-mismatch");
 assert.equal(indexedTvlChange24h([base],[{status:"verified",lockedUsd:220}],
  {required:2}).reason,"asset-coverage-incomplete");
 assert.equal(indexedTvlChange24h([{...base,openingRaw:0n,events:[]}],
  [{status:"verified",lockedUsd:0}],{required:1}).reason,
  "24h-opening-collateral-zero");
});
