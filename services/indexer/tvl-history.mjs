// Append-only verified TVL observations. No historical RPC and no interpolation.
import {readFileSync,writeFileSync,renameSync,unlinkSync,existsSync} from "node:fs";
import {verifiedMetrics} from "../../apps/web/leaderboard-data.js";
import {isDeployedAsset} from "../../apps/web/listing-visibility.js";
export function verifiedTvlHistory(snapshot,catalog,oldHistory=null,{limit=6500}={}){
 // Maintain high resolution for 48h, one real observed sample per hour
 // thereafter, up to 90 days. Never synthesize or interpolate snapshots.
 const compact=(samples,now)=>{
  const recent=now-48*3600000,oldest=now-90*86400000,byHour=new Map,retained=[];
  for(const p of samples){
   const at=Date.parse(p.asOf);
   if(!Number.isFinite(at)||at<oldest||at>now)continue;
   if(at>=recent)retained.push(p);
   else byHour.set(Math.floor(at/3600000),p);
  }
  return [...byHour.values(),...retained].sort((a,b)=>Date.parse(a.asOf)-Date.parse(b.asOf)).slice(-limit);
 };
 const previous=Array.isArray(oldHistory?.points)?oldHistory.points.filter(p=>Number.isFinite(p?.lockedUsd)&&p.lockedUsd>=0&&Number.isFinite(Date.parse(p?.asOf))):[];
 // In-progress multi-step deployments can set present=true before any usable
 // route exists. Apply the same verified-route gate as the evidence producer.
 const assets=Object.keys(catalog?.assets||{}).filter(k=>isDeployedAsset(catalog.assets[k],catalog));
 const facts=assets.map(id=>verifiedMetrics(snapshot,id));
 if(!assets.length||facts.some(f=>f?.lockedUsd==null))return {kind:"xita-tvl-history-v1",schemaVersion:1,points:compact(previous,Date.now())};
 const at=Date.parse(snapshot?.asOf);
 if(!Number.isFinite(at))return {kind:"xita-tvl-history-v1",schemaVersion:1,points:previous.slice(-limit)};
 const amount=facts.reduce((n,f)=>n+f.lockedUsd,0);
 // Never erase later observations if the clock regresses or an old snapshot is retried.
 if(previous.length&&at<=Date.parse(previous.at(-1).asOf))
  return {kind:"xita-tvl-history-v1",schemaVersion:1,points:previous.slice(-limit)};
 const points=previous.filter(p=>Date.parse(p.asOf)<at);
 // Snapshots are produced from independent escrow reconciliation, not browser claims.
 points.push({asOf:new Date(at).toISOString(),lockedUsd:amount,assets:Object.fromEntries(assets.map((id,i)=>[id,facts[i].lockedUsd]))});
 return {kind:"xita-tvl-history-v1",schemaVersion:1,points:compact(points,at)};
}
export function appendVerifiedTvlHistory(path,snapshot,catalog){
 let old=null;
 try{if(existsSync(path))old=JSON.parse(readFileSync(path,"utf8"));}catch{return null}
 const next=verifiedTvlHistory(snapshot,catalog,old);
 if(next.points.length===(old?.points?.length||0)&&next.points.at(-1)?.asOf===old?.points?.at(-1)?.asOf)return next;
 const temp=path+".tmp."+process.pid;
 try{writeFileSync(temp,JSON.stringify(next)+"\n",{mode:0o600});renameSync(temp,path);}
 finally{if(existsSync(temp))unlinkSync(temp);}
 return next;
}
