import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createSiteAnalytics} from "./site-analytics.mjs";

const UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";
function setup(){
 const dir=mkdtempSync(join(tmpdir(),"xita-site-analytics-"));
 let now=new Date("2026-11-22T12:00:00Z");
 const api=createSiteAnalytics({stateDir:dir,clock:()=>now,excludeIps:["192.0.2.19"]});
 return {dir,api,move:ms=>{now=new Date(now.getTime()+ms)},dispose:()=>rmSync(dir,{recursive:true,force:true})};
}
test("one daily IP does not double count unique visitors; 30 minute idle creates visit",()=>{
 const h=setup();
 try{
  const event={ip:"192.0.2.1",userAgent:UA,path:"/transfer",sourceHost:"google.com"};
  h.api.record(event);
  h.move(5*60*1000);
  h.api.record({...event,path:"/join"});
  let summary=h.api.summary(7);
  assert.deepEqual(summary.totals,{pageViews:2,visits:1,uniqueVisitorDays:1});
  h.move(31*60*1000);
  h.api.record(event);
  summary=h.api.summary(7);
  assert.deepEqual(summary.totals,{pageViews:3,visits:2,uniqueVisitorDays:1});
  assert.equal(summary.topPages.find(v=>v.name==="/transfer").count,2);
 }finally{h.dispose();}
});
test("separate daily HMACs, no raw IPs, no full referrers or wallet info",()=>{
 const h=setup();
 try{
  h.api.record({ip:"2001:db8::1",userAgent:UA,path:"/token/xgr",sourceHost:"google.com",
   utmSource:"linkedin",utmCampaign:"xdc-launch"});
  let stored=readFileSync(join(h.dir,"site-analytics.json"),"utf8");
  assert.doesNotMatch(stored,/2001:db8|wallet|sourceHost|userAgent/);
  assert.equal(h.api.summary(7).campaigns[0].name,"xdc-launch");
  h.move(25*60*60*1000);
  h.api.record({ip:"2001:db8::1",userAgent:UA,path:"/join"});
  const s=h.api.summary(7);
  assert.equal(s.totals.uniqueVisitorDays,2);
  stored=readFileSync(join(h.dir,"site-analytics.json"),"utf8");
  const data=JSON.parse(stored);
  const ids=Object.values(data.days).flatMap(day=>Object.keys(day.visitors||{}));
  assert.equal(new Set(ids).size,2);
 }finally{h.dispose();}
});
test("bots, unsupported paths, excluded IPs and missing IP are rejected",()=>{
 const h=setup();
 try{
  for(const item of [
   {ip:"192.0.2.1",userAgent:"Googlebot/2.1",path:"/"},
   {ip:"192.0.2.1",userAgent:UA,path:"/admin"},
   {ip:"192.0.2.1",userAgent:UA,path:"/api/xeta/v1/transfers/stats"},
   {ip:"192.0.2.19",userAgent:UA,path:"/"},
   {ip:"",userAgent:UA,path:"/"}])
   assert.equal(h.api.record(item).counted,false);
  assert.equal(h.api.summary(30).totals.pageViews,0);
 }finally{h.dispose();}
});
test("daily visitor guard rejects excessive events without changing counts",()=>{
 const h=setup();
 try{
  const item={ip:"192.0.2.1",userAgent:UA,path:"/"};
  for(let i=0;i<240;i++)h.api.record(item);
  assert.equal(h.api.record(item).limited,true);
  assert.equal(h.api.summary(7).totals.pageViews,240);
 }finally{h.dispose();}
});
test("invalid ranges are rejected; persisted aggregates survive restart",()=>{
 const h=setup();
 try{
  h.api.record({ip:"192.0.2.1",userAgent:UA,path:"/"});
  assert.throws(()=>h.api.summary(400),/range/);
  const reload=createSiteAnalytics({stateDir:h.dir,clock:()=>new Date("2026-11-22T12:00:00Z")});
  assert.equal(reload.summary(7).totals.pageViews,1);
 }finally{h.dispose();}
});


test("active time is aggregated by page without double counting beacons or changing visits",()=>{
 const h=setup();
 const viewId="de305d54-75b4-431b-adb2-eb6b9e546014";
 try{
  const base={ip:"192.0.2.1",userAgent:UA,path:"/",viewId};
  h.api.record({...base,type:"pageview"});
  h.move(15000);
  assert.equal(h.api.record({...base,type:"engagement",seconds:15}).engagementSeconds,15);
  assert.equal(h.api.record({...base,type:"engagement",seconds:15}).counted,false);
  h.move(15000);
  assert.equal(h.api.record({...base,type:"engagement",seconds:30}).engagementSeconds,15);
  const data=h.api.summary(7);
  assert.deepEqual(data.totals,{pageViews:1,visits:1,uniqueVisitorDays:1});
  assert.equal(data.engagement.totalSeconds,30);
  assert.equal(data.engagement.averagePageSeconds,30);
  assert.equal(data.engagement.averageVisitSeconds,30);
  assert.equal(data.topPages[0].averageEngagementSeconds,30);
 }finally{h.dispose();}
});
test("duration reports must match a counted page view and never invent traffic",()=>{
 const h=setup();
 const viewId="de305d54-75b4-431b-adb2-eb6b9e546014";
 try{
  const base={ip:"192.0.2.1",userAgent:UA,path:"/transfer",viewId};
  assert.equal(h.api.record({...base,type:"engagement",seconds:120}).counted,false);
  h.api.record({...base,type:"pageview"});
  assert.equal(h.api.record({...base,type:"pageview"}).duplicate,true);
  h.move(1000);
  assert.equal(h.api.record({...base,path:"/join",type:"engagement",seconds:10}).counted,false);
  assert.equal(h.api.record({...base,type:"engagement",seconds:-4}).counted,false);
  assert.equal(h.api.record({...base,type:"engagement",seconds:14401}).counted,false);
  const result=h.api.record({...base,type:"engagement",seconds:500});
  assert.ok(result.engagementSeconds<=3);
  assert.equal(h.api.summary(7).totals.pageViews,1);
 }finally{h.dispose();}
});
test("legacy analytics state without engagement fields remains readable",()=>{
 const h=setup();
 try{
  h.api.record({ip:"192.0.2.1",userAgent:UA,path:"/"});
  const data=h.api.summary(7);
  assert.equal(data.engagement.totalSeconds,0);
  assert.equal(data.engagement.averagePageSeconds,null);
  assert.equal(data.topPages[0].averageEngagementSeconds,null);
  assert.equal(data.topPages[0].count,1);
 }finally{h.dispose();}
});
