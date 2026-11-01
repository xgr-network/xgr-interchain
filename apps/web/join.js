// Minimal, server-authoritative CoinGecko Join and reviewed profile management.
import {isDeployedChain} from "./route-availability.js";
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ID=/^[a-z0-9][a-z0-9-]{0,99}$/,EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function joinHomeChains(catalog){
 return Object.keys(catalog?.chains||{}).filter(key=>key!=="xgrchain"&&isDeployedChain(catalog,key)&&
 /^[a-z0-9][a-z0-9-]{0,99}$/.test(catalog.chains[key].coingeckoAssetPlatform||""));
}
export function draft(){
 return {coingeckoId:"",canonicalChain:"",contactEmail:"",confirmed:false};
}
export function validateStep(d,step,catalog,preview=null){
 const missing=[];
 if(step===0&&!ID.test(d.coingeckoId||""))missing.push("CoinGecko API ID");
 if(step===1&&preview?.choices?.length>0&&!preview.choices.some(x=>x.chain===d.canonicalChain))
  missing.push("Original blockchain");
 if(step===2){
  if(!EMAIL.test(d.contactEmail||"")||d.contactEmail.length>254)missing.push("Contact email");
  if(d.confirmed!==true)missing.push("Project confirmation");
 }
 return missing;
}
export function validateApplication(d,catalog,preview=null){
 return [0,1,2].flatMap(i=>validateStep(d,i,catalog,preview));
}
const field=(id,label,val,placeholder,type="text")=>'<label class="ja-field" for="ja-'+id+'"><span>'+label+'</span>'+
 '<input id="ja-'+id+'" data-join="'+id+'" type="'+type+'" maxlength="254" placeholder="'+placeholder+'" value="'+escape(val||"")+'"></label>';
