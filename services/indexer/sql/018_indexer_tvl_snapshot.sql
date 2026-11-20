-- 018: Only the canonical transfer indexer obtains live collateral RPC evidence.
-- SELECT-only TVL publisher consumes its timestamped verified snapshot.
CREATE TABLE IF NOT EXISTS public.xita_indexer_tvl_snapshot (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 catalog_sha256 CHAR(64) NOT NULL CHECK(catalog_sha256 ~ '^[0-9a-f]{64}$'),
 as_of TIMESTAMPTZ NOT NULL,
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
 published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON public.xita_indexer_tvl_snapshot FROM PUBLIC;
DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
  GRANT SELECT,INSERT,UPDATE ON public.xita_indexer_tvl_snapshot TO xita_transfer_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_indexer_reader') THEN
  GRANT SELECT ON public.xita_indexer_tvl_snapshot TO xita_indexer_reader;
 END IF;
END $grants$;
