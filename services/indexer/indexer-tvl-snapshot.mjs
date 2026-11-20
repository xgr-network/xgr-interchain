// The transfer indexer is the sole owner of operational escrow RPC reads.
// A SELECT-only publisher may trust the snapshot for display but never for
// validator signatures, settlement, minting, or custody authorization.
import {createHash} from "node:crypto";
const MAX_SNAPSHOT_AGE_MS=120000;
export function catalogFingerprint(catalog){
 return createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
}
export async function storeIndexerTvlSnapshot({pool,catalog,snapshot}){
 const at=Date.parse(snapshot?.asOf);
 if(snapshot?.kind!=="xita-asset-metrics-v1"||
    snapshot?.schemaVersion!==1||!Number.isFinite(at)||
    Math.abs(Date.now()-at)>MAX_SNAPSHOT_AGE_MS)
  throw Error("Invalid verified TVL snapshot");
 await pool.query({text:`INSERT INTO public.xita_indexer_tvl_snapshot
  (singleton,catalog_sha256,as_of,payload) VALUES(TRUE,$1,$2,$3::jsonb)
  ON CONFLICT(singleton) DO UPDATE SET
   catalog_sha256=EXCLUDED.catalog_sha256,as_of=EXCLUDED.as_of,
   payload=EXCLUDED.payload,published_at=NOW()
  WHERE public.xita_indexer_tvl_snapshot.as_of<=EXCLUDED.as_of`,
  values:[catalogFingerprint(catalog),snapshot.asOf,JSON.stringify(snapshot)]});
}
export function validateIndexerTvlSnapshot({catalog,row,now=Date.now()}){
 if(!row||String(row.catalog_sha256)!==catalogFingerprint(catalog))
  throw Error("Indexer collateral catalog mismatch");
 const at=Date.parse(row.as_of),snapshot=row.payload;
 if(!Number.isFinite(at)||at>now+30000||now-at>MAX_SNAPSHOT_AGE_MS||
    snapshot?.kind!=="xita-asset-metrics-v1"||snapshot.schemaVersion!==1||
    snapshot.asOf!==new Date(at).toISOString()||!snapshot.custodyEvidence||
    typeof snapshot.assets!=="object")
  throw Error("Indexer collateral snapshot stale or malformed");
 return snapshot;
}
export async function readIndexerTvlSnapshot({pool,catalog,now=Date.now()}){
 const response=await pool.query(`SELECT catalog_sha256,as_of,payload
  FROM public.xita_indexer_tvl_snapshot WHERE singleton=TRUE`);
 if(response.rows.length!==1)throw Error("No indexed collateral snapshot");
 return validateIndexerTvlSnapshot({catalog,row:response.rows[0],now});
}
