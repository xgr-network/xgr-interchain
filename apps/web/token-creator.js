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
export function creatorDraft(){return {name:"",symbol:"",initialSupply:"1000000",accepted:false};}
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
 const field=(id,label,value,placeholder)=>'<label class="ja-field" for="tc-'+id+
  '"><span>'+label+'</span><input id="tc-'+id+'" data-creator="'+id+
  '" autocomplete="off" value="'+clean(value)+'" placeholder="'+placeholder+
  '" required maxlength="80"></label>';
 return '<div class="ux-app ux-join ux-token-creator"><div class="ux-kicker">XITA · TOKEN CREATOR</div>'+
  '<h1>Create your <span>token</span></h1>'+
  '<p class="ux-lead">Create a standard ERC-20 on XGRChain, owned by your own wallet. No creation service fee, no administrative minting or upgrade permissions.</p>'+
  '<section class="ux-panel"><div class="ux-kicker">01 · TOKEN PARAMETERS</div>'+
  '<h2>Original token identity</h2><form id="xita-token-creator-form" novalidate>'+
  '<div class="ja-fields">'+field("name","Token name",d.name,"e.g. Example Token")+
  field("symbol","Token symbol",d.symbol,"e.g. EXM")+
  field("initialSupply","Fixed initial supply",d.initialSupply,"e.g. 1000000")+
  '<div class="ja-field"><span>Original network</span><strong>XGRChain · Chain ID 1643</strong>'+
  '<small>18 decimals · entire supply is minted once to your wallet</small></div></div>'+
  '<label class="ja-checkbox"><input type="checkbox" data-creator="accepted"'+
  (d.accepted?' checked':'')+'><span>I understand the total supply and token parameters cannot be changed after deployment.</span></label>'+
  '<p class="ux-small">Each wallet transaction must be signed in MetaMask. Starter gas, if enabled later, will be an optional limited grant—not an XGR payment requirement.</p>'+
  '<button class="ux-button" id="xita-creator-deploy" type="submit"'+
  (!canCreate||!p.ready||!d.accepted?' disabled':'')+'>'+
  (canCreate?'Create token in MetaMask':'Token creation not yet activated')+'</button>'+
  '<p class="ux-small" id="tc-status" role="status">'+
  (canCreate?'Factory deployment available after verification.':'The token factory is not yet deployed and receipt-verified on XGRChain. No transaction will be requested.')+
  '</p></form></section>'+
  '<section class="ux-panel"><div class="ux-kicker">02 · PREVIEW</div>'+
  '<h2>What will be created</h2>'+
  '<div class="pair"><span>Name</span><strong data-creator-preview="name">'+clean(p.ready?p.name:"—")+'</strong></div>'+
  '<div class="pair"><span>Symbol</span><strong data-creator-preview="symbol">'+clean(p.ready?p.symbol:"—")+'</strong></div>'+
  '<div class="pair"><span>Total supply</span><strong data-creator-preview="amount">'+clean(p.ready?p.amount:"—")+'</strong></div>'+
  '<div class="pair"><span>Ownership</span><strong>Your wallet; no factory custody</strong></div>'+
  '<p class="ux-small">Creating a token does not automatically deploy Interchain routes or list it on CoinGecko. The existing Join process currently requires a CoinGecko-verified original contract on an eligible external chain; XGR-origin enrollment is a separate future workflow.</p></section></div>';
}
