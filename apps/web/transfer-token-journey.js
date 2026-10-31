// Read-only, source-evidence-bound token accounting presentation.
// Names and actions come exclusively from the catalog's per-chain
// native/collateral/synthetic representations. UI stages and MetaMask prompts
// never count as completed locks, burns, mints, or unlocks.
const CHAINS={xgrchain:"XGRChain",base:"Base",arbitrum:"Arbitrum",optimism:"Optimism",bsc:"BNB Smart Chain",polygon:"Polygon"};
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
// Every source and destination action has its own chain-finality barrier.
// L2: native safe head, XGRChain: committed IBFT. Neither a MetaMask prompt,
// an unfinalized receipt nor latest-head "delivery-observed" completes a step.
export function tokenFinalityName(chain){
 return chain==="bsc"?"finalized finality":
  ["base","arbitrum","optimism"].includes(chain)?"safe finality":
  chain==="xgrchain"?"IBFT finality":"network finality";
}
function deliveryObserved(record,flow,index){
 if(flow.twoHop){
  if(index===1)return record?.status==="awaiting-proof"&&
   record?.proofObservation?.state==="delivery-observed";
  if(index===3)return record?.status==="awaiting-final-proof"&&
   record?.finalProofObservation?.state==="delivery-observed";
 }else if(index===1)return record?.status==="awaiting-proof"&&
  record?.proofObservation?.state==="delivery-observed";
 return false;
}
export function describeTokenJourney({flow,record=null,representations=null,
 stage="",working=false}={}){
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
   label:action.action?LABEL[action.action]+" "+action.symbol:
    (directions[i]==="out"?"Sending ":"Receiving ")+(validSymbol(flow.asset)||"tokens"),
   detail:action.action?DETAILS[action.action]:"Waiting for verified on-chain token operation.",
   hint:action.action?SHORT[action.action]:"Token operation being verified",
   state:verified?"complete":"pending"};
 });
 // Never display a milestone as verified unless ALL preceding chain events
 // have been independently established, regardless of optimistic UI stages.
 let verified=0;
 while(verified<steps.length&&steps[verified].state==="complete")verified++;
 for(let i=verified;i<steps.length;i++)steps[i].state=i===verified?"current":"pending";
 const observed=verified<steps.length&&deliveryObserved(record,flow,verified);
 if(observed)steps[verified].state="observed";
 const next=steps[verified];
 let summary;
 if(verified===steps.length){
  const last=steps.at(-1);
  summary=last.action?last.symbol+" "+PAST[last.action]+" on "+last.name+
   ". Delivery verified.":"Destination delivery verified on "+last.name+".";
 }else if(observed){
  summary=next.action?next.symbol+" "+PAST[next.action]+
   " on "+next.name+" observed; waiting for "+next.name+" "+
   tokenFinalityName(next.chain)+".":"Delivery observed; waiting for "+
   next.name+" "+tokenFinalityName(next.chain)+".";
 }else if(verified===0){
  const status=record?.status||"";
  if(["confirming","confirming-native-finality","finality-unavailable"].includes(status))
   summary="Waiting for "+chainName(flow.origin)+" "+tokenFinalityName(flow.origin)+
    " before confirming the source transaction.";
  else if(["pending-source","source-failed"].includes(status)||stage==="source-pending")
   summary=status==="source-failed"?
    "The source transaction failed; no token movement is confirmed.":
    "Waiting for "+chainName(flow.origin)+
     " transaction confirmation. No token movement is assumed yet.";
  else summary="Waiting for verified "+chainName(flow.origin)+
   " source confirmation. No token movement is assumed yet.";
 }else if(working&&[
  "first-delivery-pending","onward-source-pending","final-delivery-pending"
 ].includes(stage)){
  summary="Waiting for "+next.name+" "+tokenFinalityName(next.chain)+
   " before confirming "+next.label+".";
 }else{
  const last=steps[verified-1];
  summary=(last.action?last.symbol+" "+PAST[last.action]+" on "+last.name:
   "Token action confirmed on "+last.name)+
   ". "+(next.action?"Next: "+LABEL[next.action].toLowerCase()+" "+
    next.symbol+" on "+next.name+".":"Waiting for verified delivery on "+next.name+".");
 }
 return {steps,summary,verified};
}
