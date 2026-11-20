-- 017: gas statistical work belongs to the finalized transfer indexer.
-- Durable, bounded exact-message ProcessId lookups replace idle mailbox
-- eth_getLogs scanning. Not a custody, settlement or validator-signing table.
CREATE TABLE IF NOT EXISTS public.xita_gas_delivery_jobs (
 source_chain TEXT NOT NULL CHECK(source_chain ~ '^[a-z][a-z0-9-]{1,39}$'),
 message_id CHAR(66) NOT NULL CHECK(message_id ~ '^0x[0-9a-f]{64}$'),
 destination_chain TEXT NOT NULL CHECK(destination_chain ~ '^[a-z][a-z0-9-]{1,39}$'),
 mailbox CHAR(42) NOT NULL CHECK(mailbox ~ '^0x[0-9a-f]{40}$'),
 scan_min_block BIGINT NOT NULL CHECK(scan_min_block >= 1),
 scan_next_to BIGINT NOT NULL CHECK(scan_next_to >= 0),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 result TEXT CHECK(result IN ('observed','not-found')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_chain,message_id),
 CHECK(scan_next_to = 0 OR scan_next_to >= scan_min_block-1),
 CHECK((completed_at IS NULL AND result IS NULL) OR
       (completed_at IS NOT NULL AND result IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS xita_gas_delivery_jobs_due_idx
 ON public.xita_gas_delivery_jobs(next_attempt_at,created_at)
 WHERE completed_at IS NULL;
REVOKE ALL ON public.xita_gas_delivery_jobs FROM PUBLIC;
DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
  GRANT SELECT,INSERT,UPDATE ON public.xita_gas_delivery_jobs
   TO xita_transfer_worker;
 END IF;
END $grants$;
