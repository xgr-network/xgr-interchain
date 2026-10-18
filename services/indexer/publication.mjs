// Publication is a pure derived view of receipt-backed deployments and
// separately verified, finalized net escrow valuations. Null means no TVL
// threshold; numeric zero requires strictly positive TVL.
import {isDeployedAsset,validPublicationPolicy,usdUnits} from "../../apps/web/listing-visibility.js";

const HASH=/^0x[0-9a-f]{64}$/i;
const nowIso=n=>new Date(n).toISOString();
function normalizedRow(raw,now,maxAgeMs,id){
 const at=Date.parse(raw?.asOf);
 const locked=usdUnits(raw?.lockedUsd);
 if(!raw||String(raw.assetId||"").toLowerCase()!==String(id||"").toLowerCase()||
    raw.verified!==true||raw.complete!==true||raw.valuationVerified!==true||
    !HASH.test(raw.proofDigest||"")||locked===null||
    !Number.isFinite(Number(raw.lockedUsd))||!Number.isFinite(at)||
    at>now+30000||now-at>maxAgeMs)return null;
 return {lockedUsd:Number(raw.lockedUsd),asOf:nowIso(at)};
}
export function derivedVisibility(catalog,positions=null,{now=Date.now()}={}){
 const policy=catalog?.publication;
 const valid=validPublicationPolicy(policy);
 const minimum=policy?.minimumLockedUsd;
 const maxAge=policy?.maxEvidenceAgeSeconds;
 const assets={};
 for(const [key,entry] of Object.entries(catalog?.assets||{})){
  const assetId=entry?.metadata?.assetId||null;
  if(!isDeployedAsset(entry,catalog)){
   assets[key]={assetId,status:"prospect",deployment:"prospect",lockedUsd:null,asOf:null};
   continue;
  }
  const evidence=valid&&positions?.[key]?
   normalizedRow(positions[key],now,maxAge*1000,assetId):null;
  if(!valid){
   assets[key]={assetId,status:"unknown",deployment:"deployed",lockedUsd:null,asOf:null};
  }else if(minimum===null){
   // An unrestricted deployment listing must not depend on a DB/indexer.
   assets[key]={assetId,status:"public",deployment:"deployed",
    lockedUsd:evidence?.lockedUsd??null,asOf:evidence?.asOf??null};
  }else if(evidence){
   const qualified=usdUnits(positions[key].lockedUsd)>usdUnits(minimum);
   assets[key]={assetId,status:qualified?"public":"accepted",deployment:"deployed",...evidence};
  }else{
   assets[key]={assetId,status:"unknown",deployment:"deployed",lockedUsd:null,asOf:null};
  }
 }
 return {schemaVersion:1,kind:"xita-visibility-v1",minimumLockedUsd:valid?minimum:null,
  status:!valid?"policy-invalid":minimum===null?"unrestricted":
   !positions?"evidence-unavailable":"evaluated",
  asOf:nowIso(now),assets};
}
// Read-only PostgreSQL adapter. The trusted verifier (NOT this HTTP service)
// must produce the complete finalized rows. No writable HTTP ingestion exists.
let pool=null;
export async function readPublicationPositions(url=process.env.XITA_INDEXER_DATABASE_URL){
 if(!url)return null;
 if(!pool){
  const {Pool}=await import("pg");
  pool=new Pool({connectionString:url,max:3,connectionTimeoutMillis:2500,
    idleTimeoutMillis:20000,statement_timeout:5000});
 }
 const result=await pool.query({
  text:"SELECT symbol, asset_id, locked_usd::text AS locked_usd, finalized_at, verified, complete, valuation_verified, evidence_digest FROM xita_verified_asset_liquidity",
  rowMode:"array"
 });
 const rows={};
 for(const record of result.rows){
  const [symbol,assetId,lockedUsd,finalizedAt,verified,complete,valuationVerified,proofDigest]=record;
  if(typeof symbol!=="string"||!/^([A-Z][A-Z0-9]{0,15})$/.test(symbol)||Object.hasOwn(rows,symbol))
   throw Error("Duplicate or invalid verified asset position");
  rows[symbol]={assetId,lockedUsd,asOf:new Date(finalizedAt).toISOString(),
   verified,complete,valuationVerified,proofDigest};
 }
 return rows;
}
