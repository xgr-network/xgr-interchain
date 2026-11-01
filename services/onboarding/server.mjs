import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {loadCatalog,validateCatalog} from "../../tools/validate-manifests.mjs";
import {verifyCoinGecko} from "./coingecko-identity.mjs";
import {fetchCoinDetails,joinFromCoin,profileUpdateFromCoin,checkedUpdateAsset} from "./coingecko-profile.mjs";
import {sendMail,mailConfigured} from "./mail-gateway.mjs";
import {applicationMail} from "./mail-template.mjs";
import {privateLocation,preparePrivateDir,createPending,readPrivate,savePrivate,lockedRecord,matchesToken,confirmationHash,listPrivate,removePrivate} from "./private-store.mjs";
import {buildManifestBundle} from "./manifests.mjs";
import {handleCreator} from "./creator-registration.mjs";
const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const REPO="xgr-network/xgr-interchain";
const reply=(res,status,data)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data));};
async function readBody(req){
 if(!req.headers["content-type"]?.startsWith("application/json"))throw Error("JSON required");
 let bytes=0,body="";
 for await(const block of req){bytes+=block.length;if(bytes>32000)throw Error("Payload too large");body+=block.toString("utf8");}
 return JSON.parse(body);
}
export function joinGithubToken(env=process.env){
 // Reuse the existing XITA deployment GitHub credential; an override is optional.
 return env.XITA_JOIN_WRITER_TOKEN||env.XITA_GITHUB_TOKEN||"";
}
async function github(path,method="GET",body,token=joinGithubToken()){
 if(!token)throw Error("Writer credential not configured");
 const response=await fetch("https://api.github.com/repos/"+REPO+path,{
  method,signal:AbortSignal.timeout(12000),cache:"no-store",
  headers:{"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Authorization":"Bearer "+token,"Content-Type":"application/json"},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 if(!response.ok)throw Error("GitHub rejected request ("+response.status+")");
 return response.json();
}
export async function publishDraft(bundle,{expectedMain,applicationId,githubCall=github}={}){
 if(!/^[0-9a-f-]{36}$/.test(applicationId||""))throw Error("Invalid application ID");
 if(!/^[0-9a-f]{40}$/.test(expectedMain||""))throw Error("Invalid Git revision");
 const head=await githubCall("/git/ref/heads/main");
 if(head.object?.sha!==expectedMain)throw Error("Main changed; request new preview");
 const base=await githubCall("/git/commits/"+expectedMain);
 const update=bundle.kind==="profile-update";
 const entries=[];
 for(const [path,content] of Object.entries(bundle.files)){
  if(path!=="apps/web/catalog.json"&&
     (update?path!=="config/assets/"+bundle.assetId.slice(2,4)+"/"+bundle.key+"/metadata.json":
       !path.startsWith("config/assets/"+bundle.assetId.slice(2,4)+"/"+bundle.key+"/")))
   throw Error("Unsafe path");
  if(path!=="apps/web/catalog.json"){
   // If an asset has already been admitted since the preview, the server
   // requires another manifest validation against the CURRENT checkout.
   const file=await githubCall("/contents/"+path+"?ref=main").catch(e=>{
    if(e.message.includes("(404)"))return null;
    throw e;
   });
   if(update?!file:Boolean(file))throw Error(update?
    "Approved token profile is missing":"Asset manifest already exists");
  }
  entries.push({path,mode:"100644",type:"blob",content});
 }
 const branch=(update?"profile/":"alliance/")+bundle.key.toLowerCase()+"-"+applicationId.slice(0,8);
 const tree=await githubCall("/git/trees","POST",{base_tree:base.tree.sha,tree:entries});
 // This branch name is unique to the private confirmed application, not each
 // HTTP request. A lost proxy response or partial GitHub write can be resumed.
 const prior=await githubCall("/git/ref/heads/"+branch).catch(error=>{
  if(error.message.includes("(404)"))return null;
  throw error;
 });
 if(prior){
  const commit=await githubCall("/git/commits/"+prior.object.sha);
  if(commit.tree?.sha!==tree.sha||commit.parents?.length!==1||
     commit.parents[0]?.sha!==expectedMain)
   throw Error("Existing application branch differs from validated manifest");
 }else{
  const commit=await githubCall("/git/commits","POST",{message:(update?"profile: refresh ":"onboard: propose ")+bundle.key,tree:tree.sha,parents:[expectedMain]});
  await githubCall("/git/refs","POST",{ref:"refs/heads/"+branch,sha:commit.sha});
 }
 const current=await githubCall("/pulls?state=all&head="+encodeURIComponent("xgr-network:"+branch));
 if(!Array.isArray(current))throw Error("Unable to verify existing application PR");
 if(current.length>1)throw Error("More than one proposal for application branch");
 const priorPR=current[0];
 if(priorPR){
  if(priorPR.head?.ref!==branch||priorPR.base?.ref!=="main"||
     priorPR.draft!==true||priorPR.state!=="open")
   throw Error("Existing application PR requires operator review");
  return {number:priorPR.number,url:priorPR.html_url,status:"draft"};
 }
 const creator=bundle.kind==="origin-xgrchain";
 const pr=await githubCall("/pulls","POST",{title:(update?"Refresh XITA profile: ":"Join XITA: ")+bundle.summary.name+" ("+bundle.key+")",head:branch,base:"main",draft:true,
  body:(update?"Profile-only CoinGecko update: existing canonical asset, routes, deployments and supply metadata remain unchanged. CoinGecko identity reverified at confirmation and in PR CI. Email verified; no applicant contact information is committed.":
  "Public directory proposal — applicant role: "+bundle.summary.applicantRole+
    (creator?". XGRChain original contract independently verified against the audited factory receipt; required CI repeats the on-chain owner, supply, creation and bytecode checks. No CoinGecko ID is required.":
      ". CoinGecko original-chain contract verified before submission; required CI repeats the check.")+
    " No approval, deployment of XITA routes or live transfer is implied. Review token representations before merging. No applicant email is present.")});
 return {number:pr.number,url:pr.html_url,status:"draft"};
}
// The private contact record is not authoritative about whether a GitHub PR
// is still open: operator closure may precede the notification poller.
// Only active email confirmations, open PRs and accepted/deployed assets block
// a new proposal for the same original token. Never infer a GitHub 5xx/timeout
// or malformed response is a deleted PR.
export async function hasBlockingJoinApplication(records,assetId,{
 readPR=number=>github("/pulls/"+number)
}={}){
 if(!Array.isArray(records))throw Error("Join storage unavailable");
 for(const record of records){
  if(record.assetId!==assetId)continue;
  if(record.phase==="pending-email"||
     ["approved","deployed","first-lock","listed","delisted"].includes(record.phase))
   return true;
  const number=record.pr?.number;
  if(!Number.isSafeInteger(number)||number<=0){
   // Older rejected records without a PR should not prevent reapplication.
   if(record.phase==="rejected")continue;
   return true;
  }
  let pr;
  try{pr=await readPR(number)}
  catch(error){
   // An explicitly missing PR is no longer a live proposal. All other GitHub
   // failures must fail closed rather than admitting duplicate open PRs.
   if(String(error?.message||"").includes("GitHub rejected request (404)"))
    continue;
   throw Error("Join PR status unavailable; retry later");
  }
  if(!pr||!["open","closed"].includes(pr.state))
   throw Error("Join PR status unavailable; retry later");
  if(pr.state==="open"||pr.merged===true||Boolean(pr.merged_at))
   return true;
  // Verified closed AND unmerged PR; allow a new independent application.
 }
 return false;
}

// Only operator-held credentials and a verified email enable public submissions.
export function joinAvailable(env=process.env){
  if(!joinGithubToken(env)||!mailConfigured(env))return false;
  try{return Boolean(privateLocation(env));}catch{return false;}
}
// Fail closed on broken *operator-owned* infrastructure manifests. Public
// applicants cannot repair this state, so never label it a field error (422).
// Do not substitute a browser catalog, drop receipt checks or mask bad hooks.
function checkedJoinCatalog(sourceCatalog){
 let catalog;
 try{
  catalog=sourceCatalog();
  if(validateCatalog(catalog).length)throw Error("Invalid operator inventory");
 }catch{
  throw Error("Join inventory unavailable; operator verification required");
 }
 return catalog;
}
export function joinReadiness(env=process.env,sourceCatalog=()=>loadCatalog(root)){
 if(!joinAvailable(env))
  return {available:false,note:"Email confirmation or GitHub writer not configured"};
 try{
  checkedJoinCatalog(sourceCatalog);
  return {available:true,note:"Email-confirmed applications supported"};
 }catch{
  return {available:false,note:"Join inventory unavailable; operator verification required"};
 }
}
export function localMainSha(){
  const sha=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",timeout:3000}).trim();
  if(!/^[0-9a-f]{40}$/.test(sha))throw Error("Local Git main revision unavailable");
  return sha;
}
const rate=new Map();
function allowed(client,now=Date.now()){
  const key=String(client||"unknown").slice(0,128);
  for(const [k,v] of rate)if(now-v.since>3600000)rate.delete(k);
  const prior=rate.get(key);
  if(!prior||now-prior.since>3600000){rate.set(key,{since:now,count:1});return true;}
  if(prior.count>=5)return false;
  prior.count++;return true;
}
function publicConfirmUrl(id,token,env){
  const base=env.XITA_JOIN_PUBLIC_URL||"https://xita.xgr.network";
  const url=new URL(base);
  if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash)
    throw Error("Invalid public confirmation origin");
  return url.origin+"/join/confirm#"+id+"."+token;
}
function httpError(error){
  const message=String(error?.message||error);
  return {status:/(unavailable|HTTP 429|HTTP 50\d|gateway|GitHub rejected|service unavailable|Git revision)/i.test(message)?503:422,
    error:message.replace(/[^\x20-\x7e]/g," ").slice(0,220)};
}
export async function handleJoin(req,res,{publisher=publishDraft,verify=verifyCoinGecko,fetchCoin=fetchCoinDetails,deliver=sendMail,
  readPR=number=>github("/pulls/"+number),
  getMainSha=localMainSha,env=process.env,sourceCatalog=()=>loadCatalog(root),clock=Date.now}={}){
 const url=new URL(req.url,"http://localhost"),path=url.pathname;
 if(path.startsWith("/api/xita/creator/")||path.startsWith("/token-logos/"))
  return handleCreator(req,res,{env,clock,deliver});
 if(req.method==="GET"&&path==="/api/xita/join/status")
  return reply(res,200,{ok:true,...joinReadiness(env,sourceCatalog)});
 if(req.method!=="POST"||!["/api/xita/join/preview","/api/xita/join/submit","/api/xita/join/confirm",
    "/api/xita/profile/preview","/api/xita/profile/submit"].includes(path))
  return reply(res,404,{ok:false});
 try{
  // Never accept client-supplied credentials or a contact address from a URL.
  if(path.endsWith("/confirm")){
    if(!joinAvailable(env))return reply(res,503,{ok:false,error:"Application confirmation is unavailable"});
    const {id,token}=await readBody(req);
    if(!/^[0-9a-f-]{36}$/.test(id||"")||!/^[a-f0-9]{64}$/.test(token||""))
      return reply(res,422,{ok:false,error:"Invalid confirmation token"});
    const dir=preparePrivateDir(privateLocation(env));
    const result=await lockedRecord(dir,id,async record=>{
      if(record.phase!=="pending-email"){
        // Repeated confirmation links are read-only after success; never
        // create a second PR, but return the recorded result safely.
        if(record.pr&&matchesToken(record.receiptHash,token))
          return {ok:true,status:"under-review",prNumber:record.pr.number,prUrl:record.pr.url};
        throw Error("Application already confirmed or completed");
      }
      if(Date.parse(record.confirmBefore)<clock()||!matchesToken(record.tokenHash,token))
        throw Error("Expired or invalid confirmation token");
      // Never trust a browser-submitted profile or stale CoinGecko snapshot.
      const catalog=checkedJoinCatalog(sourceCatalog);
      let bundle,identity;
      if(record.kind==="profile-update"){
       const current=checkedUpdateAsset(catalog,record.input.symbol);
       const currentId=current.profile.market?.coingeckoId||record.input.coingeckoId;
       const coin=await fetchCoin(currentId);
       bundle=profileUpdateFromCoin(record.input,coin,catalog);
       identity={checkedAt:new Date(clock()).toISOString()};
      }else if(record.kind==="coingecko-join"){
       const coin=await fetchCoin(record.input.coingeckoId);
       const fresh=joinFromCoin(record.input,coin,catalog);
       if(fresh.normalized.canonicalAddress!==record.input.canonicalAddress||
          fresh.normalized.canonicalChain!==record.input.canonicalChain||
          fresh.normalized.symbol!==record.input.symbol||
          fresh.normalized.decimals!==record.input.decimals)
        throw Error("CoinGecko original token identity changed since application");
       bundle=buildManifestBundle(fresh.normalized,catalog);
       identity={checkedAt:new Date(clock()).toISOString()};
      }else{
       bundle=buildManifestBundle(record.input,catalog);
       identity=await verify(record.input,{catalog});
      }
      const expectedMain=await getMainSha();
      const pr=await publisher(bundle,{expectedMain,applicationId:record.id});
      if(record.kind==="profile-update"){
       const path=Object.keys(bundle.files).find(x=>x.endsWith("/metadata.json"));
       if(!path)throw Error("Missing verified profile metadata for notification");
       record.expectedProfile=JSON.parse(bundle.files[path]);
      }
      record.phase="under-review";record.pr=pr;
      record.receiptHash=record.tokenHash;record.tokenHash=null;
      record.coinGeckoVerifiedAt=identity.checkedAt;
      savePrivate(dir,record);
      // A notification failure must not undo an already-created GitHub PR.
      try{
        await deliver({to:record.input.contactEmail,subject:"XITA application received for review",
          ...applicationMail({title:"Your email is confirmed",subtitle:"Your proposal is under review",
       paragraphs:["A GitHub Draft PR #"+pr.number+" was created for "+record.input.symbol+".",
        "Profile updates never change routes, token contracts or ownership permissions."],
       action:{label:"View proposal",url:pr.url}}),
          idempotencyKey:record.id+":submitted"},{env});
        record.sent.push("submitted");savePrivate(dir,record);
      }catch{record.pendingNotification="submitted";savePrivate(dir,record);}
      return {ok:true,status:"under-review",prNumber:pr.number,prUrl:pr.url};
    });
    return reply(res,200,result);
  }
  if(path.endsWith("/submit")&&!joinAvailable(env))
    return reply(res,503,{ok:false,error:"Private email confirmation and GitHub writer are not configured; use Export draft"});
  const input=await readBody(req);
  const catalog=checkedJoinCatalog(sourceCatalog);
  const updating=path.startsWith("/api/xita/profile/");
  const coinId=updating?(checkedUpdateAsset(catalog,input.symbol).profile.market?.coingeckoId||input.coingeckoId):input.coingeckoId;
  const coin=await fetchCoin(coinId);
  const material=updating?null:joinFromCoin(input,coin,catalog,{requireContact:!path.endsWith("/preview")});
  const bundle=updating?profileUpdateFromCoin(input,coin,catalog):buildManifestBundle(material.normalized,catalog);
  const identity={platform:updating?"profile-update":material.normalized.canonicalChain,
   address:updating?catalog.assets[input.symbol].metadata.canonical.tokenAddress:material.normalized.canonicalAddress};
  if(path.endsWith("/preview"))
    return reply(res,200,{ok:true,summary:bundle.summary,files:Object.keys(bundle.files),
      assetId:bundle.assetId,identity,
      profile:updating?JSON.parse(Object.values(bundle.files).find((v,i)=>Object.keys(bundle.files)[i].endsWith("/metadata.json"))):
       material.profile,choices:updating?[]:material.choices});
  // Per-email throttle; proxies normally share loopback as socket address.
  if(typeof input.contactEmail!=="string"||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)||
     input.contactEmail.length>254||input.confirmed!==true)
   throw Error("Email and acknowledgement required");
  if(!allowed(confirmationHash(input.contactEmail.toLowerCase()),clock()))
   return reply(res,429,{ok:false,error:"Rate limit exceeded; retry later"});
  const dir=preparePrivateDir(privateLocation(env));
  const active=listPrivate(dir,{now:clock()});
  if(updating){
   for(const record of active.filter(x=>x.kind==="profile-update"&&x.assetId===bundle.assetId)){
    if(record.phase==="pending-email")
     return reply(res,409,{ok:false,error:"Profile update already awaiting email confirmation"});
    if(record.pr?.number){
     const pr=await readPR(record.pr.number);
     if(!pr||!["open","closed"].includes(pr.state))
      throw Error("GitHub profile update status unavailable");
     if(pr.state==="open")return reply(res,409,{ok:false,error:"Profile update proposal already open"});
    }
   }
  }else if(await hasBlockingJoinApplication(active,bundle.assetId,{readPR}))
    return reply(res,409,{ok:false,error:"An active application or approved token already exists for this original token"});
  const cleanInput=updating?
    {symbol:input.symbol,coingeckoId:coinId,contactEmail:input.contactEmail.toLowerCase(),confirmed:true}:
    {...material.normalized,coingeckoId:coinId,contactEmail:input.contactEmail.toLowerCase(),
     canonicalChain:material.normalized.canonicalChain,confirmed:true};
  const {id,token}=createPending(dir,cleanInput,bundle.assetId,{now:clock()});
  const record=readPrivate(dir,id);
  record.kind=updating?"profile-update":"coingecko-join";
  savePrivate(dir,record);
  // No email, token, or role holder contact is ever written to GitHub here.
  try{
    await deliver({to:input.contactEmail,subject:"Confirm your XITA Network application",
      ...applicationMail({title:updating?"Confirm your XITA profile update":"Confirm your XITA application",
       subtitle:"One more step to submit your proposal",
       paragraphs:["Please confirm the "+(updating?"profile update for "+input.symbol:"XITA Join application for "+material.normalized.name)+".",
        "After confirmation, XITA will prepare a GitHub Draft PR for review.",
        "If you did not submit this request, ignore the email."],
       action:{label:"Confirm your email",url:publicConfirmUrl(id,token,env)}}),
      idempotencyKey:id+":confirm"},{env});
  }catch{
    // A failed delivery is not an application: delete its private record.
    removePrivate(dir,id);
    return reply(res,503,{ok:false,error:"Application email delivery unavailable; no GitHub proposal created"});
  }
  return reply(res,202,{ok:true,status:"pending-email",note:"A private email confirmation has been sent; no GitHub PR yet"});
 }catch(error){
  const {status,error:message}=httpError(error);
  return reply(res,status,{ok:false,error:message});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 createServer((req,res)=>{void handleJoin(req,res)}).listen(Number(process.env.XITA_JOIN_PORT||4090),"127.0.0.1");
}
