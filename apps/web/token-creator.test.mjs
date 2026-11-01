import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {creatorDraft,creatorPreview,validateCreatorDraft,validateCreatorApplication,creatorRegistrationPayload,tokenCreatorMarkup,creatorSubmittedMarkup,creatorConfirmMarkup,CREATOR_STATUS}
 from "./token-creator.js";

test("creator preview uses 18 precise decimals, full fixed supply and no admin privileges",()=>{
 const d={name:"Example Token",symbol:"EXM",initialSupply:"1000000",ownerAddress:"0x1234567890123456789012345678901234567890",accepted:true};
 const x=creatorPreview(d);
 assert.equal(x.ready,true);
 assert.equal(x.chain,"XGRChain");
 assert.equal(x.decimals,18);
 assert.equal(x.initialSupplyBaseUnits,"1000000000000000000000000");
 assert.equal(x.recipient,"0x1234567890123456789012345678901234567890");
 assert.equal(x.fixedSupply,true);
 assert.deepEqual(validateCreatorDraft(d),[]);
 assert.equal(creatorPreview({...d,initialSupply:"1000000000000000000"}).initialSupplyBaseUnits,
  "1000000000000000000000000000000000000");
});
test("invalid or unsafe names, symbols, supplies and owner addresses are rejected",()=>{
 const d={name:"Example Token",symbol:"EXM",initialSupply:"1",ownerAddress:"0x1234567890123456789012345678901234567890",accepted:true};
 for(const bad of [
  {...d,name:"A"},{...d,name:"<script>alert(1)</script>"},
  {...d,symbol:"lower"},{...d,symbol:"2USD"},{...d,symbol:"EXM_TOO_LONG"},
  {...d,initialSupply:"0"},{...d,initialSupply:"1.5"},
  {...d,initialSupply:"9999999999999999999"},{...d,ownerAddress:"0x"+"0".repeat(40)}
 ])assert.ok(validateCreatorDraft(bad).length>0);
});
test("page is directly routable yet absent from navigation, with no unverified deploy request",()=>{
 const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
 const app=readFileSync(new URL("./app.js",import.meta.url),"utf8");
 assert.doesNotMatch(html,/href="\/createtoken"/);
 assert.match(app,/p==="\/createtoken"\?tokenCreatorMarkup/);
 assert.deepEqual(CREATOR_STATUS,{chainId:1643,factory:null,
  verifiedReceipt:null,available:false,starterGasAvailable:false});
 const markup=tokenCreatorMarkup({name:'<img src=x onerror=alert(1)>',
  symbol:"EXM",initialSupply:"99",ownerAddress:"0x1234567890123456789012345678901234567890",accepted:true});
 assert.doesNotMatch(markup,/<img src=x onerror/);
 assert.doesNotMatch(markup,/id="xita-creator-deploy"/);
 assert.match(markup,/There is no wallet deployment transaction/);
 const form=tokenCreatorMarkup(creatorDraft());
 assert.match(form,/id="xita-token-creator-form"/);
 assert.doesNotMatch(form,/data-nav/);
});

test("creator enrollment collects private email, complete Join project metadata and uploaded logo",()=>{
 const d={...creatorDraft(),name:"Example Token",symbol:"EXM",initialSupply:"1000000",ownerAddress:"0x1234567890123456789012345678901234567890",
  shortDescription:"Example decentralized token.",description:
   "A community project exploring wallet-owned tokens and sponsored Interchain launches on XGRChain.",
  website:"https://example.org",category:"DeFi",contactEmail:"contact@example.org",
  applicantRole:"founder",logoPngBase64:"aGVsbG8=",accepted:true,projectConfirmed:true};
 assert.deepEqual(validateCreatorApplication(d),[]);
 const payload=creatorRegistrationPayload(d);
 assert.deepEqual(payload.categories,["DeFi"]);
 assert.equal(payload.logoPngBase64,"aGVsbG8=");
 assert.equal(payload.contactEmail,"contact@example.org");
 assert.equal(payload.confirmed,undefined);
 assert.equal(payload.ownerAddress,d.ownerAddress);
 const html=tokenCreatorMarkup(d);
 assert.match(html,/data-creator-logo/);
 assert.match(html,/data-creator="ownerAddress"/);
 assert.match(html,/id="xita-creator-register"/);
 assert.match(html,/data-creator="contactEmail"/);
 assert.match(html,/data-creator="description"/);
 assert.match(html,/id="tc-logo-preview"/);
 assert.doesNotMatch(html,/data-creator="accepted"|data-creator="projectConfirmed"|data-creator="applicantRole"|Your relationship/);
 assert.match(html,/id="tc-registration-status"[^>]*hidden/);
 assert.match(creatorSubmittedMarkup({email:"contact@example.org"}),/Check your email/);
 assert.match(creatorSubmittedMarkup({email:"contact@example.org"}),/contact@example.org/);
 assert.match(creatorConfirmMarkup({phase:"email-verified",
  logoUrl:"https://xita.xgr.network/token-logos/"+"a".repeat(64)+".png"}),/Email verified/);
 assert.deepEqual(validateCreatorApplication({...d,logoPngBase64:""}).includes("Upload a PNG logo (max 128 KB)"),true);
});

