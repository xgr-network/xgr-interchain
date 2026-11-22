// Durable, strictly nondecreasing gross escrow throughput observations.
// Every addition is valued ONCE at the fresh already-fetched USD price.
// Current prices never revalue previously persisted movement. Reads only
// existing finalized-indexed operations via tvl-worker; no chain RPC here.
import {readFileSync,writeFileSync,renameSync,unlinkSync,existsSync} from "node:fs";
import {isDeployedAsset} from "../../apps/web/listing-visibility.js";
import {escrowDescriptor,priceEscrow} from "./tvl-verifier.mjs";

const UINT=/^(0|[1-9][0-9]*)$/;
const DECIMAL=/^(0|[1-9][0-9]*)\.[0-9]{8}$/;
const atoms=s=>DECIMAL.test(s||"")?BigInt(s.replace(".","")):null;
const decimal=n=>(n/100000000n).toString()+"."+(n%100000000n).toString().padStart(8,"0");

export function accumulateVerifiedMovement(snapshot,catalog,prices,prior=null,{now=Date.now()}={}){
 const assetKeys=Object.keys(catalog?.assets||{}).filter(k=>isDeployedAsset(catalog.assets[k],catalog));
 const empty={kind:"xita-total-moved-history-v1",schemaVersion:1,status:"unavailable",
  totalUsd:null,asOf:null,assets:{},points:[]};
 if(!assetKeys.length)return empty;
 const old=prior?.kind===empty.kind&&prior.schemaVersion===1&&prior.status==="verified"?prior:null;
 const previous=old?.assets&&typeof old.assets==="object"?old.assets:{};
 const asOf=Date.parse(snapshot?.asOf);
 if(!Number.isFinite(asOf)||Math.abs(now-asOf)>120000)return old||empty;
 if(old?.asOf&&asOf<=Date.parse(old.asOf))return old;
 let additions=0n;
 const updated={};
 for(const asset of assetKeys){
  const descriptor=escrowDescriptor(catalog,asset);
  const flow=snapshot?.lifetimeFlows?.[asset];
  if(descriptor.status!=="ready"||flow?.status!=="verified"||
   flow.kind!=="escrow-gross-lifetime-raw"||
   flow.assetId?.toLowerCase()!==descriptor.assetId?.toLowerCase()||
   !UINT.test(flow.grossRaw||""))return old||empty;
  const raw=BigInt(flow.grossRaw),last=previous[asset];
  if(last&&last.assetId!==descriptor.assetId.toLowerCase())return old||empty;
  if(last&&(!UINT.test(last.grossRaw)||raw<BigInt(last.grossRaw)))return old||empty;
  const priorRaw=last?BigInt(last.grossRaw):0n;
  const delta=raw-priorRaw;
  if(delta>0n){
   const price=prices?.records?.[descriptor.coingeckoId];
   const value=priceEscrow({status:"verified",netLockedRaw:delta.toString(),decimals:descriptor.decimals},price,{now});
   const amount=value.status==="verified"?atoms(value.lockedUsdExact):null;
   if(amount===null)return old||empty;
   additions+=amount;
  }
  updated[asset]={assetId:descriptor.assetId.toLowerCase(),grossRaw:raw.toString()};
 }
 // The only valid baseline comes from locally verified, committed observations.
 // Removed assets or a changed deployment generation must not carry stale USD.
 if(Object.keys(previous).some(k=>!assetKeys.includes(k)))return old||empty;
 const lastTotal=old?atoms(old.totalUsdExact):0n;
 if(lastTotal===null)return old||empty;
 const total=lastTotal+additions;
 if(total<0n||!Number.isFinite(Number(decimal(total))))return old||empty;
 const current={kind:empty.kind,schemaVersion:1,status:"verified",
  asOf:new Date(asOf).toISOString(),totalUsd:Number(decimal(total)),
  totalUsdExact:decimal(total),assets:updated};
 const earlier=Array.isArray(old?.points)?old.points.filter(p=>
  Number.isFinite(Date.parse(p?.asOf))&&Number.isFinite(p?.totalUsd)&&p.totalUsd>=0):[];
 const points=[...earlier,{asOf:current.asOf,totalUsd:current.totalUsd}];
 // Keep recent resolution; retain one historical observation per hour.
 const byHour=new Map(),recent=[];
 for(const p of points){
  const at=Date.parse(p.asOf);
  if(at>=asOf-48*3600000)recent.push(p);
  else byHour.set(Math.floor(at/3600000),p);
 }
 current.points=[...byHour.values(),...recent].slice(-6500);
 return current;
}

export function appendVerifiedMovedHistory(path,snapshot,catalog,prices){
 let old=null;
 try{if(existsSync(path))old=JSON.parse(readFileSync(path,"utf8"));}catch{return null;}
 const next=accumulateVerifiedMovement(snapshot,catalog,prices,old);
 if(next===old)return old;
 const temp=path+".tmp."+process.pid;
 try{writeFileSync(temp,JSON.stringify(next)+"\n",{mode:0o600});renameSync(temp,path);}
 finally{if(existsSync(temp))unlinkSync(temp);}
 return next;
}
