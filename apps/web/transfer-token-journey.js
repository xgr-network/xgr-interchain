// Read-only, source-evidence-bound token accounting presentation.
// Names and actions come exclusively from the catalog's per-chain
// native/collateral/synthetic representations. UI stages and MetaMask prompts
// never count as completed locks, burns, mints, or unlocks.
const CHAINS={xgrchain:"XGRChain",base:"Base",arbitrum:"Arbitrum",polygon:"Polygon"};
const TYPES=new Set(["native","collateral","synthetic"]);
const LABEL={burn:"Burn",mint:"Mint",lock:"Lock",unlock:"Unlock"};
const PAST={burn:"burned",mint:"minted",lock:"locked",unlock:"unlocked"};
const SHORT={
 burn:"Wrapped tokens removed",
 lock:"Original tokens secured",
 mint:"Wrapped tokens created",
 unlock:"Original tokens released"
};
const DETAILS={
 burn:"Wrapped tokens are removed from supply on this chain.",
 lock:"Original tokens are secured by the source-chain bridge.",
 mint:"Wrapped tokens are issued on the destination chain.",
 unlock:"Original tokens are released from bridge custody."
};
const chainName=k=>CHAINS[k]||k||"Unknown chain";
const validSymbol=s=>typeof s==="string"&&/^[A-Za-z0-9._-]{1,20}$/.test(s)?s:null;
function representationFor(representations,chain){
 if(!Array.isArray(representations))return null;
 const matching=representations.filter(r=>r?.chain===chain);
 return matching.length===1&&TYPES.has(matching[0].representation)?matching[0]:null;
}
function tokenAction(chain,direction,representations,asset){
 const rep=representationFor(representations,chain);
 const symbol=rep?validSymbol(rep.symbol):null;
 if(!rep||!symbol)return {chain,name:chainName(chain),action:null,symbol:validSymbol(asset)||"token"};
 const action=direction==="out"?
  rep.representation==="synthetic"?"burn":"lock":
  rep.representation==="synthetic"?"mint":"unlock";
 return {chain,name:chainName(chain),action,symbol};
}
function observation(record,flow){
 return flow.twoHop?record?.finalProofObservation:record?.proofObservation;
}
export function describeTokenJourney({flow,record=null,representations=null}={}){
 if(!flow?.origin||!flow?.destination||!Array.isArray(flow.steps))return {steps:[],summary:"Checking verified transfer evidence.",verified:0};
 const chains=flow.twoHop?[flow.origin,"xgrchain","xgrchain",flow.destination]:
  [flow.origin,flow.destination];
 const directions=flow.twoHop?["out","in","out","in"]:["out","in"];
 // These are the proof-bound source, destination, source, destination steps
 // from the canonical six-stage (or three-stage) model, not UI progress hints.
 const evidenceSteps=flow.twoHop?[0,2,3,5]:[0,2];
 const steps=chains.map((chain,i)=>{
  const action=tokenAction(chain,directions[i],representations,flow.asset);
  const verified=flow.steps[evidenceSteps[i]]?.state==="complete"&&
   (i!==chains.length-1||flow.delivered===true);
  return {...action,
   label:action.action?LABEL[action.action]+" "+action.symbol:"Verify token delivery",
   detail:action.action?DETAILS[action.action]:"Token representation is not verified in the current catalog.",
   hint:action.action?SHORT[action.action]:"Representation unverified",
   state:verified?"complete":"pending"};
 });
 // Never display a milestone as verified unless ALL preceding chain events
 // have been independently established, regardless of optimistic UI stages.
 let verified=0;
 while(verified<steps.length&&steps[verified].state==="complete")verified++;
 for(let i=verified;i<steps.length;i++)steps[i].state=i===verified?"current":"pending";
 const observed=verified===steps.length-1&&
  observation(record,flow)?.state==="delivery-observed";
 if(observed)steps[steps.length-1].state="observed";
 let summary;
 if(verified===steps.length){
  const last=steps.at(-1);
  summary=last.action?last.symbol+" "+PAST[last.action]+" on "+last.name+
   ". Delivery verified.":"Destination delivery verified on "+last.name+".";
 }else if(observed){
  const last=steps.at(-1);
  summary=last.action?"Destination "+last.symbol+" "+PAST[last.action]+
   " on "+last.name+" observed; waiting for safe finality.":
   "Destination delivery observed; waiting for safe finality on "+last.name+".";
 }else if(verified>0){
  const last=steps[verified-1],next=steps[verified];
  summary=(last.action?last.symbol+" "+PAST[last.action]+" on "+last.name:
   "Token action confirmed on "+last.name)+
   ". "+(next.action?"Next: "+LABEL[next.action].toLowerCase()+" "+
    next.symbol+" on "+next.name+".":"Waiting for verified delivery on "+next.name+".");
 }else{
  summary="Waiting for verified "+chainName(flow.origin)+
   " source confirmation. No token movement is assumed yet.";
 }
 return {steps,summary,verified};
}
