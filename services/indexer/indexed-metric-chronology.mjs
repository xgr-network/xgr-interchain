// Derive chart chronology from the SAME finalized SQL rows already read for
// 24-hour movement and indexed collateral. No additional queries or chain RPC.
// Source block time is canonical when present; first-seen time is explicitly
// flagged as an observation-time substitute for pre-migration rows.
import {isDeployedAsset} from "../../apps/web/listing-visibility.js";
import {escrowDescriptor,priceEscrow} from "./tvl-verifier.mjs";
import {indexedGrossFlowLifetime} from "./indexed-flow-24h.mjs";

const DAY=86400000;
const at=v=>typeof v==="string"&&v?Date.parse(v):NaN;
const valid=t=>Number.isFinite(t)&&t>0;
const UINT=/^(0|[1-9][0-9]*)$/;
const key=r=>r.source+":"+String(r.routeId).toLowerCase();
const rateValue=(raw,d,price,now)=>{
 if(raw<0n)return null;
 const result=priceEscrow({status:"verified",netLockedRaw:raw.toString(),decimals:d.decimals},price,{now});
 return result.status==="verified"&&Number.isFinite(result.lockedUsd)&&result.lockedUsd>=0?result.lockedUsd:null;
};
const timestamp=(row,inflow)=>{
 const canonical=at(inflow?row.source_block_at:row.escrow_outflow_observed_at);
 if(valid(canonical))return {at:canonical,kind:"canonical-or-delivery-observed"};
 if(inflow){
  const observed=at(row.source_indexed_at);
  if(valid(observed))return {at:observed,kind:"index-observed"};
 }
 return {at:null,kind:"undated"};
};

// A single trusted extraction is reused for both collateral and gross volume.
// Never attach an unknown destination payout to the latest delivery poll.
function extract(catalog,snapshot,prices,now){
 const ids=Object.keys(catalog?.assets||{}).filter(k=>isDeployedAsset(catalog.assets[k],catalog));
 if(!ids.length||!snapshot?.indexedChronologyInputs||
  snapshot.indexedTvl?.kind!=="xita-indexed-tvl-v1")return null;
 const assets=[],events=[];let observed=0,undated=0;
 for(const id of ids){
  const d=escrowDescriptor(catalog,id),input=snapshot.indexedChronologyInputs[id];
  const pos=snapshot.indexedTvl.positions?.[id];
  if(d.status!=="ready"||!input||pos?.assetId!==d.assetId||!UINT.test(String(pos.netLockedRaw??"")))
   return null;
  const proof=indexedGrossFlowLifetime({descriptor:d,rows:input.rows,coverage:input.coverage});
  if(proof.status!=="verified")return null;
  const price=prices?.records?.[d.coingeckoId];
  if(rateValue(1n,d,price,now)===null)return null;
  const routes=new Map(d.escrowRoutes.map(r=>[key(r),r]));
  const balance=BigInt(pos.netLockedRaw);
  assets.push({id,d,price,balance});
  for(const row of input.rows){
   const route=routes.get(row.source_chain+":"+String(row.route_id).toLowerCase());
   if(!route)return null; // validated above; also guard caller changes
   const inflow=route.source===d.chain;
   if(!inflow&&!((route.destination===d.chain)&&row.delivered===true))continue;
   const raw=BigInt(row.amount_raw);
   const time=timestamp(row,inflow);
   if(time.kind==="index-observed")observed++;
   if(time.kind==="undated"||time.at>now+30000)undated++;
   events.push({id,raw,sign:inflow?1n:-1n,
    time:time.at!==null&&time.at<=now+30000?time.at:null,
    timeBasis:time.kind,d,price});
  }
 }
 return {assets,events,observed,undated};
}

const compact=(points,now)=>{
 const byBucket=new Map();
 for(const p of points){
  const t=at(p.asOf);if(!valid(t))continue;
  const bucket=t>=now-48*3600000?Math.floor(t/60000):Math.floor(t/3600000);
  const k=(t>=now-48*3600000?"m:":"h:")+bucket;
  byBucket.set(k,p); // Last genuine observation in the bucket
 }
 return [...byBucket.values()].sort((a,b)=>Date.parse(a.asOf)-Date.parse(b.asOf)).slice(-6500);
};

