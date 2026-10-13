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
 assert.match(html,/Do not send the source transfer again/);
 assert.match(html,/disabled/);
 assert.match(html,/xita-lookup-form/);
 const stranger=renderMyTransfers({account:other,catalog:cat,items:[item]});
 assert.doesNotMatch(stranger,new RegExp(h("6")));
});
test("unavailable proof backend does not masquerade as a working delivery flow",()=>{
 const html=renderMyTransfers({account,catalog:cat,items:[{
  account,txHash:h("6"),status:"awaiting-proof",messageId:h("7"),
  sourceChain:"xgrchain",destinationChain:"base",asset:"XGR"}]});
 assert.match(html,/proof service required/);
 assert.match(html,/destination signing stays disabled/);
 assert.doesNotMatch(html,/eth_sendTransaction|wallet_switchEthereumChain/);
});
test("without deployed routes, import is disabled and does not invent wallet history",()=>{
 const html=renderMyTransfers({account,catalog:{chains:cat.chains,assets:{},infrastructure:cat.infrastructure}});
 assert.match(html,/No deployed source route/);
 assert.match(html,/Automatic full-history indexing is not live yet/);
 assert.doesNotMatch(html,/data-message-id/);
});
