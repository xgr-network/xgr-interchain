// Admin status response shape: GET /admin/api/chain-deploy/status
// -> {intents:{version:1,entries:{"base:executionGateway":{id,stage,...}}}}.
// A chain-specific prior wallet transaction must never be confused with a
// different chain or a different deployment component.
const STAGES=new Set(["prepared","submitted","confirmed"]);
export function chainDeploymentIntent(status,chainName,component){
 const id=chainName+":"+component;
 const item=status?.intents?.entries?.[id];
 return item?.id===id&&STAGES.has(item.stage)?item:null;
}
export function hasOutstandingWalletTransaction(intent){
 return intent?.stage==="submitted"||intent?.stage==="confirmed";
}