export function indexedTvlChronology({catalog,snapshot,prices,now=Date.now(),days=30}){
 const parsed=extract(catalog,snapshot,prices,now);
 if(!parsed||!Number.isInteger(days)||days<1||days>90)return null;
 const end=at(snapshot.asOf);
 if(!valid(end)||Math.abs(end-now)>120000)return null;
 const start=end-days*DAY;
 const current=new Map(parsed.assets.map(a=>[a.id,a.balance]));
 const changes=new Map();
 const inRange=parsed.events.filter(e=>e.time!==null&&e.time>=start&&e.time<=end);
 for(const e of inRange){
  current.set(e.id,current.get(e.id)-e.sign*e.raw);
  if(!changes.has(e.time))changes.set(e.time,[]);
  changes.get(e.time).push(e);
 }
 if([...current.values()].some(x=>x<0n))return null;
 const pricesAt=t=>{
  let usd=0;
  for(const a of parsed.assets){
   const value=rateValue(current.get(a.id),a.d,a.price,now);
   if(value===null)return null;
   usd+=value;
  }
  return Number.isFinite(usd)&&usd>=0?{asOf:new Date(t).toISOString(),lockedUsd:usd}:null;
 };
 const points=[];const first=pricesAt(start);if(!first)return null;
 points.push(first);
 for(const time of [...changes.keys()].sort((a,b)=>a-b)){
  for(const e of changes.get(time))current.set(e.id,current.get(e.id)+e.sign*e.raw);
  if([...current.values()].some(x=>x<0n))return null;
  const p=pricesAt(time);if(!p)return null;
  points.push(p);
 }
 const last=pricesAt(end);if(!last)return null;
 // Reverse reconstruction must reconcile to today's independently indexed raw
 // balances and their current verifiable USD valuation.
 const snapshotUsd=parsed.assets.reduce((sum,a)=>sum+(rateValue(a.balance,a.d,a.price,now)??NaN),0);
 if(!Number.isFinite(snapshotUsd)||Math.abs(last.lockedUsd-snapshotUsd)>Math.max(.00001,snapshotUsd*.0000001))return null;
 points.push(last);
 return {kind:"xita-tvl-history-v1",schemaVersion:1,source:"indexed-reconstruction",
  valuation:"latest-verified-usd-price",timeBasis:parsed.observed?"mixed-observed-and-canonical":"recorded-event-times",
  hasUndatedEvents:parsed.undated>0,asOf:new Date(end).toISOString(),
  points:compact(points,now)};
}

// The original already-published lifetime USD amount is authoritative. Its
// first verified valuation can be distributed across historic indexed event
// times once, using relative spot-price weights. These are a reconstructed
// *shape*, NOT historical FX rates. Undated events remain a baseline, not
// fabricated dated transfers. The generated points are then persisted.
export function indexedMovedBackfill({catalog,snapshot,prices,totalUsd,now=Date.now()}){
 const parsed=extract(catalog,snapshot,prices,now);
 if(!parsed||!Number.isFinite(totalUsd)||totalUsd<0)return null;
 const end=at(snapshot.asOf);
 if(!valid(end)||Math.abs(end-now)>120000)return null;
 let all=0,undated=0;const weights=[];
 for(const e of parsed.events){
  const weight=rateValue(e.raw,e.d,e.price,now);
  if(weight===null)return null;
  all+=weight;
  if(e.time===null||e.time>end){undated+=weight;continue;}
  weights.push({time:e.time,weight});
 }
 if(!(all>0))return totalUsd===0?{
  points:[{asOf:new Date(end).toISOString(),totalUsd:0}],historicalBasis:"no-movements"}:null;
 const grouped=new Map();
 for(const e of weights)grouped.set(e.time,(grouped.get(e.time)||0)+e.weight);
 const sorted=[...grouped].sort((a,b)=>a[0]-b[0]);
 if(!sorted.length)return null;
 // Undated history starts as an unlocated baseline at the earliest verified
 // observation; do not falsely timestamp those underlying movements.
 let running=undated;const points=[];
 for(const [time,weight] of sorted){
  running+=weight;
  const usd=Math.min(totalUsd,Math.max(0,totalUsd*running/all));
  points.push({asOf:new Date(time).toISOString(),totalUsd:usd});
 }
 points.push({asOf:new Date(end).toISOString(),totalUsd});
 return {points:compact(points,now),historicalBasis:"reconstructed-relative-usd",
  hasUndatedEvents:parsed.undated>0,usesObservedTime:parsed.observed>0};
}
