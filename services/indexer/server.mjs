import {systemRanking} from "../../apps/web/system-rankings.js";
// Read-only XITA metrics projector. No trust in remote claims: input must be a
// trusted, locally maintained evidence file produced by a finalized-chain verifier.
// No write API, no GitHub credentials, no simulated numbers, no legacy collateral.
import {createServer} from "node:http";
import {readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildLeaderboardRows,verifiedMetrics} from "../../apps/web/leaderboard-data.js";
import {getCoinGeckoPrices} from "./coingecko.mjs";
const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const PORT=Number(process.env.XITA_INDEXER_PORT||4088);
const HOST=process.env.XITA_INDEXER_HOST||"127.0.0.1";
const evidencePath=process.env.XITA_METRICS_EVIDENCE||null;
const assetKeys=()=>Object.keys(JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8")).assets);
function readEvidence(){
 if(!evidencePath)return null;
 const info=statSync(evidencePath);
 if(!info.isFile()||info.size>2_000_000)throw Error("Metrics evidence size invalid");
 const data=JSON.parse(readFileSync(evidencePath,"utf8"));
 if(data?.schemaVersion!==1||data?.kind!=="xita-asset-metrics-v1"||typeof data.assets!=="object")
  throw Error("Unexpected evidence schema");
 return data;
}
export function projectMetrics(catalog,evidence,marketSnapshot=null){
 const keys=Object.keys(catalog.assets||{});
 const assets={};
 for(const key of keys){
  const original=evidence?.assets?.[key];
  // The current web model accepts only verified, internally self-consistent
  // evidence; no arbitrary /POST metrics API ever bypasses provenance review.
  assets[key]=verifiedMetrics(evidence,key)?structuredClone(original):{
   assetId:key,verified:false,market:{status:"unavailable"},
   custody:{status:"unavailable"},movement:{status:"unavailable"}
  };
  const id=catalog.assets[key].profile?.market?.coingeckoId;
  const price=marketSnapshot?.records?.[id];
  if(price&&catalog.assets[key].profile?.market?.priceSource==="coingecko"){
   // Public market data may be displayed, but it cannot attest custody.
   assets[key].market={status:"market-data",source:"coingecko",
    priceUsd:price.priceUsd,marketCapUsd:price.marketCapUsd,circulating:price.circulating,
    asOf:price.asOf};
  }
 }
 // Keep unknown aggregate unknown; never sum a partial selection as network TVL.
 const facts=buildLeaderboardRows(catalog,{kind:"xita-asset-metrics-v1",schemaVersion:1,assets},{includeUnlisted:true});
 const complete=keys.length>0&&facts.every(f=>f.lockedUsd!==null&&f.movedUsd!==null);
 const totals=complete?{
   lockedUsd:facts.reduce((s,x)=>s+x.lockedUsd,0),
   movedUsd:facts.reduce((s,x)=>s+x.movedUsd,0)
 }:null;
 return {schemaVersion:1,kind:"xita-asset-metrics-v1",assets,totals,
  status:complete?"verified":"incomplete",
  metadata:{configuredAssets:keys.length,verifiedAssets:facts.filter(f=>f.lockedUsd!==null&&f.movedUsd!==null).length,
   source:evidence?"trusted-evidence-file":"no-finalized-chain-evidence"}};
}
let cache={until:0,snapshot:null};
export async function handler(req,res){
 const pathname=new URL(req.url,"http://127.0.0.1").pathname;
 const send=(status,data)=>{
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
   "Access-Control-Allow-Origin":"https://xita.xgr.network"});
  res.end(JSON.stringify(data));
 };
 if(req.method!=="GET"||!(pathname==="/api/xeta/v1/metrics/toplist"||pathname==="/health"||pathname.startsWith("/api/xeta/v1/systems/")))
  return send(404,{ok:false,error:"Not found"});
 if(pathname==="/health")return send(200,{ok:true,service:"xita-metrics",mode:"read-only"});
 try{
  const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
  if(Date.now()>=cache.until){
   try{cache.snapshot=await getCoinGeckoPrices(catalog);cache.until=Date.now()+120000;}
   catch{cache.snapshot=null;cache.until=Date.now()+60000;}
  }
  const metrics=projectMetrics(catalog,readEvidence(),cache.snapshot);
  if(pathname.startsWith("/api/xeta/v1/systems/")){
   const chain=pathname.slice("/api/xeta/v1/systems/".length);
   if(!/^[a-z0-9-]{1,60}$/.test(chain))return send(404,{ok:false,error:"Unknown system"});
   const url=new URL(req.url,"http://localhost");
   const result=systemRanking(catalog,metrics,chain,{sort:url.searchParams.get("sort"),search:url.searchParams.get("q")||""});
   return result?send(200,result):send(404,{ok:false,error:"Unknown system"});
  }
  return send(200,metrics);
 }catch(error){
  // Never expose filesystem paths or stale statistics after a verification error.
  return send(503,{ok:false,error:"Trusted metrics evidence unavailable or invalid"});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error("Invalid port");
 createServer((req,res)=>{void handler(req,res)}).listen(PORT,HOST,()=>{
  console.log("XITA metrics read-only at http://"+HOST+":"+PORT);
 });
}
