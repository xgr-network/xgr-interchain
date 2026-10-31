const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
import {normalizeJoinDescription} from "./join-description.js";
import {isDeployedChain} from "./route-availability.js";
const url=s=>/^https:\/\/[^@\s/]+/.test(s||"");
// A home chain is eligible only with documented deployed infrastructure AND
// an independently known CoinGecko asset-platform identity. Planned chains
// never appear merely because they exist in the desired route catalog.
export function joinHomeChains(catalog){
 const chains=catalog?.chains||{};
 return Object.keys(chains).filter(key=>key!=="xgrchain"&&
  isDeployedChain(catalog,key)&&
  /^[a-z0-9][a-z0-9-]{0,99}$/.test(chains[key]?.coingeckoAssetPlatform||""));
}
export function draft(chains){
 return {name:"",symbol:"",shortDescription:"",description:"",website:"",canonicalChain:"",canonicalAddress:"",decimals:18,categories:["DeFi"],tags:[],logoUrl:"",links:{},priceSource:"coingecko",coingeckoId:"",contactEmail:"",applicantRole:"",confirmed:false};
}
export function validateStep(d,step,catalog){
 const chains=catalog?.chains||{};
 const missing=[];
 if(step===0){
  if(d.name.trim().length<2||d.name.length>80)missing.push("Project name");
  if(!/^[A-Z][A-Z0-9]{1,11}$/.test(d.symbol))missing.push("Token symbol");
  if(!url(d.website))missing.push("HTTPS website");
  if(!normalizeJoinDescription(d.shortDescription,15,280))missing.push("Short description (15–280 characters)");
  if(!normalizeJoinDescription(d.description,40,5000))missing.push("Full description (40–5000 characters)");
  if(!url(d.logoUrl))missing.push("HTTPS logo URL");
 }else if(step===1){
  if(!joinHomeChains(catalog).includes(d.canonicalChain))missing.push("Canonical chain");
  if(d.priceSource!=="coingecko"||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(d.coingeckoId||""))missing.push("CoinGecko coin ID");
  if(!/^0x[0-9a-f]{40}$/i.test(d.canonicalAddress)||/^0x0{40}$/i.test(d.canonicalAddress))missing.push("ERC-20 contract address");
  if(d.decimals===null||d.decimals===""||!Number.isInteger(Number(d.decimals))||Number(d.decimals)<0||Number(d.decimals)>36)missing.push("Decimals");
 }else if(step===2){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contactEmail||"")||String(d.contactEmail||"").length>254)missing.push("Contact email");
  if(!["founder","core-team","authorized-representative","holder","community","other"].includes(d.applicantRole))missing.push("Relationship to token");
  if(!d.confirmed)missing.push("Project confirmation");
 }
 return missing;
}

