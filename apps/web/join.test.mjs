import test from "node:test";
import assert from "node:assert/strict";
import {draft,validateStep,joinMarkup} from "./join.js";

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
