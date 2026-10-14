// The browser must not abandon a verified receipt before the unprivileged
// systemd receipt-only checkout sync finishes. The watcher runs immediately,
// but the independent recovery timer can take substantially longer than 16s.
// This module only waits on READ-ONLY APIs. It never runs Git or broadcasts.
const SHA=/^[a-f0-9]{40}$/i;
export async function awaitVerifiedDeploymentCheckout({
 expectedCommit=null,readQueue,readSyncStatus=async()=>({}),
 paused=()=>false,onWaiting=()=>{},
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 attempts=160,intervalMs=2000
}={}){
 if(expectedCommit!==null&&!SHA.test(expectedCommit))
  throw Error("Invalid verified deployment commit");
 if(typeof readQueue!=="function"||typeof readSyncStatus!=="function"||
    typeof paused!=="function"||typeof onWaiting!=="function"||
    typeof sleep!=="function"||
    !Number.isSafeInteger(attempts)||attempts<1||attempts>360||
    !Number.isSafeInteger(intervalMs)||intervalMs<0||intervalMs>30000)
  throw Error("Invalid deployment checkout sync polling");
 let lastError="",lastDiagnostic=null;
 for(let i=0;i<attempts;i++){
  if(paused())return {status:"paused"};
  let queue=null;
  try{
   queue=await readQueue();
   if(queue&&!queue.readOnly&&SHA.test(queue.commit||"")&&
      (expectedCommit===null||queue.commit===expectedCommit))
    return {status:"current",queue};
   if(queue?.warning)lastError=String(queue.warning);
  }catch(e){lastError=String(e?.message||e)}
  try{
   lastDiagnostic=await readSyncStatus();
  }catch(e){
   // A diagnostic endpoint failure must never override actual Git status.
   lastDiagnostic={phase:"unavailable",error:String(e?.message||e)};
  }
  const diag=lastDiagnostic?.sync||lastDiagnostic||{};
  const relevantFailure=diag.phase==="failed"&&
   (!expectedCommit||diag.commit===expectedCommit)?diag.error:null;
  onWaiting({attempt:i+1,queue,diagnostic:diag,
   message:relevantFailure||lastError||"Verified GitHub receipt wartet auf lokalen Checkout-Sync"});
  if(i<attempts-1)await sleep(intervalMs);
 }
 const d=lastDiagnostic?.sync||lastDiagnostic||{};
 const message=d.phase==="failed"&&d.error?d.error:lastError||"Sync-Worker hat den neuen Receipt noch nicht übernommen";
 throw Error("GitHub-Receipt ist veröffentlicht, aber der lokale Checkout-Sync ist fehlgeschlagen oder nicht verfügbar: "+
  String(message).slice(0,300)+". Kein weiterer Contract wurde gesendet.");
}