export function validateApplication(d,catalog){
 return [0,1,2].flatMap(step=>validateStep(d,step,catalog));
}
export function joinMarkup(catalog,d,status="",busy=false){
 const chains=catalog?.chains||{};
 const field=(key,label,opts={})=>{
  const id="ja-"+key,type=opts.type||"text";
  const rules=type==="number"?' min="0" max="36" step="1"':' maxlength="'+(opts.max||500)+'"';
  return '<label class="ja-field'+(opts.full?' ja-field-full':'')+'" for="'+id+'"><span>'+escape(label)+'</span>'+
   '<input id="'+id+'" data-join="'+key+'" type="'+type+'" value="'+escape(d[key]??"")+'" required'+
   rules+' placeholder="'+escape(opts.placeholder||"")+'"></label>';
 };
 const area=(key,label,max,rows)=>
  '<label class="ja-field ja-field-full" for="ja-'+key+'"><span>'+escape(label)+'</span>'+
  '<textarea id="ja-'+key+'" data-join="'+key+'" required maxlength="'+max+
  '" rows="'+rows+'" placeholder="'+escape(key==="description"?"What does your project do, and what is its token used for?":"A short introduction to your project")+'">'+
  escape(d[key]||"")+'</textarea></label>';
 const chainOptions=joinHomeChains(catalog).map(key=>[key,chains[key]])
  .map(([key,c])=>'<option value="'+escape(key)+'"'+(key===d.canonicalChain?' selected':'')+'>'+
   escape(c.displayName||c.name||key)+'</option>').join("");
 const chain='<label class="ja-field" for="ja-canonicalChain"><span>Original blockchain *</span>'+
  '<select id="ja-canonicalChain" data-join="canonicalChain" required><option value="">Select home chain…</option>'+
  chainOptions+'</select></label>';
 const coin='<div class="ja-field ja-coingecko-field">'+
  '<div class="ja-field-title"><label for="ja-coingeckoId">CoinGecko API ID *</label>'+
  '<button type="button" class="ux-fee-help" id="ja-coingecko-help" aria-haspopup="dialog"'+
  ' aria-controls="ja-coingecko-dialog" aria-label="Where do I find my CoinGecko API ID?"'+
  ' title="What is the CoinGecko API ID?">?</button></div>'+
  '<input id="ja-coingeckoId" data-join="coingeckoId" type="text" required maxlength="100"'+
  ' placeholder="e.g. arbitrum" value="'+escape(d.coingeckoId||"")+'">'+
  '<small>Use the CoinGecko API ID, not the token symbol.</small></div>';
 const roles=[["founder","Founder"],["core-team","Core team"],["authorized-representative","Authorized representative"],
  ["holder","Token holder"],["community","Community member"],["other","Other"]]
  .map(([key,label])=>'<option value="'+key+'"'+(d.applicantRole===key?' selected':'')+'>'+label+'</option>').join("");
 const relationship='<label class="ja-field" for="ja-applicantRole"><span>Your relationship to the token *</span>'+
  '<select id="ja-applicantRole" data-join="applicantRole" required>'+
  '<option value="">Choose your role…</option>'+roles+'</select></label>';
 const dialog='<dialog id="ja-coingecko-dialog" class="ux-fee-dialog ja-coingecko-dialog" aria-labelledby="ja-coingecko-title">'+
  '<div class="ux-fee-dialog-header"><div><span class="ux-kicker">XITA · TOKEN IDENTITY</span>'+
  '<h2 id="ja-coingecko-title">Where is my CoinGecko API ID?</h2></div>'+
  '<button type="button" id="ja-coingecko-close" aria-label="Close CoinGecko help">×</button></div>'+
  '<p>Open <a href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">CoinGecko</a> and search for your token. Select its <strong>own coin page</strong>, not a similarly named asset.</p>'+
  '<ol><li>Find the <strong>Info</strong> section on the coin page.</li>'+
  '<li>Copy the field labeled <strong>API ID</strong> (for example <code>arbitrum</code> for ARB).</li>'+
  '<li>Enter that ID here. Do not use the ticker symbol, contract address or full website link.</li></ol>'+
  '<p>XITA checks this ID against CoinGecko and verifies that the listed token symbol, original blockchain and ERC-20 contract address match your application. A GeckoTerminal-only listing is not sufficient.</p>'+
  '<p>If the CoinGecko listing does not show your original-chain contract, the application cannot be verified yet.</p>'+
  '<button type="button" class="ux-fee-dialog-done" data-join-help-close>Got it</button></dialog>';
 return '<div class="ja-page ja-onepage"><div class="ja-hero"><div class="ux-kicker">XITA · JOIN THE ALLIANCE</div>'+
  '<h1>Bring your token into the <span>Universe.</span></h1>'+
  '<p class="ux-lead">Join XITA for free. For accepted CoinGecko-listed ERC-20 tokens, XITA handles the complete technical integration and XGR funds deployment of the approved interchain routes. No wallet connection or payment is needed to apply.</p></div>'+
  '<div class="ja-application-journey" aria-label="XITA partner onboarding">'+
  '<span><b>01</b> Free application</span><span><b>02</b> Confirm your email</span>'+
  '<span><b>03</b> XGR review</span><span><b>04</b> Free integration &amp; deployment if approved</span></div>'+
  '<div class="ja-layout"><section class="ux-panel ja-wizard">'+
  '<div class="ja-form-head"><span class="ux-kicker">ONE SIMPLE APPLICATION</span>'+
  '<h2>Tell us about your token.</h2>'+
  '<p class="ja-info">All required details are on this page. We verify the public token identity before sending your confirmation email.</p></div>'+
  '<form id="ja-application-form" novalidate>'+
  '<section class="ja-form-section" aria-labelledby="ja-section-project"><div class="ja-section-title">'+
  '<span class="ux-kicker">01 · PROJECT</span><h3 id="ja-section-project">Project details</h3></div>'+
  '<div class="ja-fields">'+field("name","Project name *",{max:80})+
  field("symbol","Token symbol *",{max:12,placeholder:"e.g. ARB"})+
  field("website","Project website *",{type:"url",placeholder:"https://project.example"})+
  field("logoUrl","Logo image URL (HTTPS) *",{type:"url",placeholder:"https://project.example/logo.png"})+
  area("shortDescription","Short description * (15–280 characters)",280,2)+
  area("description","Project description * (40–5000 characters)",5000,3)+'</div></section>'+
  '<section class="ja-form-section" aria-labelledby="ja-section-token"><div class="ja-section-title">'+
  '<span class="ux-kicker">02 · TOKEN</span><h3 id="ja-section-token">Original token identity</h3></div>'+
  '<div class="ja-fields">'+chain+
  field("canonicalAddress","Original ERC-20 contract *",{max:42,placeholder:"0x…" })+
  field("decimals","Token decimals *",{type:"number"})+coin+'</div>'+
  '<p class="ja-info">The original contract must also be listed for this chain on CoinGecko. XGRChain acts as the hub; you do not need to select destination networks.</p></section>'+
  '<section class="ja-form-section" aria-labelledby="ja-section-contact"><div class="ja-section-title">'+
  '<span class="ux-kicker">03 · CONTACT</span><h3 id="ja-section-contact">Confirm your application</h3></div>'+
  '<div class="ja-fields">'+field("contactEmail","Your email (private) *",{type:"email",max:254,placeholder:"you@project.example"})+
  relationship+'</div>'+
  '<p class="ja-private-contact">We use your email only for verification and application updates, not marketing. It stays outside public GitHub proposals. See our <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a> for storage and retention details.</p>'+
  '<label class="ja-consent"><input id="ja-confirmed" data-join="confirmed" type="checkbox"'+(d.confirmed?' checked':'')+'>'+
  '<span>I confirm the public project information is accurate to the best of my knowledge and declare my relationship to the token. Holder or community submissions are proposals, not claims of project authority. I understand that applying does not guarantee acceptance, deployment or a public listing. *</span></label></section>'+
  '<div class="ja-status" id="ja-status" role="alert" aria-live="polite">'+escape(status)+'</div>'+
  '<div class="ja-actions"><p class="ja-info">No fees or blockchain transactions. We will email you a link to confirm your application.</p>'+
  '<button type="submit" class="ux-button" data-join-action="submit"'+
  (busy?' disabled aria-busy="true"':'')+'>'+
  (busy?'Checking application…':'Submit free application →')+'</button></div></form>'+
  '<button class="ja-export" type="button" data-join-action="export">Export a local draft instead</button>'+
  '</section></div>'+dialog+'</div>';
}
// The accepted request is no longer an editable form. No additional submission is possible.
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
