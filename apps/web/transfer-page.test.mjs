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

test("verified linked two-hop Arbitrum to Base renders ONE wallet operation",()=>{
 const parent={account,asset:"XGR",sourceChain:"arbitrum",
  destinationChain:"xgrchain",finalDestinationChain:"base",
  finalRecipient:account,routeId:h("1"),onwardRouteId:h("2"),
  txHash:h("c"),messageId:h("d"),amountRaw:"100",
  confirmed:true,delivered:true,status:"awaiting-final-proof",
  secondHopTxHash:h("e"),secondHopMessageId:h("f")};
 const child={account,asset:"XGR",sourceChain:"xgrchain",
  destinationChain:"base",finalRecipient:account,routeId:h("2"),
  parentMessageId:h("d"),txHash:h("e"),messageId:h("f"),
  amountRaw:"100",executionAdapter:"0x"+"1".repeat(40),
  confirmed:true,delivered:false,status:"awaiting-proof"};
 const html=renderMyTransfers({account,catalog:{...cat,
  chains:{...cat.chains,arbitrum:{name:"Arbitrum"}}},
  items:[parent,child]});
 assert.equal((html.match(/class="ux-transfer-card"/g)||[]).length,1);
 assert.match(html,/Arbitrum → Base/);
 assert.match(html,/Second hop TX/);
 assert.doesNotMatch(html,/xita-transfer-card.*xita-transfer-card/s);
 const finished={...parent,status:"journey-delivered",finalDelivered:true};
 const complete=renderMyTransfers({account,catalog:cat,
  items:[finished,{...child,delivered:true,status:"delivered"}]});
 assert.equal((complete.match(/class="ux-transfer-card"/g)||[]).length,1);
 assert.match(complete,/Journey delivered/);
});
test("orphan second hop is not silently discarded as another person's journey",()=>{
 const lone={account,asset:"XGR",sourceChain:"xgrchain",destinationChain:"base",
  parentMessageId:h("a"),routeId:h("b"),txHash:h("c"),messageId:h("d"),
  finalRecipient:account,amountRaw:"100",executionAdapter:"0x"+"1".repeat(40),
  confirmed:true,delivered:false,status:"awaiting-proof"};
 const html=renderMyTransfers({account,catalog:cat,items:[lone]});
 assert.equal((html.match(/class="ux-transfer-card"/g)||[]).length,1);
});

test("recent wallet broadcast survives reload as explicitly UNVERIFIED, never as successful bridge",()=>{
 const tx=h("d");
 const html=renderMyTransfers({account,catalog:cat,items:[],broadcastHints:[
  {sourceChain:"xgrchain",txHash:tx,at:Date.now()}]});
 assert.match(html,/Unverified local wallet broadcasts/);
 assert.match(html,/<details class="ux-transfer-lookup">/);
 assert.match(html,/Unverified source TX/);
 assert.match(html,new RegExp(tx));
 assert.match(html,/Do not send TX1 again/);
 assert.doesNotMatch(html,/Message ID/);
 const indexed={account,sourceChain:"xgrchain",destinationChain:"base",
  txHash:tx,messageId:h("1"),status:"awaiting-proof",confirmed:true};
 const dedup=renderMyTransfers({account,catalog:cat,items:[indexed],
  broadcastHints:[{sourceChain:"xgrchain",txHash:tx}]});
 assert.equal((dedup.match(/data-source-tx=/g)||[]).length,1);
 assert.doesNotMatch(dedup,/Unverified source TX/);
});

test("linked TX3 and already indexed TXs cannot appear as independent broadcasts",()=>{
 const original=h("c"),child=h("d"),complete=h("e"),unknown=h("f");
 const parent={account,asset:"XGR",sourceChain:"arbitrum",destinationChain:"xgrchain",
  finalDestinationChain:"base",txHash:original,messageId:h("1"),
  routeId:h("2"),onwardRouteId:h("3"),secondHopTxHash:child,
  secondHopMessageId:h("4"),confirmed:true,delivered:true,status:"awaiting-final-proof"};
 const delivered={account,asset:"XGR",sourceChain:"base",destinationChain:"arbitrum",
  txHash:complete,messageId:h("5"),confirmed:true,delivered:true,status:"delivered"};
 const html=renderMyTransfers({account,catalog:{...cat,chains:{...cat.chains,
  arbitrum:{name:"Arbitrum"}}},items:[parent,delivered],broadcastHints:[
  {sourceChain:"xgrchain",txHash:child},
  {sourceChain:"base",txHash:complete},
  {sourceChain:"arbitrum",txHash:unknown}]});
 assert.match(html,/Unverified local wallet broadcasts/);
 assert.equal((html.match(/Unverified source TX/g)||[]).length,1);
 assert.equal((html.match(/data-source-tx=/g)||[]).length,3);
 assert.match(html,new RegExp(unknown));
});

test("F-09: native XGR Mailbox delivery never implies direct recipient payout",()=>{
 const delivered={account,asset:"XGR",sourceChain:"base",destinationChain:"xgrchain",
  txHash:h("a"),messageId:h("b"),status:"delivered",delivered:true};
 const html=renderMyTransfers({account,catalog:cat,items:[delivered],
  nativeClaim:{account,status:"pending",amountWei:"5000000000000000000",busy:false}});
 assert.match(html,/Native XGR claim pending/);
 assert.match(html,/Claim native XGR in wallet/);
 assert.match(html,/id="xita-check-native-claim"/);
 assert.match(html,/original beneficiary/);
 const unknown=renderMyTransfers({account,catalog:cat,items:[delivered]});
 assert.match(unknown,/Mailbox delivered · payout not independently checked/);
 assert.doesNotMatch(unknown,/Claim native XGR in wallet/);
 const otherWallet=renderMyTransfers({account:other,catalog:cat,items:[delivered],
  nativeClaim:{account,status:"pending",amountWei:"5000000000000000000"}});
 assert.doesNotMatch(otherWallet,/Claim native XGR in wallet/);
});
