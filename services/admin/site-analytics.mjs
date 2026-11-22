// Privacy-minimal first-party website analytics. No cookies, wallet IDs, raw IPs,
// request URLs, full referrers or user-agent strings are written to disk.
import {createHmac,randomBytes} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from "node:fs";
import {isIP} from "node:net";
import {join} from "node:path";

const DAY_MS=86400000;
const SESSION_MS=30*60*1000;
const KEEP_DAYS=366;
const MAX_VIEWS_PER_IP_PER_DAY=240;
const BOT=/bot|spider|crawler|crawl|slurp|headless|lighthouse|pagespeed|monitor|uptime|curl|wget|python|axios|postman|httpclient|http-client|node-fetch|fetch\/|google-inspection|facebookexternalhit|preview|whatsapp|telegrambot|discordbot/i;
const KNOWN=new Set(["/","/transfer","/my-transfers","/markets","/faq","/contact","/join","/join/confirm","/join/submitted","/createtoken","/createtoken/confirm","/createtoken/submitted","/profile-update","/xgr","/imprint.html","/privacy-policy.html","/terms.html"]);
const fmt=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});
function berlinParts(now){
 const parts=Object.fromEntries(fmt.formatToParts(now).map(p=>[p.type,p.value]));
 return {day:parts.year+"-"+parts.month+"-"+parts.day,hour:Number(parts.hour)};
}
function addDays(day,diff){
 return new Date(Date.parse(day+"T12:00:00Z")+diff*DAY_MS).toISOString().slice(0,10);
}
function cleanPath(input){
 if(typeof input!=="string"||input.length>110)return null;
 const path=input.replace(/\/+$/,"")||"/";
 if(KNOWN.has(path))return path;
 if(/^\/token\/[a-z0-9-]{1,80}$/.test(path))return path;
 return null;
}
function cleanCampaign(value){
 if(typeof value!=="string")return null;
 const s=value.trim().toLowerCase();
 return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(s)?s:null;
}
function cleanHost(host){
 if(typeof host!=="string")return null;
 const h=host.toLowerCase().trim().replace(/\.$/,"");
 return h.length<=110&&/^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(h)?h:null;
}
function sourceFor(input){
 const utm=cleanCampaign(input.utmSource);
 const host=cleanHost(input.sourceHost);
 if(utm)return "Campaign · "+utm;
 if(!host||host==="xita.xgr.network")return "Direct / unknown";
 if(/(^|\.)google\.|(^|\.)bing\.com$|(^|\.)duckduckgo\.com$|(^|\.)yahoo\./.test(host))return "Search · "+host;
 if(/(^|\.)(?:x\.com|twitter\.com|t\.co|facebook\.com|instagram\.com|linkedin\.com|reddit\.com|tiktok\.com|youtube\.com|telegram\.org)$/.test(host))
  return "Social · "+host;
 return "Referral · "+host;
}
function deviceFor(ua){
 if(/ipad|tablet|android(?!.*mobile)/i.test(ua))return "Tablet";
 if(/mobile|iphone|ipod/i.test(ua))return "Mobile";
 return "Desktop";
}
function freshDay(){
 return {pageViews:0,visits:0,uniqueVisitors:0,pages:{},sources:{},campaigns:{},devices:{},
  hourlyViews:Array(24).fill(0),hourlyVisits:Array(24).fill(0),visitors:{}};
}
function increment(collection,key,limit){
 if(Object.hasOwn(collection,key)||Object.keys(collection).length<limit)
  collection[key]=(collection[key]||0)+1;
 else collection["Other"]=(collection["Other"]||0)+1;
}
function totalOf(days){
 return days.reduce((a,d)=>({pageViews:a.pageViews+d.pageViews,visits:a.visits+d.visits,
  uniqueVisitorDays:a.uniqueVisitorDays+d.uniqueVisitors}),{pageViews:0,visits:0,uniqueVisitorDays:0});
}
function rank(values,limit=12){
 return Object.entries(values).map(([name,count])=>({name,count}))
  .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,limit);
}
function sumField(days,key){
 const all={};
 for(const day of days)for(const [name,count] of Object.entries(day[key]||{}))
  all[name]=(all[name]||0)+count;
 return all;
}
export function createSiteAnalytics({stateDir,clock=()=>new Date(),excludeIps=[]}){
 mkdirSync(stateDir,{recursive:true,mode:0o700});
 const keyPath=join(stateDir,"site-analytics.key");
 const statePath=join(stateDir,"site-analytics.json");
 if(!existsSync(keyPath)){
  if(existsSync(statePath))throw Error("Analytics key missing for existing state; restore key, do not reset identity");
  writeFileSync(keyPath,randomBytes(32).toString("hex"),{mode:0o600,flag:"wx"});
 }
 const key=readFileSync(keyPath,"utf8").trim();
 if(!/^[a-f0-9]{64}$/.test(key))throw Error("Invalid analytics HMAC key");
 const secret=Buffer.from(key,"hex");
 const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,"utf8")):
  {version:1,createdAt:clock().toISOString(),days:{}};
 if(state.version!==1||!state.days||typeof state.days!=="object"||Array.isArray(state.days))
  throw Error("Incompatible analytics state; refusing to overwrite");
 const excluded=new Set(excludeIps.map(s=>String(s).trim()).filter(x=>isIP(x)));
 function persist(){
  const tmp=join(stateDir,".site-analytics-"+randomBytes(8).toString("hex")+".tmp");
  writeFileSync(tmp,JSON.stringify(state),{mode:0o600,flag:"wx"});
  renameSync(tmp,statePath);
 }
 function prune(today){
  for(const [day,item] of Object.entries(state.days)){
   if(day<addDays(today,-KEEP_DAYS+1)||day>today)delete state.days[day];
   else if(day<addDays(today,-1))delete item.visitors;
  }
 }
 function record(input){
  const ip=String(input?.ip||"");
  const ua=String(input?.userAgent||"");
  const path=cleanPath(input?.path);
  if(!isIP(ip)||excluded.has(ip)||!path||ua.length<8||ua.length>500||BOT.test(ua))
   return {counted:false};
  const timestamp=clock();
  const {day:dayKey,hour}=berlinParts(timestamp);
  const now=timestamp.getTime();
  const identity=createHmac("sha256",secret).update("xita-site-v1\0"+dayKey+"\0"+ip).digest("hex").slice(0,32);
  const daily=state.days[dayKey]||(state.days[dayKey]=freshDay());
  const previous=daily.visitors?.[identity];
  if(previous?.hits>=MAX_VIEWS_PER_IP_PER_DAY)return {counted:false,limited:true};
  if(!daily.visitors)daily.visitors={};
  if(!previous)daily.uniqueVisitors++;
  const newVisit=!previous||now-previous.lastSeen>=SESSION_MS;
  const entry=previous||{lastSeen:now,hits:0};
  entry.lastSeen=Math.max(now,entry.lastSeen);
  entry.hits++;
  daily.visitors[identity]=entry;
  daily.pageViews++;
  daily.hourlyViews[hour]++;
  increment(daily.pages,path,150);
  if(newVisit){
   daily.visits++;
   daily.hourlyVisits[hour]++;
   increment(daily.sources,sourceFor(input),60);
   increment(daily.devices,deviceFor(ua),4);
   const campaign=cleanCampaign(input.utmCampaign);
   if(campaign)increment(daily.campaigns,campaign,60);
  }
  prune(dayKey);
  persist();
  return {counted:true,newVisit,newDailyVisitor:!previous};
 }
 function summary(days=30){
  if(![7,30,90,365].includes(days))throw Error("Unsupported analytics range");
  const {day:today}=berlinParts(clock());
  const daysFor=(count,offset)=>Array.from({length:count},(_,i)=>{
   const day=addDays(today,-(count-1-i)-offset);
   return {date:day,...(state.days[day]||freshDay())};
  });
  const current=daysFor(days,0);
  const prior=daysFor(days,days);
  const aggregate=totalOf(current);
  const previous=totalOf(prior);
  const allDays=Object.keys(state.days).sort();
  const trackedSince=allDays[0]||null;
  const comparable=Date.parse(state.createdAt)<=Date.parse(prior[0].date+"T00:00:00Z");
  const todayDay=state.days[today]||freshDay();
  return {ok:true,timezone:"Europe/Berlin",days,trackedSince,createdAt:state.createdAt,
   updatedAt:clock().toISOString(),totals:aggregate,
   previousTotals:comparable?previous:null,
   series:current.map(d=>({date:d.date,pageViews:d.pageViews,visits:d.visits,uniqueVisitorDays:d.uniqueVisitors})),
   hourly:{views:todayDay.hourlyViews,visits:todayDay.hourlyVisits},
   topPages:rank(sumField(current,"pages"),15),
   sources:rank(sumField(current,"sources"),15),
   devices:rank(sumField(current,"devices"),4),
   campaigns:rank(sumField(current,"campaigns"),12),
   note:"Unique visitor-days sum daily deduplicated IPs; this is not a cross-day unique person count. No cookies, no persistent cross-day visitor IDs."};
 }
 return {record,summary};
}
