import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {draft,validateStep,validateApplication,joinMarkup,joinPendingMarkup,joinConfirmationMarkup,joinHomeChains} from "./join.js";
const catalog=JSON.parse(readFileSync(new URL("./catalog.json",import.meta.url),"utf8"));
const chains=catalog.chains;
const valid=()=>({
 ...draft(chains),
 name:"Example Protocol",symbol:"EXMP",
 website:"https://example.org",shortDescription:"A sample test token for cross-chain routing.",
 description:"An independent token community applying for listing on all XITA routes.",
 logoUrl:"https://example.org/logo.png",
 canonicalChain:"arbitrum",canonicalAddress:"0x912ce59144191c1204e64559fe8253a0e49e6548",
 coingeckoId:"arbitrum",contactEmail:"holder@example.org",applicantRole:"holder",confirmed:true
});
test("join home-chain options follow deployed receipt-backed inventory, not planned chains",()=>{
 assert.deepEqual(joinHomeChains(catalog).sort(),["arbitrum","base","bsc","optimism"]);
 const html=joinMarkup(catalog,valid());
 for(const key of ["arbitrum","base","bsc","optimism"])assert.match(html,new RegExp('<option value="'+key+'"'));
 assert.match(html,/>BNB Smart Chain<\/option>/);
 assert.doesNotMatch(html,/<option value="polygon"/);
 assert.doesNotMatch(html,/<option value="xgrchain"/);
 assert.deepEqual(validateStep({...valid(),canonicalChain:"bsc"},1,catalog),[]);
 assert.deepEqual(validateStep({...valid(),canonicalChain:"polygon"},1,catalog),["Canonical chain"]);
 const plan=structuredClone(catalog);
 plan.infrastructure.bsc.present=false;
 assert.deepEqual(joinHomeChains(plan).sort(),["arbitrum","base","optimism"]);
 assert.deepEqual(validateStep({...valid(),canonicalChain:"bsc"},1,plan),["Canonical chain"]);
});
test("Join has one form and retains every validation and privacy requirement",()=>{
 const d=valid(),html=joinMarkup(catalog,d);
 assert.deepEqual(validateApplication(d,catalog),[]);
 assert.match(html,/id="ja-application-form" novalidate/);
 assert.match(html,/data-join-action="submit"/);
 assert.match(html,/Submit free application/);
 assert.match(html,/data-join="contactEmail"/);
 assert.match(html,/data-join="applicantRole"/);
 assert.match(html,/data-join="confirmed"/);
 assert.match(html,/data-join="canonicalChain"/);
 assert.match(html,/data-join="logoUrl"/);
 assert.match(html,/data-join="description"/);
 assert.match(html,/No wallet connection or payment is needed/);
 assert.match(html,/XITA handles the complete technical integration/);
 assert.match(html,/XGR funds deployment/);
 assert.match(html,/Free integration &amp; deployment if approved/);
 assert.doesNotMatch(html,/ja-preview|data-join-preview|Suggested token profile/);
 assert.doesNotMatch(html,/data-join-action="next"|data-join-action="back"|Step 3 \/ 3|data-join-target/);
 assert.doesNotMatch(html,/data-join="slug"|Token URL/);
 assert.doesNotMatch(html,/Suggested token profile/);
});
test("CoinGecko help is an accessible dialog with an API ID example and matching fields",()=>{
 const html=joinMarkup(catalog,valid());
 assert.match(html,/id="ja-coingecko-help" aria-haspopup="dialog"/);
 assert.match(html,/aria-controls="ja-coingecko-dialog"/);
 assert.match(html,/id="ja-coingecko-dialog" class="ux-fee-dialog/);
 assert.match(html,/API ID/);
 assert.match(html,/CoinGecko/);
 assert.match(html,/contract address/);
 assert.match(html,/detail/mi);
 assert.match(html,/data-join-help-close/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);
});
test("Single page validates all three underlying security groups before submitting",()=>{
 const d=valid();
 assert.deepEqual(validateApplication({...d,name:"",coingeckoId:"",contactEmail:""},catalog),
  ["Project name","CoinGecko coin ID","Contact email"]);
 assert.deepEqual(validateApplication({...d,confirmed:false},catalog),["Project confirmation"]);
 assert.deepEqual(validateApplication({...d,logoUrl:"",logoPngBase64:"x"},catalog),["HTTPS logo URL"]);
 assert.deepEqual(validateStep(d,0,catalog),[]);
 assert.deepEqual(validateStep(d,1,catalog),[]);
 assert.deepEqual(validateStep(d,2,catalog),[]);
});
test("Single-page join never requires chain target selection or a manually chosen URL",()=>{
 const html=joinMarkup(catalog,valid());
 assert.doesNotMatch(html,/data-join-target|New worlds|Token URL/);
 assert.match(html,/XITA handles the complete technical integration/);
 assert.match(html,/Privacy Policy/);
 assert.match(html,/Email/);
});
test("submission displays a standalone email-confirmation page without another submit button",()=>{
 const h=joinPendingMarkup(valid());
 assert.match(h,/Thank you for submitting your project!/);
 assert.match(h,/One more step: confirm your email/);
 assert.match(h,/holder@example\.org/);
 assert.match(h,/24 hours/);
 assert.doesNotMatch(h,/data-join-action="submit"|Verify & submit application/);
});
test("confirmation states always retain error or PR result on re-render",()=>{
 const working=joinConfirmationMarkup({phase:"verifying"});
 assert.match(working,/Checking your private confirmation/);
 const failed=joinConfirmationMarkup({phase:"failed",message:"GitHub rejected request (403)"});
 assert.match(failed,/GitHub rejected request \(403\)/);
 assert.doesNotMatch(failed,/id="ja-confirm-pr"/);
 const success=joinConfirmationMarkup({phase:"success",prNumber:250,prUrl:"https://github.com/xgr-network/xgr-interchain/pull/250"});
 assert.match(success,/GitHub Draft PR #250/);
 assert.match(success,/Your email has been verified!/);
 assert.doesNotMatch(success,/Checking your private confirmation/);
 const hostile=joinConfirmationMarkup({phase:"failed",message:"<script>alert(1)</script>"});
 assert.doesNotMatch(hostile,/<script>/);
});

test("confirmation page distinguishes email verification from receipt",()=>{
 const page=joinConfirmationMarkup({phase:"success",prNumber:301,prUrl:"https://github.com/xgr-network/xgr-interchain/pull/301"});
 assert.match(page,/Your email has been verified!/);
 assert.doesNotMatch(page,/Thank you for submitting your project!/);
 const fresh=joinPendingMarkup(null);
 assert.doesNotMatch(fresh,/APPLICATION RECEIVED|We have sent an email/);
});

test("Join accepts only HTTPS logo URLs, not uploaded images",()=>{
 const d=valid();
 assert.deepEqual(validateApplication({...d,logoUrl:"",logoPngBase64:"abc"},catalog),["HTTPS logo URL"]);
 const html=joinMarkup(catalog,d);
 assert.match(html,/data-join="logoUrl"/);
 assert.doesNotMatch(html,/type="file"|upload a PNG/i);
});

test("Join navigation is separate from submitted receipt and can start a second application",()=>{
 const app=readFileSync(new URL("./app.js",import.meta.url),"utf8");
 const joinFn=app.split("function join(){")[1]?.split("\n}")[0];
 assert.ok(joinFn,"Join renderer exists");
 assert.match(joinFn,/return joinMarkup\(state\.catalog,joinState\.data,joinState\.status,joinState\.busy\)/);
 assert.doesNotMatch(joinFn,/joinPendingMarkup|joinState\.accepted/);
 assert.match(app,/p==="\/join"\?join\(\):p==="\/join\/submitted"\?joinPendingMarkup\(joinState\.accepted\?joinState\.data:null\)/);
 assert.match(app,/if\(a\.pathname==="\/join"&&path\(\)!=="\/join"\)\{/);
 assert.match(app,/joinState\.data=draft\(state\.catalog\.chains\);[\s\S]*?joinState\.accepted=false;/);
 assert.match(app,/window\.addEventListener\("popstate",\(\)=>\{/);
});

test("Join layout keeps every input and form action after preview is removed",()=>{
 const html=joinMarkup(catalog,valid());
 for(const key of ["name","symbol","website","logoUrl","shortDescription","description","canonicalChain","canonicalAddress","decimals","coingeckoId","contactEmail","applicantRole","confirmed"])
  assert.match(html,new RegExp('data-join="'+key+'"'));
 assert.equal((html.match(/id="ja-application-form"/g)||[]).length,1);
 assert.equal((html.match(/data-join-action="submit"/g)||[]).length,1);
 assert.match(html,/id="ja-coingecko-dialog"/);
 assert.match(html,/class="ja-layout"/);
 assert.doesNotMatch(html,/class="ux-panel ja-preview"/);
});
