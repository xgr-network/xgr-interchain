import test from "node:test";
import assert from "node:assert/strict";
import {draft,validateStep,joinMarkup,joinPendingMarkup,joinConfirmationMarkup} from "./join.js";

const chains={
 xgrchain:{name:"XGRChain",nativeCurrency:{symbol:"XGR"}},
 base:{name:"Base",nativeCurrency:{symbol:"ETH"}},
 polygon:{name:"Polygon",nativeCurrency:{symbol:"POL"}},
 arbitrum:{name:"Arbitrum",nativeCurrency:{symbol:"ETH"}}
};
const valid=()=>({
 ...draft(chains),
 name:"Example Protocol",symbol:"EXMP",
 website:"https://example.org",shortDescription:"A sample test token for cross-chain routing.",
 description:"An independent token community applying for listing on all XITA routes.",
 logoUrl:"https://example.org/logo.png",
 canonicalChain:"arbitrum",canonicalAddress:"0x912ce59144191c1204e64559fe8253a0e49e6548",
 coingeckoId:"arbitrum",contactEmail:"holder@example.org",applicantRole:"holder",confirmed:true
});
test("Join has exactly three steps with no destination-chain checkbox",()=>{
 const d=valid();
 assert.equal(Object.hasOwn(d,"targets"),false);
 for(const step of [0,1,2]){
  assert.deepEqual(validateStep(d,step,chains),[]);
  const html=joinMarkup(chains,d,step);
  assert.match(html,new RegExp("Step "+(step+1)+" / 3"));
  assert.doesNotMatch(html,/data-join-target|New worlds|Step 4 \/ 4/);
  assert.doesNotMatch(html,/data-join="slug"|Token URL/);
  assert.match(html,/\/token\/example-protocol/);
  assert.match(html,/Planned routes/);
  assert.match(html,/>6<\/strong>/);
  if(step===2){
   assert.match(html,/data-join-action="submit"/);
   assert.match(html,/Proposed networks: XGRChain · Base · Polygon · Arbitrum/);
   assert.match(html,/XGR reviews the application/);
  }else{
   assert.match(html,/data-join-action="next"/);
   assert.doesNotMatch(html,/data-join-action="submit"/);
  }
 }
});
test("Applicant never has to provide a token URL",()=>{
 const d=valid();
 assert.equal(Object.hasOwn(d,"slug"),false);
 assert.deepEqual(validateStep(d,0,chains),[]);
 assert.doesNotMatch(joinMarkup(chains,d,0),/Token URL|data-join="slug"/);
});
test("Review validates identity but never requires chain selection",()=>{
 const d=valid();
 assert.deepEqual(validateStep(d,2,chains),[]);
 assert.deepEqual(validateStep({...d,contactEmail:""},2,chains),["Contact email"]);
 const html=joinMarkup(chains,{...d,canonicalChain:"base"},2);
 assert.match(html,/Proposed networks: XGRChain · Base · Polygon · Arbitrum/);
 assert.doesNotMatch(html,/type="checkbox" data-join-target/);
});

test("invalid formatting is detected on project identity step, not on Review",()=>{
 const d=valid();
 d.description="Arbitrum is an Ethereum scaling ecosystem.\n\nThis is a holder application.";
 assert.deepEqual(validateStep(d,0,chains),[]);
 d.description="A description with disallowed <script> markup.";
 assert.deepEqual(validateStep(d,0,chains),["Full description (40–5000 characters)"]);
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
