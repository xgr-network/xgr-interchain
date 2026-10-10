const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const url=s=>/^https:\/\/[^@\s/]+/.test(s||"");
export function draft(chains){
 return {name:"",symbol:"",slug:"",shortDescription:"",description:"",website:"",canonicalChain:"",canonicalAddress:"",decimals:18,targets:[],categories:["DeFi"],tags:[],logoUrl:"",links:{},priceSource:"none",coingeckoId:"",confirmed:false};
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
  if(!d.canonicalChain||!Object.hasOwn(chains,d.canonicalChain))missing.push("Canonical chain");
  if(!["none","coingecko"].includes(d.priceSource))missing.push("Price source");
  if(d.priceSource==="coingecko"&&!/^[a-z0-9][a-z0-9-]{0,99}$/.test(d.coingeckoId||""))missing.push("CoinGecko coin ID");
  if(!/^0x[0-9a-f]{40}$/i.test(d.canonicalAddress)||/^0x0{40}$/i.test(d.canonicalAddress))missing.push("ERC-20 contract address");
  if(d.decimals===null||d.decimals===""||!Number.isInteger(Number(d.decimals))||Number(d.decimals)<0||Number(d.decimals)>36)missing.push("Decimals");
 }else if(step===2){
  if(!d.canonicalChain||!d.targets.length||d.targets.includes(d.canonicalChain)||d.targets.some(x=>!Object.hasOwn(chains,x)))missing.push("One or more other chains");
 }else if(step===3&&!d.confirmed)missing.push("Project confirmation");
 return missing;
}
export function joinMarkup(chains,d,step,status=""){
 const pick=(field,label,opts={})=>'<label class="ja-field"><span>'+label+'</span><input data-join="'+field+'" type="'+(opts.type||"text")+'" value="'+escape(d[field]??"")+'" '+(opts.required===false?"":"required")+' placeholder="'+escape(opts.placeholder||"")+'" maxlength="'+(opts.max||500)+'"></label>';
 const textarea=(field,label,rows=3)=>'<label class="ja-field"><span>'+label+'</span><textarea data-join="'+field+'" rows="'+rows+'">'+escape(d[field])+'</textarea></label>';
 const selectChain='<label class="ja-field"><span>Canonical blockchain <b>*</b></span><select data-join="canonicalChain"><option value="">Select home chain…</option>'+Object.entries(chains).map(([key,c])=>'<option value="'+escape(key)+'" '+(key===d.canonicalChain?"selected":"")+'>'+escape(c.name||key)+'</option>').join("")+'</select></label>';
 const fieldSets=[
  '<div class="ja-fields">'+pick("name","Project name",{max:80})+pick("symbol","Token symbol",{max:12})+pick("slug","Token URL",{max:60})+pick("website","Project website",{type:"url",placeholder:"https://..."})+pick("logoUrl","Logo URL (HTTPS)",{type:"url",required:false})+
  '<label class="ja-field"><span>Or upload a PNG logo (max 300 KB)</span><input id="ja-logo" type="file" accept="image/png"></label>'+textarea("shortDescription","Short description",2)+textarea("description","Project description",5)+'</div>',
  '<div class="ja-fields">'+selectChain+pick("canonicalAddress","Original ERC-20 contract *",{placeholder:"0x...",max:42})+pick("decimals","Decimals *",{type:"number",max:2})+'<label class="ja-field"><span>Price source</span><select data-join="priceSource"><option value="none" '+(d.priceSource==="none"?"selected":"")+'>Not listed / unavailable</option><option value="coingecko" '+(d.priceSource==="coingecko"?"selected":"")+'>CoinGecko</option></select></label>'+ (d.priceSource==="coingecko"?pick("coingeckoId","CoinGecko coin ID *",{placeholder:"e.g. ethereum",max:100}):'')+'<div class="ja-info">The original token address defines its identity across all represented chains. No contract is deployed during registration.</div></div>',
  '<div class="ja-network-list">'+Object.entries(chains).filter(([key])=>key!==d.canonicalChain).map(([key,c])=>
   '<label class="ja-network"><input type="checkbox" data-join-target="'+escape(key)+'" '+(d.targets.includes(key)?"checked":"")+'><span class="ja-orb"></span><span><strong>'+escape(c.name||key)+'</strong><small>'+escape(c.nativeCurrency?.symbol||"")+'</small></span><span class="ja-network-arrow">↗</span></label>').join("")+
   '</div><p class="ja-info">All paths touch XGRChain. To reach another external chain a journey requires two independent transfers via XGRChain.</p>',
  '<div class="ja-review"><h3>Ready for review</h3><p>'+escape(d.name)+' · '+escape(d.symbol)+' · '+escape(d.canonicalChain)+'</p><p>Networks: '+escape([d.canonicalChain,...d.targets].join(" → "))+'</p><label class="ja-consent"><input data-join="confirmed" type="checkbox" '+(d.confirmed?"checked":"")+'><span>I represent this project and confirm the public information is accurate. Listing is not route activation.</span></label><p class="ja-info">The server validates the JSON bundle against the public XITA manifest schema. A review PR may be created only after authorized ownership verification.</p></div>'
 ];
 const steps=["Project identity","Home chain","New worlds","Review"];
 return '<div class="ja-page"><div class="ja-hero"><div class="ux-kicker">XITA · JOIN THE ALLIANCE</div><h1>Bring your token into the <span>Universe.</span></h1><p class="ux-lead">One token. Multiple blockchains. Connected through XGRChain.</p></div>'+
 '<div class="ja-layout"><section class="ux-panel ja-wizard"><div class="ja-progress">'+steps.map((s,i)=>'<div class="ja-step '+(i===step?"is-current":i<step?"is-done":"")+'"><span>'+String(i+1).padStart(2,"0")+'</span><small>'+s+'</small></div>').join("")+'</div>'+
 '<div class="ja-form-head"><div class="ux-kicker">Step '+(step+1)+' / 4</div><h2>'+steps[step]+'</h2></div>'+
 fieldSets[step]+'<div class="ja-status" id="ja-status" role="alert">'+escape(status)+'</div><div class="ja-actions">'+
 (step>0?'<button class="ux-outline-button" data-join-action="back">← Back</button>':'<span></span>')+
 '<button class="ux-button" data-join-action="'+(step===3?"submit":"next")+'">'+(step===3?"Validate & prepare PR":"Continue →")+'</button></div>'+
 '<button class="ja-export" type="button" data-join-action="export">Export application draft</button></section>'+
 '<aside class="ux-panel ja-preview"><div class="ux-kicker">XITA · CONNECTED UNIVERSE</div><h2 data-join-preview="name">'+escape(d.name||"Your Token")+'</h2>'+
 '<div class="ja-universe-link"><div class="ja-universe-link-mark" aria-hidden="true">✧</div><div class="ja-universe-link-copy"><div class="ux-kicker">EXPLORE THE XITA UNIVERSE</div><strong>Discover connected worlds</strong><p>Explore the real 3D universe, with XGRChain as the interchain gateway.</p><a class="ja-universe-link-action" href="/universe" target="_blank" rel="noopener noreferrer">Explore the Universe ↗</a></div></div>'+
 '<div class="ja-preview-data"><div><span>Origin</span><strong>'+escape(d.canonicalChain||"Not selected")+'</strong></div><div><span>Asset</span><strong data-join-preview="symbol">'+escape(d.symbol||"—")+'</strong></div><div><span>Planned routes</span><strong>'+(d.canonicalChain?d.targets.filter(t=>t!=="xgrchain").length*2+(d.canonicalChain==="xgrchain"?0:2):0)+'</strong></div><div><span>Status</span><strong>Not deployed</strong></div></div>'+
 '<p class="ja-info">Concept preview from your entries. Routes only become active after independent on-chain verification.</p></aside></div></div>';
}
