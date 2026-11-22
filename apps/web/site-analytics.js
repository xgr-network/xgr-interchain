// First-party, cookie-free page views and active engagement.
// No persistent browser IDs, IPs, wallet addresses or third-party trackers.
const endpoint="/api/xita/analytics/hit";
const TICK_MS=15000;
const IDLE_MS=60000;
const allowed=path=>/^(?:\/|\/transfer|\/my-transfers|\/markets|\/faq|\/contact|\/join(?:\/confirm|\/submitted)?|\/createtoken(?:\/confirm|\/submitted)?|\/profile-update|\/xgr|\/imprint\.html|\/privacy-policy\.html|\/terms\.html|\/token\/[a-z0-9-]{1,80})$/.test(path);
let current=null,lastActivity=Date.now(),lastTick=Date.now();
function validPath(){
 const path=location.pathname.replace(/\/+$/,"")||"/";
 return allowed(path)?path:null;
}
function active(now){
 return document.visibilityState==="visible"&&document.hasFocus()&&now-lastActivity<IDLE_MS;
}
function post(data,{unload=false}={}){
 const payload=JSON.stringify(data);
 try{
  if(unload&&navigator.sendBeacon){
   if(navigator.sendBeacon(endpoint,new Blob([payload],{type:"application/json"})))return;
  }
  void fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
   body:payload,cache:"no-store",keepalive:true,credentials:"omit"}).catch(()=>{});
 }catch{}
}
function flush({unload=false}={}){
 const now=Date.now();
 if(current){
  // Count only visible, focused, recently interacted-with time.
  // Cap each interval to avoid browser-suspension/clock-jump inflation.
  if(active(now)){
   const start=Math.max(lastTick,lastActivity-IDLE_MS);
   const elapsed=Math.min(TICK_MS+1500,Math.max(0,now-start));
   current.milliseconds+=elapsed;
  }
  const seconds=Math.floor(current.milliseconds/1000);
  if(seconds>current.reported&&seconds<=14400){
   current.reported=seconds;
   post({type:"engagement",path:current.path,viewId:current.id,seconds},{unload});
  }
 }
 lastTick=now;
}
function onNavigate(){
 const path=validPath();
 if(!path||navigator.webdriver||document.visibilityState==="prerender"){
  flush({unload:true});current=null;return;
 }
 if(current?.path===path)return;
 flush({unload:true});
 const id=typeof crypto?.randomUUID==="function"?crypto.randomUUID():null;
 current={path,id,milliseconds:0,reported:0};
 lastTick=Date.now();
 let sourceHost=null;
 try{
  const origin=document.referrer?new URL(document.referrer).hostname:"";
  if(origin&&origin!=="xita.xgr.network")sourceHost=origin;
 }catch{}
 const params=new URLSearchParams(location.search);
 post({type:"pageview",path,viewId:id,sourceHost,utmSource:params.get("utm_source"),
  utmCampaign:params.get("utm_campaign")});
}
for(const method of ["pushState","replaceState"]){
 const original=history[method];
 history[method]=function(...args){
  const result=original.apply(this,args);
  queueMicrotask(onNavigate);
  return result;
 };
}
addEventListener("popstate",()=>queueMicrotask(onNavigate));
for(const event of ["pointerdown","keydown","wheel","touchstart"])
 addEventListener(event,()=>{lastActivity=Date.now()},{passive:true});
addEventListener("visibilitychange",()=>{
 if(document.visibilityState!=="visible")flush({unload:true});
 else {lastTick=Date.now();lastActivity=Date.now();}
});
addEventListener("blur",()=>flush({unload:true}));
addEventListener("focus",()=>{lastTick=Date.now();lastActivity=Date.now();});
addEventListener("pagehide",()=>flush({unload:true}));
setInterval(()=>{if(!document.hidden)flush();else lastTick=Date.now();},TICK_MS);
if(document.readyState==="loading")
 addEventListener("DOMContentLoaded",onNavigate,{once:true});
else onNavigate();
