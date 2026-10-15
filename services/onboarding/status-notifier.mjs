// Server-local polling of canonical GitHub review status + independently verified public visibility.
// Run as a low-privilege timer with private contact directory permission; no public administration endpoint.
import {privateLocation,listPrivate,savePrivate,lockedRecord} from "./private-store.mjs";
import {sendMail,mailConfigured} from "./mail-gateway.mjs";
const REPO="xgr-network/xgr-interchain";
const STATUS={
 "approved":["XITA proposal approved","Your proposal was merged into the approved XITA token inventory. This is not yet a live transfer or public listing."],
 "rejected":["XITA proposal closed","Your XITA proposal was closed without acceptance. You can contact XGR if further review is required."],
 "deployed":["XITA routes deployed","The publicly documented route deployment is now complete. Verify availability in the XITA transfer interface before sending."],
 "first-lock":["First verified XITA collateral","XITA has independently verified locked collateral for your token. Its public listing is governed by the currently configured TVL threshold."],
 "listed":["Your token is now listed on XITA","Your token meets the currently verified public listing conditions and is discoverable in XITA."],
 "delisted":["XITA listing visibility changed","Your token no longer meets the currently verified public TVL listing conditions. Transfers and deployed contracts are not automatically disabled by this change."]
};
export function nextPhase(record,pr,visibility){
 if(!record?.pr?.number)return null;
 const merged=Boolean(pr?.merged_at);
 if(!merged&&(pr?.state==="closed"))return "rejected";
 if(!merged)return "under-review";
 const v=visibility?.schemaVersion===1&&visibility.kind==="xita-visibility-v1"
   ?visibility.assets?.[record.input.symbol]:null;
 if(!v||v.assetId?.toLowerCase()!==record.assetId?.toLowerCase())
   return ["deployed","first-lock","listed","delisted"].includes(record.phase)?record.phase:"approved";
 if(v.status==="public"&&v.deployment==="deployed"&&
   Number.isFinite(v.lockedUsd)&&v.lockedUsd>0)return "listed";
 if(v.status==="accepted"&&v.deployment==="deployed"&&Number.isFinite(v.lockedUsd))
   return record.phase==="listed"?"delisted":v.lockedUsd>0?"first-lock":"deployed";
 if(v.deployment==="deployed"&&
   !["listed","delisted","first-lock"].includes(record.phase))return "deployed";
 return ["listed","delisted","first-lock","deployed"].includes(record.phase)?record.phase:"approved";
}
async function jsonGet(url,headers={}){
 const response=await fetch(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),
   headers:{"Accept":"application/json",...headers}});
 if(!response.ok)throw Error("Status read unavailable ("+response.status+")");
 return response.json();
}
async function publicPR(number,env){
 if(!Number.isSafeInteger(number)||number<=0)throw Error("Invalid PR number");
 return jsonGet("https://api.github.com/repos/"+REPO+"/pulls/"+number,
   env.XITA_JOIN_WRITER_TOKEN?{"Authorization":"Bearer "+env.XITA_JOIN_WRITER_TOKEN}:{});
}
async function visibilitySnapshot(){
 // Only read from the on-host, read-only XITA indexer; never trust the applicant or browser.
 return jsonGet("http://127.0.0.1:4088/api/xeta/v1/visibility");
}
export async function notifyApplications({env=process.env,readPR=publicPR,readVisibility=visibilitySnapshot,
  deliver=sendMail}={}){
 if(!mailConfigured(env))throw Error("Mail gateway required for applicant status notifications");
 const dir=privateLocation(env),records=listPrivate(dir);
 let visibility=null;
 try{visibility=await readVisibility();}catch{/* preserve prior state on unavailable independent proofs */}
 const results=[];
 for(const item of records){
  if(!item.pr?.number)continue;
  await lockedRecord(dir,item.id,async record=>{
   let desired=record.phase;
   try{desired=nextPhase(record,await readPR(record.pr.number,env),visibility)||record.phase;}
   catch{/* don't notify on unverifiable GitHub changes */}
   if(desired!==record.phase){
     record.phase=desired;
     record.pendingNotification=STATUS[desired]?desired:null;
     if(["rejected","listed"].includes(desired))record.retainUntil=new Date(Date.now()+180*86400000).toISOString();
     savePrivate(dir,record);
   }
   const pending=record.pendingNotification;
   if(!pending)return;
   const [subject,detail]=STATUS[pending]||
     (pending==="submitted"?["XITA application received","Your email-confirmed draft proposal has been submitted for XGR review."]:[]);
   if(!subject)return;
   try{
     await deliver({to:record.input.contactEmail,subject,text:detail+
       "\n\nPublic proposal: "+record.pr.url+"\n\nThese emails concern only your XITA application, not marketing.",
       idempotencyKey:record.id+":"+pending},{env});
     record.sent=[...new Set([...(record.sent||[]),pending])];
     delete record.pendingNotification;savePrivate(dir,record);
     results.push({id:record.id,status:pending,sent:true});
   }catch{results.push({id:record.id,status:pending,sent:false});}
  });
 }
 return results;
}
if(process.argv[1]?.endsWith("/status-notifier.mjs")&&process.argv.includes("--run")){
 notifyApplications().then(r=>{console.log("XITA status notifications processed: "+r.length)})
   .catch(error=>{console.error("XITA notifier failed:",error.message);process.exitCode=1});
}
