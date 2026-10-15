// A wallet-bound transfer journal holds ONLY transaction hashes and intent.
// Its status is never trusted: on-chain receipts and Mailbox.delivered() decide
// which step may run. No automatic MetaMask signatures or rebroadcast on reload.
import {deployedRoutes} from "./route-availability.js";
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const AMOUNT=/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
export const JOURNEY_VERSION=1;
export const WALLET_JOURNAL_PREFIX="xita-v315-transfer:";
export const sourceOrDestination=(index)=>index%2===0?"source":"destination";
export function journalKey(account){
 if(!ADDRESS.test(account||""))throw Error("Connect a valid wallet");
 return WALLET_JOURNAL_PREFIX+account.toLowerCase();
}
export function buildTransferPath(origin,destination){
 if(!origin||!destination||origin===destination)throw Error("Choose two distinct supported chains");
 return origin==="xgrchain"||destination==="xgrchain"?
  [origin,destination]:[origin,"xgrchain",destination];
}
export function parseTokenAmount(raw,decimals){
 if(typeof raw!=="string"||!AMOUNT.test(raw)||raw.length>88||
  !Number.isSafeInteger(decimals)||decimals<0||decimals>36)
  throw Error("Enter a valid positive token amount");
 const [whole,frac=""]=raw.split(".");
 if(frac.length>decimals)throw Error("Too many token decimal places");
 const result=BigInt(whole)*10n**BigInt(decimals)+
  BigInt((frac.padEnd(decimals,"0"))||"0");
 if(result<=0n||result>=2n**256n)throw Error("Token amount is outside transferable range");
 return result;
}
export function createJourney({catalog,account,asset,origin,destination,amount,recipient=account}){
 if(!ADDRESS.test(account||"")||!ADDRESS.test(recipient||""))
  throw Error("Connect a valid EVM wallet and recipient");
 const decimals=catalog?.assets?.[asset]?.metadata?.decimals;
 parseTokenAmount(amount,decimals);
 const path=buildTransferPath(origin,destination);
 const routes=deployedRoutes(catalog).filter(r=>r.asset===asset);
 const hops=[];
 for(let i=0;i<path.length-1;i++){
  const source=path[i],destination=path[i+1];
  const pair=routes.filter(r=>r.source===source&&r.destination===destination);
  const reverse=routes.filter(r=>r.source===destination&&r.destination===source);
  if(pair.length!==1||reverse.length!==1)throw Error("Both directed route deployments must be documented");
  hops.push({source,destination,routeId:pair[0].routeId,
   gateway:pair[0].gateway,sourceRouter:pair[0].sourceRouter,
   destinationRouter:pair[0].destinationRouter,
   sourceTxHash:null,destinationTxHash:null});
 }
 return {version:JOURNEY_VERSION,account:account.toLowerCase(),recipient:recipient.toLowerCase(),
  asset,amount,origin,destination,hops};
}
export function validJournal(catalog,account,journal){
 if(!journal||journal.version!==JOURNEY_VERSION||!same(journal.account,account)||
  !Array.isArray(journal.hops)||!journal.hops.length||journal.hops.length>2||
  !ADDRESS.test(journal.recipient||"")||typeof journal.asset!=="string")return false;
 try{
  const model=createJourney({catalog,account,asset:journal.asset,
   amount:journal.amount,recipient:journal.recipient,
   origin:journal.origin,destination:journal.destination});
  return model.hops.length===journal.hops.length&&model.hops.every((h,i)=>{
   const value=journal.hops[i];
   return ["source","destination"].every(k=>h[k]===value[k])&&
    ["routeId","gateway","sourceRouter","destinationRouter"].every(k=>same(h[k],value[k]))&&
    ["sourceTxHash","destinationTxHash"].every(k=>
     value[k]===null||HASH.test(value[k]||""));
  });
 }catch{return false;}
}
export function rememberTransaction(journal,hopIndex,kind,hash){
 if(!HASH.test(hash||"")||!Number.isInteger(hopIndex)||hopIndex<0||
  hopIndex>=journal.hops.length||!["source","destination"].includes(kind))
  throw Error("Malformed transfer transaction");
 const key=kind==="source"?"sourceTxHash":"destinationTxHash";
 if(journal.hops[hopIndex][key])throw Error("Transaction already submitted: check it on-chain first");
 if(kind==="destination"&&!journal.hops[hopIndex].sourceTxHash)
  throw Error("Destination cannot be submitted before source");
 return {...journal,hops:journal.hops.map((h,i)=>i===hopIndex?{...h,[key]:hash.toLowerCase()}:h)};
}
// Observations are built from verified chain receipts and delivered(messageId).
// Never infer a success or loss from wallet cache, failed RPC, or an unfinalized tx.
export function nextTransferAction(journal,observed=[]){
 if(!journal)return {kind:"start",index:0,total:0,complete:0};
 const total=journal.hops.length*2;
 for(let i=0;i<journal.hops.length;i++){
  const hop=journal.hops[i],o=observed[i]||{};
  const sourceIndex=2*i,destinationIndex=sourceIndex+1;
  if(!hop.sourceTxHash)
   return {kind:"source",index:sourceIndex,total,complete:sourceIndex,hop:i};
  if(o.source==="failed")return {kind:"source-failed",index:sourceIndex,total,complete:sourceIndex,hop:i};
  if(o.source!=="confirmed")
   return {kind:"check-source",index:sourceIndex,total,complete:sourceIndex,hop:i};
  if(o.delivered===true)continue;
  if(o.delivered!==false)
   return {kind:"check-delivery",index:destinationIndex,total,complete:sourceIndex+1,hop:i};
  if(!hop.destinationTxHash)
   return {kind:"destination",index:destinationIndex,total,complete:sourceIndex+1,hop:i};
  if(o.destination==="failed")
   return {kind:"destination-retry",index:destinationIndex,total,complete:sourceIndex+1,hop:i};
  return {kind:"check-destination",index:destinationIndex,total,complete:sourceIndex+1,hop:i};
 }
 return {kind:"complete",index:total,total,complete:total,hop:journal.hops.length-1};
}
export function actionTitle(action){
 const titles={
  start:"Start Transfer",source:"Confirm source in MetaMask",
  "source-failed":"Source transaction failed · review",
  "check-source":"Check source transaction",
  "check-delivery":"Check delivery status",
  destination:"Continue delivery in MetaMask",
  "destination-retry":"Retry destination delivery",
  "check-destination":"Check destination transaction",
  complete:"Transfer completed"
 };
 return titles[action.kind]||"Check transfer";
}
export function journalAsJson(journal){return JSON.stringify(journal);}