export function joinMarkup(catalog,d=draft(),status="",busy=false,preview=null,{creatorAvailable=false,mode=null}={}){
 const choices=preview?.choices||[];
 const accepted=preview?.profile;
 const showIntegration=mode==="integrate";
 const supported=joinHomeChains(catalog).map(key=>catalog.chains[key].displayName||
  catalog.chains[key].name||key);
 const chainHint='<p class="ja-chain-hint">We check CoinGecko contract addresses against currently available XITA networks: '+
  escape(supported.join(", "))+
  '. Networks without a verified matching contract are not selectable.</p>';
 const chainMatch=accepted&&choices.length?
  '<p class="ja-chain-match" role="status">CoinGecko contract matches on '+
  escape(choices.map(c=>c.label).join(", "))+
  '. '+(choices.length===1?
   'Original blockchain selected automatically.':
   'Choose the original blockchain from these supported networks.')+'</p>':"";
 const entryCards='<section class="ja-entry-grid" aria-label="Choose how to join XITA">'+
  '<article class="ja-entry-card ja-entry-integrate'+(showIntegration?' is-selected':'')+'">'+
  '<div class="ja-entry-icon" aria-hidden="true">⇄</div>'+
  '<span class="ux-kicker">EXISTING PROJECT</span><h2>Integrate a Token</h2>'+
  '<p>Already have a token? Connect it to XITA using your CoinGecko profile.</p>'+
  '<button type="button" class="ux-button ja-entry-action" data-join-entry="integrate"'+
  ' aria-expanded="'+(showIntegration?'true':'false')+'" aria-controls="ja-integration-panel">'+
  'Join for Free <span aria-hidden="true">→</span></button></article>'+
  '<article class="ja-entry-card ja-entry-create'+(creatorAvailable?'':' is-unavailable')+'">'+
  '<div class="ja-entry-icon" aria-hidden="true">＋</div>'+
  '<span class="ux-kicker">START ON XGRCHAIN</span><h2>Create a Token</h2>'+
  '<p>Launch your own ERC-20 on XGRChain and join the XITA ecosystem.</p>'+
  (creatorAvailable?
   '<a href="/createtoken" data-nav class="ux-button ja-entry-action">Create for Free <span aria-hidden="true">→</span></a>':
   '<span class="ja-entry-soon" role="status">Available soon</span>')+
  '</article></section>';
 const choice=choices.length>1?
 '<label class="ja-field ja-field-full"><span>Original blockchain *</span><select data-join="canonicalChain" id="ja-canonicalChain">'+
 '<option value="">Select the original blockchain</option>'+
 choices.map(c=>'<option value="'+escape(c.chain)+'"'+(d.canonicalChain===c.chain?' selected':'')+'>'+
 escape(c.label)+' · '+escape(c.contract)+'</option>').join("")+'</select></label>':"";
 const summary=accepted?'<section class="ja-form-section"><h3>Imported from CoinGecko</h3><div class="ja-import-preview">'+
 (accepted.logoUrl?'<img src="'+escape(accepted.logoUrl)+'" alt="" width="52" height="52">':"")+
 '<div><strong>'+escape(accepted.name)+' ('+escape(accepted.symbol)+')</strong><p>'+
 escape(accepted.shortDescription||"")+'</p></div></div><p class="ux-small">Metadata, descriptions, project links and the selected ERC-20 address are imported and verified server-side. You cannot edit them in this form.</p></section>':"";
 return '<div class="ja-page ja-onepage"><div class="ja-hero"><div class="ux-kicker">XITA · JOIN THE ALLIANCE</div>'+
 '<h1>Bring your token into the <span>Universe.</span></h1>'+
 '<p class="ux-lead">Join the XITA ecosystem. Free integration and initial route deployment after review.</p></div>'+
 (showIntegration?
  '<div class="ja-join-back"><button type="button" class="ux-outline-button" data-join-entry="back">← Back to options</button></div>':
  entryCards)+
 '<section class="ja-integration-panel" id="ja-integration-panel">'+(showIntegration?
 '<div class="ja-layout"><section class="ux-panel ja-wizard" aria-labelledby="ja-form-title">'+
 '<div class="ja-form-head"><h2 id="ja-form-title">Integrate your token</h2>'+
 '<p class="ja-info">Your public project information comes directly from CoinGecko.</p></div>'+
 '<form id="ja-application-form" novalidate><div class="ja-fields">'+
 field("coingeckoId","CoinGecko API ID *",d.coingeckoId,"e.g. arbitrum")+
 '<div class="ja-field"><span>Load project information</span><button type="button" class="ux-button" data-join-action="preview"'+(busy?' disabled':'')+'>Load from CoinGecko</button></div>'+
 choice+'</div>'+chainHint+chainMatch+summary+
 '<section class="ja-form-section"><h3>Email verification</h3><div class="ja-fields">'+
 field("contactEmail","Contact email *",d.contactEmail,"you@project.org","email")+
 '</div><label class="ja-consent"><input data-join="confirmed" type="checkbox"'+(d.confirmed?' checked':'')+'>'+
 '<span>I confirm this is a legitimate project proposal. An email verification does not imply project ownership. Integration and public listing require independent review.</span></label>'+
 '<p class="ja-private-contact">Your contact email stays private and will never enter a public GitHub PR.</p></section>'+
 '<div class="ja-status" id="ja-status" role="alert" aria-live="polite">'+escape(status)+'</div>'+
 '<div class="ja-actions"><button type="submit" data-join-action="submit" class="ux-button"'+
 (busy?' disabled':'')+'>Submit free application</button></div></form>'+
 '</section></div>':'')+'</section>'+
 '<p class="ja-entry-existing">Already listed? <a data-nav href="/profile-update">Update Token Profile</a></p></div>';
}
export function profileUpdateMarkup(catalog,form={},status="",busy=false,preview=null){
 const assets=Object.entries(catalog?.assets||{}).filter(([,a])=>a?.profile?.market).sort((a,b)=>a[0].localeCompare(b[0]));
 const e=catalog?.assets?.[form.symbol];
 const currentId=e?.profile?.market?.coingeckoId||null;
 const select='<label class="ja-field ja-field-full"><span>Existing token *</span>'+
 '<select id="pu-symbol" data-profile="symbol"><option value="">Choose a listed token</option>'+
 assets.map(([key,a])=>'<option value="'+escape(key)+'"'+(key===form.symbol?' selected':'')+'>'+
 escape(a.profile?.name||key)+' ('+escape(key)+')</option>').join("")+'</select></label>';
 const id=currentId?'<div class="ja-field ja-field-full"><span>CoinGecko ID</span><strong>'+escape(currentId)+'</strong>'+
 '<small>Already linked. The published CoinGecko profile will be reloaded.</small></div>':
 e?field("coingeckoId","Add CoinGecko ID *",form.coingeckoId||"","e.g. token-id").replaceAll('data-join="coingeckoId"','data-profile="coingeckoId"'):"";
 const manual=e&&!currentId?'<p class="ja-info">For individual changes without CoinGecko, contact <a href="mailto:xita@xgr.network">xita@xgr.network</a>. Self-service updates only add a CoinGecko ID and import its profile.</p>':"";
 const summary=preview?'<div class="ja-form-section"><strong>CoinGecko profile ready for review</strong>'+
 '<p>'+escape(preview.profile?.name||"")+'</p><small>Only description, name, logo, categories, project links and CoinGecko association may change. Contracts, supply, routes and deployment records remain unchanged.</small></div>':"";
 return '<div class="ja-page ja-onepage"><div class="ja-hero"><div class="ux-kicker">XITA · PROFILE MANAGEMENT</div>'+
 '<h1>Update Token <span>Profile.</span></h1>'+
 '<p class="ux-lead">Reload CoinGecko metadata for a listed token, or link a CoinGecko ID for the first time.</p></div>'+
 '<div class="ja-layout"><section class="ux-panel ja-wizard"><form id="xita-profile-update-form" novalidate>'+
 '<div class="ja-fields">'+select+id+'</div>'+manual+
 '<button class="ux-button" type="button" data-profile-action="preview"'+(busy?' disabled':'')+'>Preview update</button>'+
 summary+'<div class="ja-fields">'+field("contactEmail","Contact email *",form.contactEmail||"","you@project.org","email").replaceAll('data-join="contactEmail"','data-profile="contactEmail"')+'</div>'+
 '<label class="ja-consent"><input type="checkbox" data-profile="confirmed"'+(form.confirmed?' checked':'')+'>'+
 '<span>I request a CoinGecko-based profile refresh. This is a proposal and requires XGR review.</span></label>'+
 '<div class="ja-status" id="pu-status" role="alert">'+escape(status)+'</div>'+
 '<div class="ja-actions"><button type="submit" class="ux-button"'+(busy||!e?' disabled':'')+'>Submit profile update</button></div>'+
 '</form></section></div></div>';
}

