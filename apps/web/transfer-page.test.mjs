import test from "node:test";
import assert from "node:assert/strict";
import {renderMyTransfers,transferMenuVisible} from "./transfer-page.js";
const account="0x"+"a".repeat(40), other="0x"+"b".repeat(40);
const h=n=>"0x"+n.repeat(64);
const cat={chains:{xgrchain:{name:"XGRChain",chainId:1643,domainId:1643},
 base:{name:"Base",chainId:8453,domainId:8453}},
 infrastructure:{xgrchain:{xitaV315:{components:{mailbox:{address:"0x"+"1".repeat(40)}}}},
 base:{xitaV315:{components:{mailbox:{address:"0x"+"2".repeat(40)}}}}},
 assets:{XGR:{deployment:{present:true,assetId:h("e"),routeDeployments:[{
  routeName:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base",
  routeId:h("5"),components:{gateway:{address:"0x"+"3".repeat(40)}}}]},
  routes:{routes:[{name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"}]}}}};
test("My Transfers introduction never uses the global navigation header layout",()=>{
 const html=renderMyTransfers({account,catalog:cat});
 assert.match(html,/<div class="ux-my-transfers-intro">/);
 assert.match(html,/<h1>My Transfers<\/h1>/);
 assert.doesNotMatch(html,/<header(?:\\s|>)/);
 assert.match(html,/Only transfers initiated by your connected wallet are shown/);
 assert.match(html,/Confirmed transfers use canonical Gateway\/Mailbox evidence/);
});
test("My Transfers and menu are entirely absent until a valid wallet connects",()=>{
 assert.equal(transferMenuVisible(null),false);
 assert.equal(transferMenuVisible("0x1234"),false);
 assert.equal(renderMyTransfers({account:null,catalog:cat,items:[{account}]}),"");
 assert.equal(transferMenuVisible(account),true);
});
test("wallet-specific transfer cards never expose previous connected account",()=>{
 const item={account,asset:"XGR",sourceChain:"xgrchain",destinationChain:"base",
  txHash:h("6"),messageId:h("7"),validatorFeeWei:"100000000000000000",
  status:"awaiting-proof"};
 const html=renderMyTransfers({account,catalog:cat,items:[item]});
 assert.match(html,/Message ID/);assert.match(html,/Source TX/);
 assert.match(html,/Original source confirmed/);
 assert.match(html,new RegExp('href="/transfer\\?token=XGR&amp;resume='+h("6")+'"'));
 assert.match(html,/xita-lookup-form/);
 const stranger=renderMyTransfers({account:other,catalog:cat,items:[item]});
 assert.doesNotMatch(stranger,new RegExp(h("6")));
});
test("My Transfers never signs and links to the unique transfer recovery flow",()=>{
 const html=renderMyTransfers({account,catalog:cat,items:[{
  account,txHash:h("6"),status:"awaiting-proof",messageId:h("7"),
  sourceChain:"xgrchain",destinationChain:"base",asset:"XGR"}]});
 assert.match(html,/Open in Transfer Tokens/);
 assert.match(html,/Only destination delivery can be continued/);
 assert.doesNotMatch(html,/eth_sendTransaction|wallet_switchEthereumChain/);
});
test("without deployed routes, import is disabled and does not invent wallet history",()=>{
 const html=renderMyTransfers({account,catalog:{chains:cat.chains,assets:{},infrastructure:cat.infrastructure}});
 assert.match(html,/No deployed source route/);
 assert.match(html,/Transfer index unavailable/);
 assert.doesNotMatch(html,/data-message-id/);
});

test("manual source TX hash is optional while wallet discovery is primary",()=>{
 const html=renderMyTransfers({account,catalog:cat});
 assert.match(html,/normally discovers transfers automatically/);
 assert.match(html,/<details class="ux-transfer-lookup">/);
 assert.match(html,/optional\)<\/summary>/);
 assert.match(html,/id="xita-lookup-form"/);
});

test("every unresolved transfer links to its own verified wallet recovery intent",()=>{
 const tx=h("c");
 for(const status of ["awaiting-proof","awaiting-onward","awaiting-final-proof",
   "delivery-unknown","final-delivery-unknown","confirming","pending-source"]){
  const html=renderMyTransfers({account,catalog:cat,items:[{
   account,asset:"XGR",sourceChain:"base",destinationChain:"xgrchain",
   txHash:tx,status,confirmed:status!=="pending-source"
  }]});
  assert.match(html,new RegExp('href="/transfer\\?token=XGR&amp;resume='+tx+'"'),status);
 }
 const alien=renderMyTransfers({account:other,catalog:cat,items:[{
  account,txHash:tx,status:"awaiting-proof",asset:"XGR"}]});
 assert.doesNotMatch(alien,/&amp;resume=/);
});
