const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const url=s=>/^https:\/\/[^@\s/]+/.test(s||"");
export function draft(chains){
 return {name:"",symbol:"",slug:"",shortDescription:"",description:"",website:"",canonicalChain:"",canonicalAddress:"",decimals:18,targets:[],categories:["DeFi"],tags:[],logoUrl:"",links:{},priceSource:"coingecko",coingeckoId:"",contactEmail:"",applicantRole:"",confirmed:false};
}
export function validateStep(d,step,chains){
 const missing=[];
 if(step===0){
  if(d.name.trim().length<2||d.name.length>80)missing.push("Project name");
  if(!/^[A-Z][A-Z0-9]{1,11}$/.test(d.symbol))missing.push("Token symbol");
  if(!/^[a-z0-9][a-z0-9-]{1,60}$/.test(d.slug))missing.push("Token URL slug");
  if(!url(d.website))missing.push("HTTPS website");
  if(d.shortDescription.trim().length<15||d.shortDescription.length>280)missing.push("Short description (15–280 characters)");
  if(d.description.trim().length<40||d.description.length>5000)missing.push("Full description (40–5000 characters)");
  if(!url(d.logoUrl)&&!d.logoPngBase64)missing.push("Logo URL or PNG");
 }else if(step===1){
  if(!d.canonicalChain||!["base","polygon","arbitrum"].includes(d.canonicalChain)||!Object.hasOwn(chains,d.canonicalChain))missing.push("Canonical chain");
  if(d.priceSource!=="coingecko"||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(d.coingeckoId||""))missing.push("CoinGecko coin ID");
  if(!/^0x[0-9a-f]{40}$/i.test(d.canonicalAddress)||/^0x0{40}$/i.test(d.canonicalAddress))missing.push("ERC-20 contract address");
  if(d.decimals===null||d.decimals===""||!Number.isInteger(Number(d.decimals))||Number(d.decimals)<0||Number(d.decimals)>36)missing.push("Decimals");
 }else if(step===2){
  if(!d.canonicalChain||!d.targets.length||d.targets.includes(d.canonicalChain)||d.targets.some(x=>!Object.hasOwn(chains,x)))missing.push("One or more other chains");
 }else if(step===3){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contactEmail||"")||String(d.contactEmail||"").length>254)missing.push("Contact email");
  if(!["founder","core-team","authorized-representative","holder","community","other"].includes(d.applicantRole))missing.push("Relationship to token");
  if(!d.confirmed)missing.push("Project confirmation");
 }
 return missing;
}
export function joinMarkup(chains,d,step,status=""){
 const pick=(field,label,opts={})=>'<label class="ja-field"><span>'+label+'</span><input data-join="'+field+'" type="'+(opts.type||"text")+'" value="'+escape(d[field]??"")+'" '+(opts.required===false?"":"required")+' placeholder="'+escape(opts.placeholder||"")+'" maxlength="'+(opts.max||500)+'"></label>';
 const textarea=(field,label,rows=3)=>'<label class="ja-field"><span>'+label+'</span><textarea data-join="'+field+'" rows="'+rows+'">'+escape(d[field])+'</textarea></label>';
 const selectChain='<label class="ja-field"><span>Canonical blockchain <b>*</b></span><select data-join="canonicalChain"><option value="">Select home chain…</option>'+Object.entries(chains).filter(([key])=>["base","polygon","arbitrum"].includes(key)).map(([key,c])=>'<option value="'+escape(key)+'" '+(key===d.canonicalChain?"selected":"")+'>'+escape(c.name||key)+'</option>').join("")+'</select></label>';
 const fieldSets=[
  '<div class="ja-fields">'+pick("name","Project name",{max:80})+pick("symbol","Token symbol",{max:12})+pick("slug","Token URL",{max:60})+pick("website","Project website",{type:"url",placeholder:"https://..."})+pick("logoUrl","Logo URL (HTTPS)",{type:"url",required:false})+
  '<label class="ja-field"><span>Or upload a PNG logo (max 300 KB)</span><input id="ja-logo" type="file" accept="image/png"></label>'+textarea("shortDescription","Short description",2)+textarea("description","Project description",5)+'</div>',
  '<div class="ja-fields">'+selectChain+pick("canonicalAddress","Original ERC-20 contract *",{placeholder:"0x...",max:42})+pick("decimals","Decimals *",{type:"number",max:2})+'<p class="ja-info">CoinGecko listing required. XITA independently verifies the original token contract against the selected blockchain.</p>'+pick("coingeckoId","CoinGecko coin ID *",{placeholder:"e.g. based-brett",max:100})+'<div class="ja-info">The original token address defines its identity across all represented chains. No contract is deployed during registration.</div></div>',
  '<div class="ja-network-list">'+Object.entries(chains).filter(([key])=>key!==d.canonicalChain).map(([key,c])=>
   '<label class="ja-network"><input type="checkbox" data-join-target="'+escape(key)+'" '+(d.targets.includes(key)?"checked":"")+'><span class="ja-orb"></span><span><strong>'+escape(c.name||key)+'</strong><small>'+escape(c.nativeCurrency?.symbol||"")+'</small></span><span class="ja-network-arrow">↗</span></label>').join("")+
   '</div><p class="ja-info">All paths touch XGRChain. To reach another external chain a journey requires two independent transfers via XGRChain.</p>',
  '<div class="ja-review"><h3>Ready for review</h3><p>'+escape(d.name)+' · '+escape(d.symbol)+' · '+escape(d.canonicalChain)+'</p><p>Networks: '+escape([d.canonicalChain,...d.targets].join(" → "))+'</p><div class="ja-fields">'+pick("contactEmail","Contact email (private) *",{type:"email",placeholder:"you@example.org",max:254})+'<label class="ja-field"><span>Your relationship to the token *</span><select data-join="applicantRole" required><option value="">Select your role…</option>'+[["founder","Founder"],["core-team","Core team"],["authorized-representative","Authorized representative"],["holder","Token holder"],["community","Community member"],["other","Other"]].map(([v,t])=>'<option value="'+v+'" '+(d.applicantRole===v?"selected":"")+'>'+t+'</option>').join("")+'</select></label></div><p class="ja-private-contact">We use the email only for application confirmation and review, deployment and listing updates; never for marketing. Unconfirmed submissions expire after 24 hours; active contacts are generally kept for up to 366 days and closed/listed contacts for 180 days after that event. The address stays outside the public PR and token manifests. Read our <a href="https://xgr.network/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p><label class="ja-consent"><input data-join="confirmed" type="checkbox" '+(d.confirmed?"checked":"")+'><span>I declare my relationship to this token and confirm its public information is accurate to the best of my knowledge. Holder or community applications are proposals, not claims of project authority. I understand this is an application for XGR review, not an immediate listing or deployment.</span></label><p class="ja-info">Application flow: submit your completed project information for XGR review. If accepted, XGR sponsors the full approved route deployment. Your token is publicly discoverable only while verified locked value meets the XITA policy threshold. Preparing or validating a draft does not submit or approve an application.</p></div>'
 ];
 const steps=["Project identity","Home chain","New worlds","Review"];
 return '<div class="ja-page"><div class="ja-hero"><div class="ux-kicker">XITA · JOIN THE ALLIANCE</div><h1>Bring your token into the <span>Universe.</span></h1><p class="ux-lead">Apply with a CoinGecko-listed ERC-20 token to the XGR Interchain Token Alliance. After a positive project review, XGR funds the approved route deployment. Public discovery begins only when verified net locked value meets the XITA policy threshold.</p></div>'+
 '<div class="ja-application-journey" aria-label="XITA partner onboarding">'+
 '<span><b>01</b> Apply</span><span><b>02</b> XGR review</span><span><b>03</b> XGR-funded deployment</span><span><b>04</b> Verified token locking</span><span><b>05</b> Public XITA listing</span></div>'+
 '<div class="ja-layout"><section class="ux-panel ja-wizard"><div class="ja-progress">'+steps.map((s,i)=>'<div class="ja-step '+(i===step?"is-current":i<step?"is-done":"")+'"><span>'+String(i+1).padStart(2,"0")+'</span><small>'+s+'</small></div>').join("")+'</div>'+
 '<div class="ja-form-head"><div class="ux-kicker">Step '+(step+1)+' / 4</div><h2>'+steps[step]+'</h2></div>'+
 fieldSets[step]+'<div class="ja-status" id="ja-status" role="alert">'+escape(status)+'</div><div class="ja-actions">'+
 (step>0?'<button class="ux-outline-button" data-join-action="back">← Back</button>':'<span></span>')+
 '<button class="ux-button" data-join-action="'+(step===3?"submit":"next")+'">'+(step===3?"Verify & submit application":"Continue →")+'</button></div>'+
 '<button class="ja-export" type="button" data-join-action="export">Export application draft</button></section>'+
 '<aside class="ux-panel ja-preview"><div class="ux-kicker">XITA · CONNECTED UNIVERSE</div><h2 data-join-preview="name">'+escape(d.name||"Your Token")+'</h2>'+
 '<div class="ja-universe-link"><div class="ja-universe-link-mark" aria-hidden="true">✧</div><div class="ja-universe-link-copy"><div class="ux-kicker">EXPLORE THE XITA UNIVERSE</div><strong>Discover connected worlds</strong><p>Explore the real 3D universe, with XGRChain as the interchain gateway.</p><a class="ja-universe-link-action" href="/universe" target="_blank" rel="noopener noreferrer">Explore the Universe ↗</a></div></div>'+
 '<div class="ja-preview-data"><div><span>Origin</span><strong>'+escape(d.canonicalChain||"Not selected")+'</strong></div><div><span>Asset</span><strong data-join-preview="symbol">'+escape(d.symbol||"—")+'</strong></div><div><span>Planned routes</span><strong>'+(d.canonicalChain?d.targets.filter(t=>t!=="xgrchain").length*2+(d.canonicalChain==="xgrchain"?0:2):0)+'</strong></div><div><span>Status</span><strong>Not deployed</strong></div></div>'+
 '<p class="ja-info">Application preview only. No route has been approved or deployed. XGR sponsors deployment only after a positive review; public discovery requires verified net locked value above the policy threshold.</p></aside></div></div>';
}
