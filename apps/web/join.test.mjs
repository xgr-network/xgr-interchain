import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {draft,validateStep,validateApplication,joinMarkup,joinPendingMarkup,joinConfirmationMarkup,joinHomeChains,profileUpdateMarkup} from "./join.js";
const catalog=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
test("CoinGecko Join shows only ID, email, consent and conditional origin choice",()=>{
 const d={...draft(),coingeckoId:"arbitrum",contactEmail:"holder@example.org",confirmed:true};
 assert.deepEqual(joinHomeChains(catalog).sort(),["arbitrum","base","bsc","optimism"]);
 assert.deepEqual(validateApplication(d,catalog),[]);
 const html=joinMarkup(catalog,d);
 assert.match(html,/id="ja-application-form"/);
 for(const key of ["coingeckoId","contactEmail","confirmed"])
  assert.match(html,new RegExp('data-join="'+key+'"'));
 for(const unused of ["name","description","website","logoUrl","canonicalAddress","decimals","applicantRole"])
  assert.doesNotMatch(html,new RegExp('data-join="'+unused+'"'));
 assert.match(html,/Load from CoinGecko/);
 assert.match(html,/Submit free application/);
 assert.match(html,/href="\/profile-update"/);
 assert.doesNotMatch(html,/type="file"/);
});
test("no arbitrary original chain selection without verified multiple CoinGecko contracts",()=>{
 const d={...draft(),coingeckoId:"sample",contactEmail:"holder@example.org",confirmed:true};
 const choices=[{chain:"arbitrum",label:"Arbitrum",contract:"0x1234567890123456789012345678901234567890"},
  {chain:"base",label:"Base",contract:"0x2234567890123456789012345678901234567890"}];
 assert.deepEqual(validateStep(d,1,catalog,{choices}),["Original blockchain"]);
 assert.deepEqual(validateStep({...d,canonicalChain:"base"},1,catalog,{choices}),[]);
 const html=joinMarkup(catalog,d,"",false,{choices,profile:{name:"Test Protocol",symbol:"TST",shortDescription:"A verified short description."}});
 assert.match(html,/data-join="canonicalChain"/);
 assert.match(html,/Test Protocol/);
 assert.doesNotMatch(html,/data-join="canonicalAddress"/);
});
test("profile management allows only CoinGecko sync; no free text editor",()=>{
 const d={symbol:"ARB",contactEmail:"example@project.org",confirmed:true};
 const html=profileUpdateMarkup(catalog,d);
 assert.match(html,/CoinGecko ID/);
 assert.match(html,/arbitrum/);
 assert.doesNotMatch(html,/data-profile="coingeckoId"/);
 assert.match(html,/data-profile="symbol"/);
 assert.match(html,/data-profile="contactEmail"/);
 for(const field of ["name","description","logoUrl","website","canonicalAddress","decimals","initialSupply"])
  assert.doesNotMatch(html,new RegExp('data-profile="'+field+'"'));
 const copy=structuredClone(catalog);
 copy.assets.ARB.profile.market.coingeckoId=null;
 const noId=profileUpdateMarkup(copy,d);
 assert.match(noId,/data-profile="coingeckoId"/);
 assert.match(noId,/xita@xgr.network/);
 assert.match(noId,/Self-service updates only add a CoinGecko ID/);
});
test("email confirmation remains single-use and XGR-reviewed, with no direct route deployment",()=>{
 const pending=joinPendingMarkup({contactEmail:"holder@example.org"});
 assert.match(pending,/confirm your email/i);
 assert.doesNotMatch(pending,/data-join-action="submit"/);
 const successful=joinConfirmationMarkup({phase:"success",prNumber:250,prUrl:"https://github.com/xgr-network/xgr-interchain/pull/250"});
 assert.match(successful,/GitHub Draft PR #250/);
 const unsafe=joinConfirmationMarkup({phase:"failed",message:"<script>alert(1)</script>"});
 assert.doesNotMatch(unsafe,/<script>/);
});

test("Creator launch link is rendered only after explicit readiness",()=>{
 const data=draft();
 assert.equal(joinMarkup(catalog,data).includes('href="/createtoken"'),false);
 const html=joinMarkup(catalog,data,"",false,null,{creatorAvailable:true});
 assert.equal(html.includes('href="/createtoken"'),true);
 assert.match(html,/Create your own token/);
});
test("mobile navigation exposes an accessible collapsed menu control",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 assert.match(html,/id="site-menu-toggle"[^>]*aria-controls="site-main-nav"[^>]*aria-expanded="false"/);
 assert.match(html,/id="site-main-nav" aria-label="Main navigation"/);
});