test("creator variants have exact 6/8/18 decimals and irrecoverable lifetime cap",()=>{
 const base={name:"Project Token",symbol:"PRJ",ownerAddress:"0x1234567890123456789012345678901234567890",
  initialSupply:"1000",accepted:true};
 const fixed=creatorPreview({...base,tokenType:"fixed",decimals:18});
 assert.equal(fixed.ready,true);
 assert.equal(fixed.initialSupplyBaseUnits,"1000000000000000000000");
 assert.equal(fixed.fixedSupply,true);
 const burn=creatorPreview({...base,tokenType:"burnable",decimals:6,permit:true});
 assert.equal(burn.ready,true);
 assert.equal(burn.initialSupplyBaseUnits,"1000000000");
 assert.equal(burn.tokenType,"burnable");
 const minted=creatorPreview({...base,tokenType:"mintable",decimals:8,
  maxSupply:"1500",minterAddress:"0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"});
 assert.equal(minted.ready,true);
 assert.equal(minted.decimals,8);
 assert.equal(minted.maxSupply,"1500");
 assert.equal(minted.fixedSupply,false);
 assert.ok(validateCreatorDraft({...base,tokenType:"mintable",decimals:8,maxSupply:"999"}).length>0);
 assert.ok(validateCreatorDraft({...base,tokenType:"mintable",decimals:8,maxSupply:"1500",minterAddress:"0x0"}).length>0);
 assert.ok(validateCreatorDraft({...base,tokenType:"mintable",decimals:7,maxSupply:"1500"}).length>0);
 assert.ok(validateCreatorDraft({...base,tokenType:"INVALID"}).length>0);
 assert.match(tokenCreatorMarkup({...creatorDraft(),...base,tokenType:"mintable",decimals:"8",
  maxSupply:"1500"}),/data-creator="minterAddress"/);
 assert.match(tokenCreatorMarkup({...creatorDraft(),...base,tokenType:"fixed"}),/Enable EIP-2612 Permit signatures/);
});

test("creator defaults are safe; advanced section stays collapsed without explicit user action",()=>{
 const d=creatorDraft();
 assert.equal(d.tokenType,"burnable");assert.equal(d.decimals,"18");assert.equal(d.permit,false);
 const html=tokenCreatorMarkup(d);
 assert.match(html,/<details class="tc-advanced" id="tc-advanced">/);
 assert.match(html,/Advanced Settings/);
 assert.match(html,/Standard settings: Fixed Supply \+ Burnable/);
 assert.match(html,/data-creator="ownerAddress"/);
 assert.match(tokenCreatorMarkup({...d,advancedOpen:true}),/<details class="tc-advanced" id="tc-advanced" open>/);
 const sample={...d,name:"Test Token",symbol:"TST",ownerAddress:"0x1234567890123456789012345678901234567890",
 initialSupply:"1000",accepted:true};
 assert.equal(creatorPreview(sample).tokenType,"burnable");
 assert.equal(creatorPreview(sample).maxSupply,"1000");
 assert.equal(creatorPreview({...sample,tokenType:"mintable",maxSupply:"2000"}).maxSupply,"2000");
});

test("Creator submission navigates to a dedicated confirmation receipt and visible errors",()=>{
 const app=readFileSync(new URL("./app.js",import.meta.url),"utf8");
 assert.match(app,/p==="\/createtoken\/submitted"\?creatorSubmittedMarkup/);
 assert.match(app,/history\.pushState\(null,"","\/createtoken\/submitted"\)/);
 assert.match(app,/status\.scrollIntoView\(\{behavior:"smooth",block:"center"\}\)/);
 const d={...creatorDraft(),name:"Test Token",symbol:"TST",initialSupply:"1000",
  ownerAddress:"0x1234567890123456789012345678901234567890",
  shortDescription:"Example decentralized token.",description:"A community project exploring wallet owned tokens on XGRChain.",
  website:"https://example.org",category:"DeFi",contactEmail:"contact@example.org",logoPngBase64:"aGVsbG8="};
 assert.deepEqual(validateCreatorApplication(d),[]);
 assert.equal(creatorRegistrationPayload(d).applicantRole,undefined);
 assert.equal(creatorRegistrationPayload(d).confirmed,undefined);
});
