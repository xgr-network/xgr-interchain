// A public listing is a derived view of an approved asset, complete verified
// deployment receipts, and finalized independent escrow valuations from DB.
// An unset policy or missing/stale/untrusted evidence is UNKNOWN, never zero.
import {isDeployedAsset} from "../../apps/web/listing-visibility.js";

const HASH=/^0x[0-9a-f]{64}$/i;
const NUMBER=/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const nowIso=n=>new Date(n).toISOString();
const validUsd=s=>NUMBER.test(String(s??""))&&Number.isFinite(Number(s))&&Number(s)>=0;
function normalizedRow(raw,now,maxAgeMs,id){
 const at=Date.parse(raw?.asOf);
 if(!raw||String(raw.assetId||"").toLowerCase()!==id.toLowerCase()||
    raw.verified!==true||raw.complete!==true||raw.valuationVerified!==true||
    !HASH.test(raw.proofDigest||"")||
    !validUsd(raw.lockedUsd)||!Number.isFinite(at)||
    at>now+30000||now-at>maxAgeMs)return null;
 return {lockedUsd:Number(raw.lockedUsd),asOf:nowIso(at)};
}
export function derivedVisibility(catalog,positions=null,{now=Date.now()}={}){
 const policy=catalog?.publication;
 const minimum=policy?.minimumLockedUsd;
 const maxAge=policy?.maxEvidenceAgeSeconds;
 const policyValid=policy?.kind==="xita-publication-policy"&&policy.schemaVersion===1&&
   (minimum===null||typeof minimum==="number"&&Number.isFinite(minimum)&&minimum>0)&&
   Number.isSafeInteger(maxAge)&&maxAge>=60&&maxAge<=86400;
 const assets={};
 for(const [key,entry] of Object.entries(catalog?.assets||{})){
  const assetId=entry?.metadata?.assetId||null;
  if(!isDeployedAsset(entry)){
   assets[key]={assetId,status:"prospect",deployment:"prospect",lockedUsd:null,asOf:null};
   continue;
  }
  const valid=policyValid&&minimum!==null&&normalizedRow(positions?.[key],now,maxAge*1000,assetId);
  assets[key]=valid?
   {assetId,status:valid.lockedUsd>=minimum?"public":"accepted",deployment:"deployed",...valid}:
   {assetId,status:"unknown",deployment:"deployed",lockedUsd:null,asOf:null};
 }
 return {schemaVersion:1,kind:"xita-visibility-v1",minimumLockedUsd:policyValid?minimum:null,
   status:!policyValid||minimum===null?"threshold-unconfigured":!positions?"evidence-unavailable":"evaluated",
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
