// Wallet-bound recovery view: never show activity before account authorization.
import {configuredGatewayRoutes} from "./wallet-transfers.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ADDR=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const statuses={
 "pending-source":["Source pending","Await the first transaction receipt. Do not send again."],
 "confirming":["Waiting for finality","The source transaction needs additional confirmations."],
 "source-failed":["Source failed","The source transaction reverted. No message was dispatched; check the source gas paid."],
 "destination-not-deployed":["Destination not deployed","The paired destination Mailbox is not documented. Delivery is not enabled."],
 "delivery-unknown":["Delivery unverified","The target-chain RPC cannot verify the delivery flag. Never assume delivered or lost."],
 "awaiting-proof":["Destination outstanding","The source message is verified and has not been delivered. Do not repeat the source transaction."],
 delivered:["Delivered","The target Mailbox confirms that the message was delivered."]
};
export function validWalletAddress(account){return typeof account==="string"&&ADDR.test(account)&&!/^0x0{40}$/i.test(account)}
export function transferMenuVisible(account){return validWalletAddress(account)}
export function renderMyTransfers({account,catalog,items=[],scanning=false,notice="",error="",scanReport=null}={}){
 if(!validWalletAddress(account))return "";
 const routeList=configuredGatewayRoutes(catalog);
 const available=[...new Set(routeList.map(r=>r.sourceChain))];
 const chains=catalog?.chains||{};
 const options=available.map(key=>'<option value="'+esc(key)+'">'+esc(chains[key]?.name||key)+'</option>').join("");
 const cards=items.filter(t=>t.account?.toLowerCase()===account.toLowerCase()).map(t=>{
  const [title,detail]=statuses[t.status]||statuses["delivery-unknown"];
  const ref=t.messageId&&HASH.test(t.messageId)?t.messageId:null;
  const canRecover=t.status==="awaiting-proof";
  return '<article class="ux-transfer-card" data-source-tx="'+esc(t.txHash)+'">'+
   '<div class="ux-transfer-head"><strong>'+esc(t.asset||"Token")+' · '+
   esc(chains[t.sourceChain]?.name||t.sourceChain)+' → '+
   esc(chains[t.destinationChain]?.name||t.destinationChain)+'</strong>'+
   '<span class="ux-transfer-status is-'+esc(t.status)+'">'+esc(title)+'</span></div>'+
   '<p class="ux-small">'+esc(detail)+'</p>'+
   '<div class="ux-transfer-meta"><span>Source TX</span><code>'+esc(t.txHash)+'</code></div>'+
   (ref?'<div class="ux-transfer-meta"><span>Message ID</span><code>'+esc(ref)+'</code></div>':'')+
   (t.validatorFeeWei?'<div class="ux-transfer-meta"><span>Validator fee (Wei)</span><code>'+esc(t.validatorFeeWei)+'</code></div>':'')+
   (canRecover?'<p class="ux-transfer-warning">Do not send the source transfer again. The read-only on-chain recovery proof endpoint is not yet live; destination signing stays disabled.</p>':'')+
   '<button type="button" disabled class="ux-transfer-resume"'+
   (ref?' data-message-id="'+esc(ref)+'"':'')+
   '>Continue destination delivery'+(canRecover?" · proof service required":" · not available")+'</button>'+
   '</article>';
 }).join("");
 return '<section class="ux-app ux-my-transfers" aria-label="My Transfers">'+
  '<header><div class="ux-kicker">XITA · WALLET ACTIVITY</div><h1>My Transfers</h1>'+
  '<p class="ux-muted">Only transfers initiated by your connected wallet are shown. Reconnect on another device to search on-chain; never repeat an already confirmed source transaction.</p>'+
  '<p class="ux-small">Connected '+esc(account.slice(0,6)+"…"+account.slice(-4))+
  ' · These records are checked against canonical Gateway and Mailbox events, not browser cache.</p></header>'+
  '<div class="ux-transfer-actions"><button type="button" id="xita-scan-transfers"'+
  (scanning?" disabled":"")+'>Refresh recent wallet transfers</button>'+
  '<span class="ux-small">'+esc(scanning?"Scanning confirmed source blocks…":
   scanReport?("Recent scan: "+scanReport.lookback+" blocks per deployed route. "+
    (scanReport.limited?"Additional transfers may exist.":"Older transfers require a source TX hash.")):
    "Automatic full-history indexing is not live yet.")+'</span></div>'+
  (notice?'<p class="ux-transfer-notice" role="status">'+esc(notice)+'</p>':'')+
  (error?'<p class="ux-transfer-error" role="alert">'+esc(error)+'</p>':'')+
  '<section class="ux-transfer-lookup"><h2>Find a previous transfer</h2>'+
  '<p class="ux-small">Paste the FIRST/source transaction hash, including if you changed devices. The original wallet must be connected. Recovery never calls TX 1 again.</p>'+
  '<form id="xita-lookup-form"><label>Source chain<select name="sourceChain" required>'+
    (options||'<option value="">No deployed source route</option>')+'</select></label>'+
   '<label>Source transaction hash<input name="txHash" type="text" spellcheck="false" autocomplete="off"'+
   ' placeholder="0x…" minlength="66" maxlength="66" required></label>'+
   '<button type="submit"'+(available.length===0?" disabled":"")+'>Find transfer</button></form>'+
  '</section>'+
  '<section class="ux-transfer-cards"><h2>Verified wallet activity</h2>'+
  (cards||'<p class="ux-muted">No confirmed wallet transfers identified in the available coverage. This is not proof that your wallet has never bridged.</p>')+'</section>'+
  '<p class="ux-small">Destination gas is paid separately in MetaMask. A successful source transaction is not the same as completed delivery. Automatic proof construction and the wallet-signed recovery transaction remain closed until independently tested on deployed v3.1.5 routes.</p>'+
  '</section>';
}
