// Lightweight, first-party pageview events. No cookies, storage, wallet data or fingerprinting.
// This is imported by the public SPA and follows real path changes (not re-renders).
const endpoint="/api/xita/analytics/hit";
let lastPath=null;
const allowed=path=>/^(?:\/|\/transfer|\/my-transfers|\/markets|\/faq|\/contact|\/join(?:\/confirm|\/submitted)?|\/createtoken(?:\/confirm|\/submitted)?|\/profile-update|\/xgr|\/imprint\.html|\/privacy-policy\.html|\/terms\.html|\/token\/[a-z0-9-]{1,80})$/.test(path);
function sendPageView(){
 const path=location.pathname.replace(/\/+$/,"")||"/";
 if(!allowed(path)||path===lastPath||navigator.webdriver||document.visibilityState==="prerender")return;
 lastPath=path;
 let sourceHost=null,utmSource=null,utmCampaign=null;
 try{
  const origin=document.referrer?new URL(document.referrer).hostname:"";
  if(origin&&origin!=="xita.xgr.network")sourceHost=origin;
 }catch{}
 const params=new URLSearchParams(location.search);
 utmSource=params.get("utm_source");
 utmCampaign=params.get("utm_campaign");
 const payload=JSON.stringify({path,sourceHost,utmSource,utmCampaign});
 try{
  void fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
   body:payload,cache:"no-store",keepalive:true,credentials:"omit"}).catch(()=>{});
 }catch{}
}
for(const method of ["pushState","replaceState"]){
 const original=history[method];
 history[method]=function(...args){
  const result=original.apply(this,args);
  queueMicrotask(sendPageView);
  return result;
 };
}
addEventListener("popstate",()=>queueMicrotask(sendPageView));
if(document.readyState==="loading")
 addEventListener("DOMContentLoaded",sendPageView,{once:true});
else sendPageView();
