// Server-local polling of canonical GitHub review status + independently verified public visibility.
// Run as a low-privilege timer with private contact directory permission; no public administration endpoint.
import {privateLocation,listPrivate,savePrivate,lockedRecord} from "./private-store.mjs";
import {sendMail,mailConfigured} from "./mail-gateway.mjs";
import {applicationMail} from "./mail-template.mjs";
import {loadCatalog} from "../../tools/validate-manifests.mjs";
import {routeMilestones} from "./route-milestones.mjs";
const REPO="xgr-network/xgr-interchain";
const STATUS={
 "approved":["XITA proposal approved","Your proposal was merged into the approved XITA token inventory. This is not yet a live transfer or public listing."],
 "rejected":["XITA proposal closed","Your XITA proposal was closed without acceptance. You can contact XGR if further review is required."],
 "deployed":["Your first XITA route is live!","Your original token chain and XGRChain now have a documented, executable route in both directions."], // legacy queued milestone
 "first-route":["Your first XITA route is live!","Your original token chain and XGRChain now have a documented, executable route in both directions."],
 "all-routes":["Your XITA network expansion is complete!","Every planned XITA route for your token is now documented and executable in both directions."],
 "first-lock":["First verified XITA collateral","XITA has independently verified locked collateral for your token. Its public listing is governed by the currently configured TVL threshold."],
 "listed":["Your token is now listed on XITA","Your token meets the currently verified public listing conditions and is discoverable in XITA."],
 "delisted":["XITA listing visibility changed","Your token no longer meets the currently verified public TVL listing conditions. Transfers and deployed contracts are not automatically disabled by this change."]
};
export function nextPhase(record,pr,visibility,{readyToTransfer=false}={}){
 if(!record?.pr?.number)return null;
 const merged=Boolean(pr?.merged_at);
 if(!merged&&pr?.state==="closed")return "rejected";
 if(!merged)return "under-review";
 const phase=record.phase;
 const v=visibility?.schemaVersion===1&&visibility.kind==="xita-visibility-v1"
   ?visibility.assets?.[record.input.symbol]:null;
 const alreadyAdvanced=["deployed","first-lock","listed","delisted"].includes(phase);
 if(!v||v.assetId?.toLowerCase()!==record.assetId?.toLowerCase())
   return alreadyAdvanced?phase:"approved";
 const deployed=v.deployment==="deployed"&&readyToTransfer;
 // Never interpret missing, invalid or non-finalized collateral as public visibility.
 const validValue=Number.isFinite(v.lockedUsd)&&v.lockedUsd>=0;
 if(deployed&&v.status==="public"&&validValue&&v.lockedUsd>0)
   return "listed";
 // Delisting requires explicit, independently derived accepted status. A missing
 // indexer snapshot is not evidence of delisting.
 if(phase==="listed"&&deployed&&v.status==="accepted"&&validValue)
   return "delisted";
 // These phases record milestones already reported to the applicant.
 // Falling back to "deployed" would resend deployed and first-lock mails on
 // every polling cycle after a delisting or temporary drop in collateral.
 if(phase==="listed"||phase==="delisted"||phase==="first-lock")
   return phase;
 if(deployed&&v.status==="accepted"&&validValue)
   return v.lockedUsd>0?"first-lock":"deployed";
 if(deployed)return "deployed";
 return alreadyAdvanced?phase:"approved";
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
   (env.XITA_JOIN_WRITER_TOKEN||env.XITA_GITHUB_TOKEN)?{"Authorization":"Bearer "+(env.XITA_JOIN_WRITER_TOKEN||env.XITA_GITHUB_TOKEN)}:{});
}
async function visibilitySnapshot(){
 // Only read from the on-host, read-only XITA indexer; never trust the applicant or browser.
 return jsonGet("http://127.0.0.1:4088/api/xeta/v1/visibility");
}
export async function notifyApplications({env=process.env,readPR=publicPR,readVisibility=visibilitySnapshot,
  readCatalog=loadCatalog,readMilestones=(record)=>routeMilestones(readCatalog(),record.input.symbol,record.assetId),
  deliver=sendMail}={}){
 if(!mailConfigured(env))throw Error("Mail gateway required for applicant status notifications");
 const dir=privateLocation(env),records=listPrivate(dir);
 let visibility=null;
 try{visibility=await readVisibility();}catch{/* preserve prior state on unavailable independent proofs */}
 const results=[];
 for(const item of records){
  if(!item.pr?.number)continue;
  await lockedRecord(dir,item.id,async record=>{
   let desired=record.phase,merged=false;
   let milestones={firstRoute:null,allComplete:false,completedNetworks:[],plannedNetworks:[]};
   try{
     const pr=await readPR(record.pr.number,env);
     merged=Boolean(pr?.merged_at);
     if(merged)try{milestones=readMilestones(record);}catch{/* keep mail gated */}
     desired=nextPhase(record,pr,visibility,{readyToTransfer:Boolean(milestones.firstRoute)})||record.phase;
   }catch{/* no unverified GitHub changes or route claims */}
   if(desired!==record.phase){
     record.phase=desired;
     const queue=record.notificationQueue||[];
     if(desired!=="under-review"&&desired!=="rejected"&&!((record.sent||[]).includes("approved"))&&!queue.includes("approved"))queue.push("approved");

     if(merged&&milestones.firstRoute&&!(record.sent||[]).includes("first-route")&&!(record.sent||[]).includes("deployed")&&!queue.includes("first-route"))queue.push("first-route");
     if(STATUS[desired]&&desired!=="deployed"&&!queue.includes(desired)&&!(record.sent||[]).includes(desired))queue.push(desired);
     record.notificationQueue=queue;
     if(["rejected","listed"].includes(desired))record.retainUntil=new Date(Date.now()+180*86400000).toISOString();
     savePrivate(dir,record);
   }
   // Route milestone notifications are independent of TVL phase changes.
   // A rapid full deployment must not skip the first usable route.
   if(merged&&milestones.firstRoute){
     const queue=record.notificationQueue||[];
     const sent=record.sent||[];
     const firstKey="first-route";
     if(!sent.includes(firstKey)&&!queue.includes(firstKey)&&!sent.includes("deployed"))queue.push(firstKey);
     if(milestones.allComplete&&!sent.includes("all-routes")&&!queue.includes("all-routes"))queue.push("all-routes");
     record.notificationQueue=queue;
     savePrivate(dir,record);
   }
   // Migrate existing records without dropping unsent notifications.
   const queue=record.notificationQueue||[];
   if(record.pendingNotification&&!queue.includes(record.pendingNotification))queue.push(record.pendingNotification);
   const pending=queue[0];
   if(!pending)return;
   if(pending==="first-route"&&!milestones.firstRoute)return;
   if(pending==="all-routes"&&!milestones.allComplete)return;
   if(pending==="deployed"&&!milestones.firstRoute)return; // legacy queue
   const [subject,detail]=STATUS[pending]||
     (pending==="submitted"?["XITA application received","Your email-confirmed draft proposal has been submitted for XGR review."]:[]);
   if(!subject)return;
   try{
     const symbol=record.input.symbol;
     let route=null;
     if(["first-route","all-routes","deployed"].includes(pending))route=milestones.firstRoute;
     const transferUrl="https://xita.xgr.network/transfer?token="+encodeURIComponent(symbol)+
       (route?"&origin="+encodeURIComponent(route.source)+"&destination="+encodeURIComponent(route.destination):"");
     const action=["first-route","all-routes","deployed"].includes(pending)?{label:"Start your first transfer",url:transferUrl}:
       {label:"View your GitHub proposal",url:record.pr.url};
     const mail=applicationMail({title:subject,subtitle:record.input.name+" ("+symbol+")",
       paragraphs:[detail,pending==="approved"?"XGR will fund and deploy the approved routes. You do not need to deploy any contracts yourself.":
       pending==="first-route"?"Your home chain and XGRChain now support transfers both ways. Connect your own wallet to start; no transaction starts automatically.":
       pending==="all-routes"?"All "+milestones.plannedNetworks.length+" planned XGRChain-connected networks have complete two-way routes: "+milestones.completedNetworks.join(", ")+". You can now select these networks in Transfer Tokens.":
       pending==="deployed"?"A complete bidirectional home-chain route is ready. No wallet transaction starts automatically.":
       "Current status is based on independent XITA evidence."],action});
     await deliver({to:record.input.contactEmail,subject,...mail,
       idempotencyKey:record.id+":"+pending},{env});
     record.sent=[...new Set([...(record.sent||[]),pending])];
     queue.shift();record.notificationQueue=queue;
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
