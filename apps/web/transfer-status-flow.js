// Transfer status is a view of canonical wallet/Gateway/Mailbox evidence.
// Transient UI stages never establish chain finality or authorize another source TX.
const NAMES={xgrchain:"XGRChain",base:"Base",arbitrum:"Arbitrum",polygon:"Polygon"};
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const name=key=>NAMES[key]||key||"Unknown network";
const HASH=/^0x[0-9a-f]{64}$/i;
const sourceConfirmed=new Set(["awaiting-proof","delivery-unknown","awaiting-onward","awaiting-final-proof","final-delivery-unknown","journey-ambiguous","journey-delivered","delivered"]);
const firstDelivered=new Set(["awaiting-onward","awaiting-final-proof","final-delivery-unknown","journey-ambiguous","journey-delivered"]);
const secondConfirmed=new Set(["awaiting-final-proof","final-delivery-unknown","journey-delivered"]);
const activeStages={
 "source-approval":0,"source-sign":0,"source-pending":0,
 "first-proof-wait":1,"first-delivery-sign":2,"first-delivery-pending":2,
 "onward-approval":3,"onward-source-sign":3,"onward-source-pending":3,
 "final-proof-wait":4,"final-delivery-sign":5,"final-delivery-pending":5
};
export function deriveTransferFlow({journey={},record=null,stage="",working=false,scanning=false,notice="",error=""}={}){
 const origin=journey.origin||record?.sourceChain||"";
 const destination=journey.destination||record?.finalDestinationChain||record?.destinationChain||"";
 const asset=journey.asset||record?.asset||"Token";
 const twoHop=Boolean(origin&&destination&&origin!=="xgrchain"&&destination!=="xgrchain");
 const status=record?.status||"";
 // In a two-hop journey, delivery to XGRChain is NEVER final delivery to the
 // requested spoke. Only journey-delivered verifies both destination Mailboxes.
 const delivered=twoHop?status==="journey-delivered"&&record?.delivered===true:
   status==="delivered"&&record?.delivered===true;
 const firstSource=Boolean(record?.confirmed)&&sourceConfirmed.has(status);
 const confirmationText=status==="confirming"&&Number.isInteger(record?.confirmationsObserved)&&Number.isInteger(record?.requiredConfirmations)?
  "Source mined · "+record.confirmationsObserved+" / "+record.requiredConfirmations+" confirmations":null;
 const firstDestination=twoHop?
   firstDelivered.has(status)&&record?.delivered===true:delivered;
 const onwardSource=twoHop&&secondConfirmed.has(status)&&
   HASH.test(record?.secondHopTxHash||"")&&HASH.test(record?.secondHopMessageId||"");
 const firstProof=firstDestination||(working&&["first-delivery-sign","first-delivery-pending"].includes(stage));
 const finalProof=delivered||(working&&["final-delivery-sign","final-delivery-pending"].includes(stage));
 const completed=twoHop?
   [firstSource,firstProof,firstDestination,onwardSource,finalProof,delivered]:
   [firstSource,firstProof,delivered];
 const steps=twoHop?[
   ["Source transaction",name(origin)+" · wallet confirmation","wallet"],
   ["Validator verification",name(origin)+" → XGRChain · no wallet action","verify"],
   ["Delivery to XGRChain","XGRChain · wallet confirmation","wallet"],
   ["Onward transaction","XGRChain → "+name(destination)+" · wallet confirmation","wallet"],
   ["Validator verification","XGRChain → "+name(destination)+" · no wallet action","verify"],
   ["Final delivery to "+name(destination),name(destination)+" · wallet confirmation","wallet"]
  ]:[
   ["Source transaction",name(origin)+" · wallet confirmation","wallet"],
   ["Validator verification",name(origin)+" → "+name(destination)+" · no wallet action","verify"],
   ["Delivery to "+name(destination),name(destination)+" · wallet confirmation","wallet"]
  ];
 let index=0;
 while(index<completed.length&&completed[index])index++;
 if(working&&Object.hasOwn(activeStages,stage)){
   const staged=activeStages[stage];
   // The actual recorded state always wins over a stale asynchronous UI hint.
   if(staged>=index&&staged<steps.length)index=staged;
 }
 if(index>=steps.length)index=-1;
 const pendingWallet=twoHop?["awaiting-proof","awaiting-onward","awaiting-final-proof"]:
   ["awaiting-proof"];
 const continueLabel=status==="awaiting-onward"?"Continue onward from XGRChain":
   status==="awaiting-final-proof"?"Continue final delivery":
   "Check validators and continue delivery";
 const canContinue=!working&&!error&&Boolean(record?.confirmed)&&
   pendingWallet.includes(status)&&!delivered;
 const canRefresh=!working&&!delivered&&(Boolean(record)||HASH.test(journey.sourceTxHash||""));
 const needsAttention=Boolean(error)||["delivery-unknown","final-delivery-unknown",
   "journey-ambiguous","destination-not-deployed"].includes(status);
 const awaitingWallet=working&&["source-approval","source-sign","first-delivery-sign",
   "onward-approval","onward-source-sign","final-delivery-sign"].includes(stage);
 let heading=delivered?"Transfer delivered":
   needsAttention?"Verification needs attention":
   awaitingWallet?"MetaMask action required":
   working?"Checking transfer — please wait":
   canContinue?"Ready for the next verified step":
   canRefresh?"Transfer not yet complete":"Preparing transfer";
 if(status==="pending-source")heading="Source transaction pending";
 if(status==="confirming")heading="Source finality pending";
 if(status==="awaiting-onward"&&!working&&!error)heading="XGRChain delivery confirmed";
 if(status==="awaiting-final-proof"&&!working&&!error)heading="Second hop confirmed";
 if(delivered)heading="Transfer complete";
 let message=delivered?"Both destination Mailbox deliveries are confirmed. No further wallet action is required.":
   error?String(error):
   status==="confirming"?(confirmationText||"Source receipt mined; awaiting source-chain finality.")+". Do not submit another transaction.":
   notice?String(notice):
   status==="awaiting-onward"?"First delivery is verified. Continue only the linked onward transaction — never repeat the original source lock or burn.":
   status==="awaiting-final-proof"?"The onward source transaction is verified. The final destination proof and Mailbox delivery are still outstanding.":
   status==="awaiting-proof"?"Source transaction confirmed. Validator proof preparation and destination delivery may take time.":
   status==="confirming"?(confirmationText||"Source receipt mined; awaiting source-chain finality.")+". Do not submit another transaction.":
   status==="pending-source"?"Awaiting the original source receipt. Do not submit a duplicate transaction.":
   scanning?"Checking verified wallet history…":
   "Keep this window open for updates, or close it and resume from My Transfers.";
 if(twoHop&&delivered)message="Both XGRChain and "+name(destination)+" Mailbox deliveries are independently confirmed. No further transaction is required.";
 if(!delivered&&!error&&working&&["first-proof-wait","final-proof-wait"].includes(stage))
   message=notice||"Waiting for validator signatures. No MetaMask action is needed yet.";
 if(!delivered&&!working&&!record&&HASH.test(journey.sourceTxHash||""))
   message="Original wallet transaction was broadcast. Checking the chain index; do not submit another source transaction.";
 const verifiedWalletTx=twoHop?
   Number(firstSource)+Number(firstDestination)+Number(onwardSource)+Number(delivered):
   Number(firstSource)+Number(delivered);
 return {asset,origin,destination,twoHop,delivered,heading,message,steps:steps.map(([label,detail,kind],i)=>({
   label,detail,kind,state:completed[i]?"complete":i===index?"current":"pending"
  })),step:index,verifiedWalletTx,totalWalletTx:twoHop?4:2,
  canContinue,continueLabel,canRefresh,needsAttention,
  sourceTxHash:HASH.test(record?.txHash||"")?record.txHash:
   HASH.test(journey.sourceTxHash||"")?journey.sourceTxHash:null};
}
export function renderTransferFlow({journey,record,stage,working,scanning,notice,error}={}){
 const flow=deriveTransferFlow({journey,record,stage,working,scanning,notice,error});
 const sequence=[name(flow.origin),...(flow.twoHop?["XGRChain"]:[]),name(flow.destination)].join(" → ");
 const rows=flow.steps.map((step,i)=>
   '<li class="ux-flow-step is-'+step.state+'" data-flow-step="'+(i+1)+'">'+
    '<span class="ux-flow-step-indicator" aria-hidden="true">'+
      (step.state==="complete"?"✓":step.state==="current"?"⌛":String(i+1))+'</span>'+
    '<div class="ux-flow-step-text"><strong>'+esc(step.label)+'</strong><small>'+esc(step.detail)+'</small></div>'+
    '<span class="ux-flow-step-state">'+(step.state==="complete"?"Verified":
      step.state==="current"?"Current":"Pending")+'</span></li>').join("");
 return '<div class="ux-flow-content"><div class="ux-flow-header">'+
   '<div><span class="ux-kicker">XITA · VERIFIED TRANSFER</span><h2 id="xita-flow-title">Transfer status</h2>'+
   '<p class="ux-flow-route">'+esc(flow.asset)+' · '+esc(sequence)+'</p></div>'+
   '<button id="xita-flow-close" class="ux-flow-close" type="button" aria-label="Close transfer status">×</button>'+
  '</div>'+
  '<div class="ux-flow-banner'+(flow.needsAttention?" is-attention":flow.delivered?" is-done":"")+'" role="status" aria-live="polite">'+
   '<span class="ux-flow-spinner" aria-hidden="true">'+(flow.delivered?"✓":flow.needsAttention?"!":"⌛")+'</span>'+
   '<div><strong>'+esc(flow.heading)+'</strong><p>'+esc(flow.message)+'</p></div></div>'+
  '<div class="ux-flow-steps-heading"><strong>'+esc(flow.twoHop?"Two hops · six stages":"One hop · three stages")+
   '</strong><small>'+flow.verifiedWalletTx+' of '+flow.totalWalletTx+
   ' wallet transactions verified</small></div>'+
  '<ol class="ux-flow-steps">'+rows+'</ol>'+
  (flow.sourceTxHash?'<p class="ux-flow-hash">Original source TX: <code>'+esc(flow.sourceTxHash)+'</code></p>':'')+
  '<div class="ux-flow-footer"><p>Closing this view does not cancel a blockchain transaction. Resume using the original source TX in My Transfers. Never repeat a confirmed lock or burn.</p>'+
   '<div class="ux-flow-actions">'+
    (flow.canContinue?'<button id="xita-flow-continue" type="button" class="ux-button">'+esc(flow.continueLabel)+'</button>':
     flow.canRefresh?'<button id="xita-flow-refresh" type="button" class="ux-outline-button">Refresh verified status</button>':'')+
    '<button id="xita-flow-history" class="ux-outline-button" type="button">My Transfers</button>'+
    '<button id="xita-flow-done" class="ux-outline-button" type="button">'+(flow.delivered?"Close":"Hide status")+'</button>'+
   '</div></div></div>';
}
