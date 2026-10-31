// Static, read-only creator form. Contract deployment and optional starter-gas
// require independent receipt-verified release gates; never imply availability
// from a local ABI or an unverified address.
const ESCAPE={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const clean=s=>String(s??"").replace(/[&<>"']/g,ch=>ESCAPE[ch]);
const SYMBOL=/^[A-Z][A-Z0-9]{1,10}$/;
const NAME=/^[\p{L}\p{N}][\p{L}\p{N} ._()'-]{1,79}$/u;
const SUPPLY=/^(?:0|[1-9][0-9]{0,18})$/;
export const CREATOR_STATUS=Object.freeze({
 chainId:1643,
 factory:null,
 verifiedReceipt:null,
 available:false,
 starterGasAvailable:false
});
export function creatorDraft(){return {name:"",symbol:"",initialSupply:"1000000",
 shortDescription:"",description:"",website:"",category:"DeFi",contactEmail:"",
 applicantRole:"founder",links:{x:"",telegram:"",discord:"",github:"",docs:""},
 logoPngBase64:"",logoName:"",accepted:false,projectConfirmed:false};}
export function validateCreatorApplication(d){
 const errors=validateCreatorDraft(d);
 if(typeof d.shortDescription!=="string"||d.shortDescription.trim().length<15||
   d.shortDescription.trim().length>280)errors.push("Short description must contain 15–280 characters");
 if(typeof d.description!=="string"||d.description.trim().length<40||
   d.description.trim().length>5000)errors.push("Project description must contain 40–5000 characters");
 const validUrl=s=>{try{const u=new URL(s);return u.protocol==="https:"&&
  !u.username&&!u.password&&u.hostname.includes(".")&&!u.hostname.endsWith(".local")&&
  !u.hostname.endsWith(".internal")&&!/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(u.hostname)}catch{return false}};
 if(!validUrl(d.website))errors.push("Project website must use HTTPS");
 for(const link of ["x","telegram","discord","github","docs"])
  if(d.links?.[link]&&!validUrl(d.links[link]))
   errors.push("Invalid HTTPS "+link+" link");
 if(!["DeFi","Gaming","Infrastructure","Payments","Community","Other"].includes(d.category))
  errors.push("Select a valid project category");
 if(!/^[^\\s@<>]{1,64}@[^\\s@<>]{1,189}\\.[^\\s@<>]{2,}$/.test(d.contactEmail||""))
  errors.push("Valid private contact email required");
 if(!["founder","core-team","authorized-representative"].includes(d.applicantRole))
  errors.push("Select your project relationship");
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(d.logoPngBase64||"")||
  (d.logoPngBase64||"").length>175000)errors.push("Upload a PNG logo (max 128 KB)");
 if(d.projectConfirmed!==true)errors.push("Confirm your project application");
 return errors;
}
export function creatorRegistrationPayload(d){
 const problems=validateCreatorApplication(d);
 if(problems.length)throw Error(problems.join(". "));
 return {name:d.name.trim(),symbol:d.symbol.trim(),initialSupply:d.initialSupply.trim(),
  shortDescription:d.shortDescription.trim(),description:d.description.trim(),
  website:d.website.trim(),categories:[d.category],tags:[],contactEmail:d.contactEmail.trim(),
  applicantRole:d.applicantRole,links:d.links,logoPngBase64:d.logoPngBase64,confirmed:true};
}
export function validateCreatorDraft(d){
 const errors=[];
 if(!NAME.test(String(d?.name||"").trim()))errors.push("Token name must have 2–80 permitted characters");
 if(!SYMBOL.test(String(d?.symbol||"").trim()))errors.push("Token symbol must use 2–11 uppercase letters or digits, starting with a letter");
 const supply=String(d?.initialSupply||"").trim();
 if(!SUPPLY.test(supply)||BigInt(SUPPLY.test(supply)?supply:"0")<1n||
    BigInt(SUPPLY.test(supply)?supply:"0")>10n**18n)
  errors.push("Initial supply must be a positive whole number of at most 1 quintillion tokens");
 if(d?.accepted!==true)errors.push("Please confirm that you understand the token parameters are permanent");
 return errors;
}
export function creatorPreview(d){
 const err=validateCreatorDraft({...d,accepted:true});
 if(err.length)return {ready:false,errors:err};
 const baseUnits=BigInt(String(d.initialSupply).trim())*10n**18n;
 if(baseUnits>10n**36n)return {ready:false,errors:["Supply exceeds contract maximum"]};
 return {ready:true,name:String(d.name).trim(),symbol:String(d.symbol).trim(),
  amount:String(d.initialSupply).trim(),decimals:18,
  initialSupplyBaseUnits:baseUnits.toString(),chain:"XGRChain",
  recipient:"Creator's connected wallet",fixedSupply:true};
}
export function tokenCreatorMarkup(d=creatorDraft(),status=CREATOR_STATUS){
 const p=creatorPreview(d);
 const canCreate=status?.available===true&&
  /^0x[0-9a-f]{40}$/i.test(status?.factory||"")&&
  /^0x[0-9a-f]{64}$/i.test(status?.verifiedReceipt||"");
 const field=(id,label,value,placeholder,type="text")=>'<label class="ja-field" for="tc-'+id+
  '"><span>'+label+'</span><input id="tc-'+id+'" data-creator="'+id+
  '" type="'+type+'" autocomplete="off" value="'+clean(value||"")+
  '" placeholder="'+clean(placeholder)+'" maxlength="512"></label>';
 const area=(id,label,value,placeholder,limit)=>'<label class="ja-field ja-field-full" for="tc-'+id+
  '"><span>'+label+'</span><textarea id="tc-'+id+'" data-creator="'+id+
  '" maxlength="'+limit+'" rows="'+(id==="description"?5:2)+'" placeholder="'+
  clean(placeholder)+'">'+clean(value||"")+'</textarea></label>';
 const choices=(id,label,arr,selected)=>'<label class="ja-field" for="tc-'+id+'"><span>'+
  label+'</span><select id="tc-'+id+'" data-creator="'+id+'">'+arr.map(([v,name])=>
  '<option value="'+clean(v)+'"'+(selected===v?' selected':'')+'>'+clean(name)+'</option>').join("")+
  '</select></label>';
 return '<div class="ux-app ux-join ux-token-creator"><div class="ux-kicker">XITA · TOKEN LAUNCHPAD</div>'+
  '<h1>Create once. <span>Launch everywhere.</span></h1>'+
  '<p class="ux-lead">Create your token on XGRChain and prepare its sponsored Interchain launch. Token creation and network deployment are separate verified stages.</p>'+
  '<form id="xita-token-creator-form" novalidate>'+
  '<section class="ux-panel"><div class="ux-kicker">01 · TOKEN PARAMETERS</div>'+
  '<h2>Original token identity</h2><div class="ja-fields">'+
  field("name","Token name *",d.name,"Example Token")+
  field("symbol","Token symbol *",d.symbol,"EXM")+
  field("initialSupply","Fixed initial supply *",d.initialSupply,"1000000")+
  '<div class="ja-field"><span>Original network</span><strong>XGRChain · Chain ID 1643</strong>'+
  '<small>18 decimals · total supply minted once to your wallet</small></div></div>'+
  '<label class="ja-consent"><input type="checkbox" data-creator="accepted"'+
  (d.accepted?' checked':'')+'><span>I understand the initial token supply and parameters are permanent.</span></label></section>'+
  '<section class="ux-panel"><div class="ux-kicker">02 · PROJECT & BRANDING</div>'+
  '<h2>Present your project</h2><div class="ja-fields">'+
  area("shortDescription","Short description *",d.shortDescription,"What does your token do?",280)+
  area("description","Project description *",d.description,"Describe your project, purpose and ecosystem.",5000)+
  field("website","Project website *",d.website,"https://example.org","url")+
  choices("category","Project category *",[["DeFi","DeFi"],["Gaming","Gaming"],
    ["Infrastructure","Infrastructure"],["Payments","Payments"],
    ["Community","Community"],["Other","Other"]],d.category)+
  '<label class="ja-field ja-field-full" for="tc-logo"><span>Token logo * · PNG, max 128 KB, up to 512 × 512 px</span>'+
  '<input id="tc-logo" data-creator-logo type="file" accept="image/png" required>'+
  '<small>After email verification, XITA hosts your logo and provides a permanent logo URL.</small>'+
  '<span id="tc-logo-file">'+clean(d.logoName||"No logo selected")+'</span>'+
  '<img id="tc-logo-preview" alt="Token logo preview" hidden></label></div>'+
  '<h3>Project links</h3><div class="ja-fields">'+
  field("link-x","X (optional)",d.links?.x,"https://x.com/project","url")+
  field("link-telegram","Telegram (optional)",d.links?.telegram,"https://t.me/project","url")+
  field("link-discord","Discord (optional)",d.links?.discord,"https://discord.gg/project","url")+
  field("link-github","GitHub (optional)",d.links?.github,"https://github.com/project","url")+
  field("link-docs","Documentation (optional)",d.links?.docs,"https://docs.example.org","url")+
  '</div></section>'+
  '<section class="ux-panel"><div class="ux-kicker">03 · VERIFY YOUR PROJECT</div>'+
  '<h2>Contact and email confirmation</h2><div class="ja-fields">'+
  field("contactEmail","Contact email (private) *",d.contactEmail,"you@project.org","email")+
  choices("applicantRole","Your relationship *",[
   ["founder","Founder"],["core-team","Core team"],["authorized-representative","Authorized representative"]],d.applicantRole)+
  '</div><p class="ux-small">Your email is used only for verification and application updates. It will not appear in GitHub.</p>'+
  '<label class="ja-consent"><input type="checkbox" data-creator="projectConfirmed"'+
  (d.projectConfirmed?' checked':'')+'><span>I am authorized to submit this token and confirm the project information is accurate.</span></label>'+
  '<button class="ux-button" id="xita-creator-register" type="submit">Verify email and prepare launch</button>'+
  '<p class="ux-small" role="status" id="tc-registration-status">Email verification is required before sponsored starter gas or Interchain deployment.</p>'+
  '</section></form>'+
  '<section class="ux-panel"><div class="ux-kicker">04 · TOKEN & INTERCHAIN LAUNCH</div>'+
  '<h2>Your launch preview</h2>'+
  '<div class="pair"><span>Token name</span><strong data-creator-preview="name">'+clean(p.ready?p.name:"—")+'</strong></div>'+
  '<div class="pair"><span>Symbol</span><strong data-creator-preview="symbol">'+clean(p.ready?p.symbol:"—")+'</strong></div>'+
  '<div class="pair"><span>Initial supply</span><strong data-creator-preview="amount">'+clean(p.ready?p.amount:"—")+'</strong></div>'+
  '<div class="pair"><span>Network</span><strong>XGRChain, with future eligible Interchain routes</strong></div>'+
  '<p class="ux-small">After email confirmation you receive an XITA-hosted logo URL. Factory deployment, sponsored gas and Join enrollment will be enabled after independent verification.</p>'+
  '<button class="ux-button" id="xita-creator-deploy" type="button"'+
  (!canCreate?' disabled':'')+'>'+(canCreate?'Create token in MetaMask':'Token creation not yet activated')+'</button>'+
  '<p class="ux-small" id="tc-status" role="status">'+
  (canCreate?'Factory deployment available after verification.':'The token factory is not yet deployed and receipt-verified on XGRChain. No transaction will be requested.')+
  '</p></section></div>';
}
export function creatorConfirmMarkup(state){
 if(state?.phase==="email-verified")return '<div class="ux-app ux-join ux-token-creator">'+
  '<h1>Email verified</h1><section class="ux-panel"><h2>Your XITA logo URL</h2>'+
  '<p>Your project registration is verified. Your token has not yet been created.</p>'+
  '<p><a href="'+clean(state.logoUrl)+'" target="_blank" rel="noopener noreferrer">'+clean(state.logoUrl)+'</a></p>'+
  '<img class="tc-confirmed-logo" src="'+clean(state.logoUrl)+'" alt="Verified token logo"></section></div>';
 return '<div class="ux-app ux-join ux-token-creator"><h1>Confirm your email</h1>'+
  '<section class="ux-panel"><p id="tc-confirm-message">'+clean(state?.error||"Verifying your confirmation link…")+'</p></section></div>';
}
