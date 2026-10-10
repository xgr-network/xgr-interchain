// Read-only XITA metrics projector. No trust in remote claims: input must be a
// trusted, locally maintained evidence file produced by a finalized-chain verifier.
// No write API, no GitHub credentials, no simulated numbers, no legacy collateral.
import {createServer} from "node:http";
import {readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildLeaderboardRows,verifiedMetrics} from "../../apps/web/leaderboard-data.js";
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
export function projectMetrics(catalog,evidence){
 const keys=Object.keys(catalog.assets||{});
 const assets={};
 for(const key of keys){
  const original=evidence?.assets?.[key];
  // The current web model accepts only verified, internally self-consistent
  // evidence; no arbitrary /POST metrics API ever bypasses provenance review.
  assets[key]=verifiedMetrics(evidence,key)?original:{
   assetId:key,verified:false,market:{status:"unavailable"},
   custody:{status:"unavailable"},movement:{status:"unavailable"}
  };
 }
 // Keep unknown aggregate unknown; never sum a partial selection as network TVL.
 const facts=buildLeaderboardRows(catalog,{kind:"xita-asset-metrics-v1",schemaVersion:1,assets});
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
export function handler(req,res){
 const pathname=new URL(req.url,"http://127.0.0.1").pathname;
 const send=(status,data)=>{
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
   "Access-Control-Allow-Origin":"https://xita.xgr.network"});
  res.end(JSON.stringify(data));
 };
 if(req.method!=="GET"||!(pathname==="/api/xeta/v1/metrics/toplist"||pathname==="/health"))
  return send(404,{ok:false,error:"Not found"});
 if(pathname==="/health")return send(200,{ok:true,service:"xita-metrics",mode:"read-only"});
 try{
  const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
  return send(200,projectMetrics(catalog,readEvidence()));
 }catch(error){
  // Never expose filesystem paths or stale statistics after a verification error.
  return send(503,{ok:false,error:"Trusted metrics evidence unavailable or invalid"});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error("Invalid port");
 createServer(handler).listen(PORT,HOST,()=>{
  console.log("XITA metrics read-only at http://"+HOST+":"+PORT);
 });
}