export function joinPendingMarkup(data){
 const accepted=typeof data?.contactEmail==="string"&&data.contactEmail.length>0;
 const heading=accepted?"Thank you for submitting your project!":"Check your email to complete your application";
 const email=accepted?'<p>We have sent an email to <strong>'+escape(data.contactEmail)+'</strong> with your confirmation link.</p>':
  '<p>If you have submitted a token application, check the inbox you entered in the form.</p>';
 return '<section class="ux-app ja-page ja-outcome"><div class="ux-kicker">XITA · JOIN THE ALLIANCE</div>'+
  '<h1>'+heading+'</h1><div class="ux-panel ja-outcome-panel" role="status">'+
  '<div class="ja-outcome-label">'+(accepted?'APPLICATION RECEIVED · AWAITING EMAIL CONFIRMATION':'EMAIL CONFIRMATION REQUIRED')+'</div>'+
  '<h2>One more step: confirm your email</h2>'+email+
  '<ol class="ja-outcome-steps"><li>Open the email with the subject “Confirm your XITA Network application”.</li>'+
  '<li>Click the private confirmation link within <strong>24 hours</strong>.</li>'+
  '<li>After confirmation, XITA revalidates the token and attempts to create a GitHub Draft PR for XGR review.</li></ol>'+
  '<p class="ja-info">You can close this page now. If you cannot find the email, check your spam folder. No GitHub PR, public listing or contract deployment has been created yet.</p>'+
  '<a class="ux-outline-button ja-outcome-link" href="/markets" data-nav>Browse tokens</a>'+
  '</div></section>';
}

export function joinConfirmationMarkup(state={}){
 const phase=state.phase||"idle";
 const successful=phase==="success";
 const failed=phase==="failed";
 const invalid=phase==="invalid";
 const title=successful?"Your email has been verified!":failed?"We could not complete confirmation":
  invalid?"Confirmation link unavailable":"Confirm your XITA application";
 const heading=successful?"DRAFT PROPOSAL CREATED":failed?"CONFIRMATION NOT COMPLETED":
  invalid?"INVALID LINK":"CHECKING EMAIL & TOKEN IDENTITY";
 const safePr=successful&&Number.isSafeInteger(state.prNumber)&&state.prNumber>0&&
  state.prUrl==="https://github.com/xgr-network/xgr-interchain/pull/"+state.prNumber;
 const intro=successful?"Your email has been confirmed and the token proposal is awaiting XGR review.":
  failed?"The application has not been confirmed in this browser. The server reported:":
  invalid?"Open the complete confirmation link from the email. No public proposal was created by this page.":
  "Checking your private confirmation, revalidating the token and preparing the GitHub Draft PR. This may take a short while.";
 const detail=failed?'<p class="ja-outcome-error">'+escape(state.message||"Confirmation service unavailable")+'</p>':"";
 const more=successful?'<p class="ja-info">Draft PR #'+escape(state.prNumber)+
  ' is a proposal only. No contracts have been deployed and no routes are live.</p>':
  failed?'<p class="ja-info">Do not submit a new application. Check whether a GitHub proposal was already created before using the same email link again or contacting XGR support.</p>':
  invalid?"":'<p class="ja-info">Please keep this page open. Do not submit another application while verification is in progress.</p>';
 return '<section class="ux-app ja-page ja-outcome"><div class="ux-kicker">XITA · JOIN THE ALLIANCE</div>'+
  '<h1>'+title+'</h1><div class="ux-panel ja-outcome-panel">'+
  '<div class="ja-outcome-label">'+heading+'</div>'+
  '<p id="ja-confirm-status" role="status" aria-live="polite">'+intro+'</p>'+detail+more+
  (safePr?'<a id="ja-confirm-pr" class="ux-outline-button ja-outcome-link" href="'+state.prUrl+'" target="_blank" rel="noopener noreferrer">View GitHub Draft PR #'+state.prNumber+' ↗</a>':"")+
  (successful?'<p class="ja-info">You will receive application status updates by email.</p>':"")+
  '</div></section>';
}
