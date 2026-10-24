// Read-only validator ILN probes. Only explicitly configured HTTP(S) RPC
// endpoints can be contacted; no credentials, transaction or arbitrary URL.
export function validatorRPCUrls(env=process.env){
 const value=String(env.XITA_VALIDATOR_RPC_URLS||"");
 return [...new Set(value.split(",").map(s=>s.trim()).filter(Boolean))].slice(0,12)
  .filter(s=>/^https?:\/\//.test(s)&&!s.includes("@")&&!s.includes("#")&&!s.includes("?") &&
    (()=>{try{const u=new URL(s);return ["http:","https:"].includes(u.protocol) && !u.username&&!u.password && !u.hash && !u.search;}catch{return false;}})());
}
export function summarizeILNValidatorStatus(raw,{now=Date.now(),name="validator"}={}){
 const fail=reason=>({name,state:"unavailable",workerAlive:false,routes:[],reason});
 if(!raw||raw.version!==2||!Array.isArray(raw.routes)||!Number.isSafeInteger(raw.updatedUnix))
  return fail("Invalid validator health schema");
 const ageMs=now-raw.updatedUnix*1000;
 if(ageMs< -30000||ageMs>120000||raw.workerAlive!==true)
  return {name,state:"stalled",workerAlive:false,ageMs,routes:[],reason:"Validator worker not reporting fresh progress"};
 const routes=raw.routes.slice(0,100).map(r=>({
  route:String(r.route||"").slice(0,130),source:String(r.source||"").replace(/^xgr$/i,"xgrchain").slice(0,55),
  destination:String(r.destination||"").slice(0,55),
  state:["ok","catching-up","unavailable"].includes(r.state)?r.state:"unavailable",
  sourceHead:(r.sourceHeadKnown===true||r.sourceHeadKnown===undefined&&r.sourceHead>0)&&Number.isSafeInteger(r.sourceHead)?r.sourceHead:null,
  scanCursor:(r.scanCursorKnown===true||r.scanCursorKnown===undefined&&r.scanCursor>0)&&Number.isSafeInteger(r.scanCursor)?r.scanCursor:null,
  blockLag:(r.sourceHeadKnown===true&&r.scanCursorKnown===true||r.sourceHeadKnown===undefined&&r.scanCursorKnown===undefined&&r.sourceHead>0)&&
   Number.isSafeInteger(r.blockLag)?r.blockLag:null,
  sourceHeadKnown:r.sourceHeadKnown===true,
  scanCursorKnown:r.scanCursorKnown===true,
  lastSuccessfulScanUnix:Number.isSafeInteger(r.lastSuccessfulScanUnix)&&r.lastSuccessfulScanUnix>0?r.lastSuccessfulScanUnix:null,
  error:String(r.error||"").slice(0,200)
 }));
 return {name,workerAlive:true,ageMs,routes,
  state:routes.some(r=>r.state==="unavailable")?"degraded":
   routes.some(r=>r.state!=="ok")?"catching-up":routes.length?"ok":"warning",
  reason:routes.length?"":"No registered Direct-BLS Gateway routes"};
}
export async function probeILNValidators({urls=validatorRPCUrls(),fetcher=globalThis.fetch,now=Date.now(),timeoutMs=4000}={}){
 return await Promise.all(urls.map(async (url,index)=>{
  const name="Validator "+(index+1);
  try{
   const response=await fetcher(url,{method:"POST",headers:{"content-type":"application/json"},
    redirect:"error",signal:AbortSignal.timeout(timeoutMs),
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"xgr_getILNIndexerStatus",params:[]})});
   if(!response.ok)throw Error("HTTP "+response.status);
   const text=await response.text();
   if(text.length>180000)throw Error("Response too large");
   const answer=JSON.parse(text);
   if(answer.error||!answer.result)throw Error("Indexer RPC unavailable");
   return summarizeILNValidatorStatus(answer.result,{now,name});
  }catch(e){return {name,state:"unavailable",workerAlive:false,routes:[],reason:String(e.message||e).slice(0,180)}}
 }));
}

/** External XITA data is diagnostic only, never a validator finality proof. */
export function attachXitaReferenceLag(validators,indexer,{now=Date.now(),maxAgeMs=180000}={}){
 const sourceHeads=new Map();
 for(const route of indexer?.routes||[]){
  const chain=String(route.source||"").toLowerCase();
  const t=Date.parse(route.updatedAt||"");
  if(!Number.isFinite(t)||now-t<0||now-t>maxAgeMs||
     !Number.isSafeInteger(route.finalizedHead)||route.finalizedHead<=0||
     !["ok","catching-up"].includes(route.state))continue;
  const previous=sourceHeads.get(chain);
  if(previous===undefined||route.finalizedHead>previous)
   sourceHeads.set(chain,route.finalizedHead);
 }
 return validators.map(validator=>({...validator,routes:(validator.routes||[]).map(route=>{
  const referenceHead=sourceHeads.get(route.source);
  const cursor=route.scanCursor;
  const valid=Number.isSafeInteger(referenceHead)&&Number.isSafeInteger(cursor)&&cursor>0;
  return {...route,
   xitaReferenceHead:valid?referenceHead:null,
   xitaReferenceLag:valid?Math.max(0,referenceHead-cursor):null,
   xitaReferenceOnly:true};
 })}));
}
