-- Node-owned source indexing; XITA stores only an idempotent SQL read model.
-- No on-chain state, validator attestations, receipts or operator keys.
CREATE TABLE IF NOT EXISTS public.xita_node_index_cursors(
 source_chain TEXT PRIMARY KEY CHECK(source_chain ~ '^[a-z][a-z0-9-]{0,39}$'),
 feed_cursor CHAR(20) NOT NULL DEFAULT '00000000000000000000'
  CHECK(feed_cursor ~ '^[0-9]{20}$'),
 indexed_to BIGINT NOT NULL DEFAULT 0 CHECK(indexed_to>=0),
 catalog_sha256 CHAR(64) NOT NULL CHECK(catalog_sha256 ~ '^[0-9a-f]{64}
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON public.xita_node_index_cursors FROM PUBLIC;
DO $g$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
  GRANT SELECT,INSERT,UPDATE ON public.xita_node_index_cursors TO xita_transfer_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_indexer_reader') THEN
  GRANT SELECT ON public.xita_node_index_cursors TO xita_indexer_reader;
 END IF;
END $g$;),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON public.xita_node_index_cursors FROM PUBLIC;
DO $g$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
  GRANT SELECT,INSERT,UPDATE ON public.xita_node_index_cursors TO xita_transfer_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_indexer_reader') THEN
  GRANT SELECT ON public.xita_node_index_cursors TO xita_indexer_reader;
 END IF;
END $g$;