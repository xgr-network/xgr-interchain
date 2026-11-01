// Static, read-only creator form. Contract deployment and optional starter-gas
// require independent receipt-verified release gates; never imply availability
// from a local ABI or an unverified address.
import {creatorSettings} from "./creator-token-config.js";
const ESCAPE={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const clean=s=>String(s??"").replace(/[&<>"']/g,ch=>ESCAPE[ch]);
const SYMBOL=/^[A-Z][A-Z0-9]{1,10}$/;
const NAME=/^[\p{L}\p{N}][\p{L}\p{N} ._()'-]{1,79}$/u;
const SUPPLY=/^(?:0|[1-9][0-9]{0,18})$/;
const OWNER=/^0x[0-9a-f]{40}$/i;
export const CREATOR_STATUS=Object.freeze({
 chainId:1643,
 factory:null,
 verifiedReceipt:null,
 available:false,
 starterGasAvailable:false
});
export function creatorDraft(){return {name:"",symbol:"",initialSupply:"1000000",ownerAddress:"",tokenType:"burnable",decimals:"18",maxSupply:"10000000",minterAddress:"",permit:false,advancedOpen:false,
 shortDescription:"",description:"",website:"",category:"DeFi",contactEmail:"",
 applicantRole:"founder",links:{x:"",telegram:"",discord:"",github:"",docs:""},
 logoPngBase64:"",logoName:""};}
export function validateCreatorApplication(d){
 const errors=validateCreatorDraft(d);
 if(typeof d.shortDescription!=="string"||d.shortDescription.trim().length<15||
   d.shortDescription.trim().length>280)errors.push("Short description must contain 15–280 characters");
 if(typeof d.description!=="string"||d.description.trim().length<40||
   d.description.trim().length>5000)errors.push("Project description must contain 40–5000 characters");
 const validUrl=s=>{try{const u=new URL(s);return u.protocol==="https:"&&
  !u.username&&!u.password&&u.hostname.includes(".")&&!u.hostname.endsWith(".local")&&
  !u.hostname.endsWith(".internal")&&!/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)}catch{return false}};
 if(!validUrl(d.website))errors.push("Project website must use HTTPS");
 for(const link of ["x","telegram","discord","github","docs"])
  if(d.links?.[link]&&!validUrl(d.links[link]))
   errors.push("Invalid HTTPS "+link+" link");
 if(!["DeFi","Gaming","Infrastructure","Payments","Community","Other"].includes(d.category))
  errors.push("Select a valid project category");
 if(!/^[^\s@<>]{1,64}@[^\s@<>]{1,189}\.[^\s@<>]{2,}$/.test(d.contactEmail||""))
  errors.push("Valid private contact email required");
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(d.logoPngBase64||"")||
  (d.logoPngBase64||"").length>175000)errors.push("Upload a PNG logo (max 128 KB)");
 return errors;
}
export function creatorRegistrationPayload(d){
 const problems=validateCreatorApplication(d);
 if(problems.length)throw Error(problems.join(". "));
 return {name:d.name.trim(),symbol:d.symbol.trim(),initialSupply:d.initialSupply.trim(),ownerAddress:d.ownerAddress.trim(),tokenType:d.tokenType,decimals:Number(d.decimals),
  maxSupply:d.tokenType==="mintable"?String(d.maxSupply).trim():String(d.initialSupply).trim(),
  minterAddress:d.tokenType==="mintable"?String(d.minterAddress||d.ownerAddress).trim():null,
  permit:d.permit===true,
  shortDescription:d.shortDescription.trim(),description:d.description.trim(),
  website:d.website.trim(),categories:[d.category],tags:[],contactEmail:d.contactEmail.trim(),
  links:d.links,logoPngBase64:d.logoPngBase64};
}
export function validateCreatorDraft(d){
 const errors=[];
 if(!NAME.test(String(d?.name||"").trim()))errors.push("Token name must have 2–80 permitted characters");
 if(!SYMBOL.test(String(d?.symbol||"").trim()))errors.push("Token symbol must use 2–11 uppercase letters or digits, starting with a letter");
 const owner=String(d?.ownerAddress||"").trim();
 if(!OWNER.test(owner)||/^0x0{40}$/i.test(owner))errors.push("A valid project owner wallet address is required");
 try{creatorSettings(d)}catch(error){errors.push(String(error.message||error))}
 return errors;
}
export function creatorPreview(d){
 const err=validateCreatorDraft(d);
 if(err.length)return {ready:false,errors:err};
 const config=creatorSettings(d);
 return {ready:true,name:String(d.name).trim(),symbol:String(d.symbol).trim(),
  amount:config.initialSupply,decimals:config.decimals,
  initialSupplyBaseUnits:config.initialSupplyBaseUnits,chain:"XGRChain",
  recipient:config.ownerAddress,owner:config.ownerAddress,fixedSupply:!config.mintable,
  tokenType:config.tokenType,permit:config.permit,maxSupply:config.maxSupply,
  minterAddress:config.minterAddress};
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
  field("initialSupply","Initial supply *",d.initialSupply,"1000000")+
  field("ownerAddress","Project owner wallet address *",d.ownerAddress,"0x...")+
  '<div class="ja-field ja-field-full"><strong>'+(d.tokenType==="burnable"&&String(d.decimals)==="18"&&!d.permit?'Standard settings: Fixed Supply + Burnable · 18 decimals':'Selected settings: '+clean(d.tokenType)+' · '+clean(d.decimals)+' decimals')+'</strong>'+
   '<small>No additional minting, no transfer fees, no pause, no blacklist. XGR covers deployment gas.</small></div></div>'+
  '<details class="tc-advanced" id="tc-advanced"'+(d.advancedOpen?' open':'')+'>'+
   '<summary data-creator-advanced>Advanced Settings <span>Token features &amp; permissions</span></summary>'+
   '<div class="ja-fields">'+
   choices("tokenType","Token capabilities",[
    ["fixed","Fixed Supply (no burn)"],["burnable","Fixed Supply + Burnable"],
    ["mintable","Controlled Mint + Burn"]],d.tokenType)+
   choices("decimals","Decimals",[["6","6"],["8","8"],["18","18"]],String(d.decimals))+
   (d.tokenType==="mintable"?
    field("maxSupply","Lifetime maximum supply *",d.maxSupply,"10000000")+
    field("minterAddress","Minter wallet (defaults to owner)",d.minterAddress,"0x..."): "")+
   '<label class="ja-consent ja-field-full"><input type="checkbox" data-creator="permit"'+
    (d.permit?' checked':'')+'><span>Enable EIP-2612 Permit signatures</span></label>'+
   '</div><p class="ux-small">Minting is only permitted for the selected project minter. Burning never restores the lifetime cap.</p>'+
  '</details><div class="ja-fields">'+
  '<div class="ja-field"><span>Original network</span><strong>XGRChain · Chain ID 1643</strong>'+
  '<small>Project owner receives full initial supply and owner() role; XGR pays deployment gas, never receives token rights</small></div></div>'+
  '<p class="ux-small">Token type, decimals and supply caps are permanent after deployment. The nominated wallet receives the initial supply and controls ownership.</p></section>'+
  '<section class="ux-panel"><div class="ux-kicker">02 · PROJECT & BRANDING</div>'+
  '<h2>Present your project</h2><div class="ja-fields">'+
  area("shortDescription","Short description *",d.shortDescription,"What does your token do?",280)+
  area("description","Project description *",d.description,"Describe your project, purpose and ecosystem.",5000)+
  field("website","Project website *",d.website,"https://example.org","url")+
  choices("category","Project category *",[["DeFi","DeFi"],["Gaming","Gaming"],
    ["Infrastructure","Infrastructure"],["Payments","Payments"],
    ["Community","Community"],["Other","Other"]],d.category)+
  '<label class="ja-field ja-field-full" for="tc-logo"><span>Token logo * · PNG, up to 4 MB (automatically optimized)</span>'+
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
  '</div><p class="ux-small">We will email you a confirmation link. Your address stays private and will not appear in GitHub.</p>'+
  '<button class="ux-button" id="xita-creator-register" type="submit">Verify email and prepare launch</button>'+
  '<p class="ux-small tc-registration-feedback" role="alert" id="tc-registration-status" tabindex="-1" hidden></p>'+
  '</section></form>'+
  '<section class="ux-panel"><div class="ux-kicker">04 · TOKEN & INTERCHAIN LAUNCH</div>'+
  '<h2>Your launch preview</h2>'+
  '<div class="pair"><span>Token name</span><strong data-creator-preview="name">'+clean(p.ready?p.name:"—")+'</strong></div>'+
  '<div class="pair"><span>Symbol</span><strong data-creator-preview="symbol">'+clean(p.ready?p.symbol:"—")+'</strong></div>'+
  '<div class="pair"><span>Initial supply</span><strong data-creator-preview="amount">'+clean(p.ready?p.amount:"—")+'</strong></div>'+
  '<div class="pair"><span>Project owner</span><strong data-creator-preview="owner">'+clean(p.ready?p.owner:"—")+'</strong></div>'+
  '<div class="pair"><span>Token type</span><strong data-creator-preview="tokenType">'+clean(p.ready?p.tokenType:"—")+'</strong></div>'+
  '<div class="pair"><span>Decimals</span><strong data-creator-preview="decimals">'+clean(p.ready?p.decimals:"—")+'</strong></div>'+
  '<div class="pair"><span>Lifetime supply cap</span><strong data-creator-preview="maxSupply">'+clean(p.ready?p.maxSupply:"—")+'</strong></div>'+
  '<div class="pair"><span>Permit</span><strong data-creator-preview="permit">'+(p.ready?(p.permit?"Enabled":"Disabled"):"—")+'</strong></div>'+
  '<div class="pair"><span>Network</span><strong>XGRChain, with future eligible Interchain routes</strong></div>'+
  '<p class="ux-small">After email confirmation your XGR-funded deployment is queued. Once the reviewed Creator service is activated, XGR deploys the token directly to the nominated project owner. The verified ERC-20 is then proposed to XITA by a standard Join Draft PR.</p>'+
  '<p class="ux-small" id="tc-status" role="status">'+
  'There is no wallet deployment transaction. XGR creates the ERC-20 after verified email and audited factory activation.'+

  '</p></section></div>';
}
export function creatorSubmittedMarkup(state){
 const email=clean(state?.email||"");
 return '<div class="ux-app ux-join ux-token-creator tc-submitted-page">'+
  '<div class="ux-kicker">XITA · TOKEN LAUNCHPAD</div>'+
  '<section class="ux-panel tc-submitted-receipt" role="status">'+
  '<div class="tc-receipt-icon" aria-hidden="true">✓</div>'+
  '<h1>Check your email.</h1>'+
  '<p class="ux-lead">We sent a confirmation link'+(email?' to <strong>'+email+'</strong>':'')+'.</p>'+
  '<p>Open the email and confirm your address to start token creation. No token has been deployed yet.</p>'+
  '<p class="ux-small">Please also check your spam folder. Your link expires after 24 hours.</p>'+
  '<a class="ux-ns-secondary" data-nav href="/join">Back to XITA Join</a>'+
  '</section></div>';
}
export function creatorConfirmMarkup(state){
 if(state?.phase==="email-verified")return '<div class="ux-app ux-join ux-token-creator">'+
  '<h1>Email verified</h1><section class="ux-panel"><h2>Your XITA logo URL</h2>'+
  '<p>Your email is verified. Your XGR-funded token creation has been queued; contract deployment and the subsequent XITA Join Draft PR require the reviewed production service.</p>'+
  '<p><a href="'+clean(state.logoUrl)+'" target="_blank" rel="noopener noreferrer">'+clean(state.logoUrl)+'</a></p>'+
  '<img class="tc-confirmed-logo" src="'+clean(state.logoUrl)+'" alt="Verified token logo"></section></div>';
 return '<div class="ux-app ux-join ux-token-creator"><h1>Confirm your email</h1>'+
  '<section class="ux-panel"><p id="tc-confirm-message">'+clean(state?.error||"Verifying your confirmation link…")+'</p></section></div>';
}
