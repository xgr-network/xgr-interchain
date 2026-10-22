// Append-only verified TVL observations. No historical RPC and no interpolation.
import {readFileSync,writeFileSync,renameSync,unlinkSync,existsSync} from "node:fs";
import {verifiedMetrics} from "../../apps/web/leaderboard-data.js";
export function verifiedTvlHistory(snapshot,catalog,oldHistory=null,{limit=2160}={}){
 const previous=Array.isArray(oldHistory?.points)?oldHistory.points.filter(p=>Number.isFinite(p?.lockedUsd)&&p.lockedUsd>=0&&Number.isFinite(Date.parse(p?.asOf))):[];
 const assets=Object.keys(catalog?.assets||{}).filter(k=>catalog.assets[k]?.deployment?.present===true);
 const facts=assets.map(id=>verifiedMetrics(snapshot,id));
 if(!assets.length||facts.some(f=>f?.lockedUsd==null))return {kind:"xita-tvl-history-v1",schemaVersion:1,points:previous.slice(-limit)};
 const at=Date.parse(snapshot?.asOf);
 if(!Number.isFinite(at))return {kind:"xita-tvl-history-v1",schemaVersion:1,points:previous.slice(-limit)};
 const amount=facts.reduce((n,f)=>n+f.lockedUsd,0);
 // Never erase later observations if the clock regresses or an old snapshot is retried.
 if(previous.length&&at<=Date.parse(previous.at(-1).asOf))
  return {kind:"xita-tvl-history-v1",schemaVersion:1,points:previous.slice(-limit)};
 const points=previous.filter(p=>Date.parse(p.asOf)<at);
 // Snapshots are produced from independent escrow reconciliation, not browser claims.
 points.push({asOf:new Date(at).toISOString(),lockedUsd:amount});
 return {kind:"xita-tvl-history-v1",schemaVersion:1,points:points.slice(-limit)};
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
