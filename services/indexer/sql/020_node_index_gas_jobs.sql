-- Optional statistical gas samples. A missing ProcessId remains UNKNOWN;
-- it never changes transfer delivery or settlement state.
CREATE TABLE IF NOT EXISTS public.xita_node_gas_jobs(
 source_chain TEXT NOT NULL CHECK(source_chain ~ '^[a-z][a-z0-9-]{0,39}$'),
 message_id CHAR(66) NOT NULL CHECK(message_id ~ '^0x[0-9a-f]{64}$'),
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 PRIMARY KEY(source_chain,message_id),
 FOREIGN KEY(source_chain,message_id)
  REFERENCES public.xita_transfer_operations(source_chain,message_id)
  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS xita_node_gas_jobs_due_idx
 ON public.xita_node_gas_jobs(next_attempt_at)
 WHERE completed_at IS NULL;
REVOKE ALL ON public.xita_node_gas_jobs FROM PUBLIC;
DO $g$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.xita_node_gas_jobs
   TO xita_transfer_worker;
 END IF;
END $g$;