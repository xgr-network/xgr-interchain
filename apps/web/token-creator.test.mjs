import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {creatorDraft,creatorPreview,validateCreatorDraft,tokenCreatorMarkup,CREATOR_STATUS}
 from "./token-creator.js";

test("creator preview uses 18 precise decimals, full fixed supply and no admin privileges",()=>{
 const d={name:"Example Token",symbol:"EXM",initialSupply:"1000000",accepted:true};
 const x=creatorPreview(d);
 assert.equal(x.ready,true);
 assert.equal(x.chain,"XGRChain");
 assert.equal(x.decimals,18);
 assert.equal(x.initialSupplyBaseUnits,"1000000000000000000000000");
 assert.equal(x.recipient,"Creator's connected wallet");
 assert.equal(x.fixedSupply,true);
 assert.deepEqual(validateCreatorDraft(d),[]);
 assert.equal(creatorPreview({...d,initialSupply:"1000000000000000000"}).initialSupplyBaseUnits,
  "1000000000000000000000000000000000000");
});
test("invalid or unsafe names, symbols, supply values and acknowledgments are rejected",()=>{
 const d={name:"Example Token",symbol:"EXM",initialSupply:"1",accepted:true};
 for(const bad of [
  {...d,name:"A"},{...d,name:"<script>alert(1)</script>"},
  {...d,symbol:"lower"},{...d,symbol:"2USD"},{...d,symbol:"EXM_TOO_LONG"},
  {...d,initialSupply:"0"},{...d,initialSupply:"1.5"},
  {...d,initialSupply:"9999999999999999999"},{...d,accepted:false}
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
  symbol:"EXM",initialSupply:"99",accepted:true});
 assert.doesNotMatch(markup,/<img/);
 assert.match(markup,/Token creation not yet activated/);
 assert.match(markup,/\sdisabled/);
 assert.match(markup,/No transaction will be requested/);
 const form=tokenCreatorMarkup(creatorDraft());
 assert.match(form,/id="xita-token-creator-form"/);
 assert.doesNotMatch(form,/data-nav/);
});
