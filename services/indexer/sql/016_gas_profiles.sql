-- Rolling, non-custodial gas measurement history. No user addresses or amounts.
-- Samples are keyed by the versioned EVM operation profile.
CREATE TABLE IF NOT EXISTS public.xita_gas_observations (
 profile_key TEXT NOT NULL CHECK (length(profile_key) BETWEEN 16 AND 450),
 chain_name TEXT NOT NULL CHECK (chain_name ~ '^[a-z][a-z0-9-]{1,39}$'),
 tx_hash CHAR(66) NOT NULL CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
 block_number BIGINT NOT NULL CHECK (block_number > 0),
 block_hash CHAR(66) NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
 gas_used BIGINT NOT NULL CHECK (gas_used BETWEEN 21000 AND 5000000),
 observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (profile_key, chain_name, tx_hash)
);
CREATE INDEX IF NOT EXISTS xita_gas_observations_recent_idx
 ON public.xita_gas_observations (profile_key, observed_at DESC, tx_hash DESC);
CREATE TABLE IF NOT EXISTS public.xita_gas_profiles (
 profile_key TEXT PRIMARY KEY CHECK (length(profile_key) BETWEEN 16 AND 450),
 sample_count INTEGER NOT NULL CHECK (sample_count BETWEEN 0 AND 1000),
 p95_gas_units BIGINT NOT NULL CHECK (p95_gas_units BETWEEN 21000 AND 5000000),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON public.xita_gas_observations, public.xita_gas_profiles FROM PUBLIC;
-- Prune and recompute are atomic, after a verified unique transaction receipt.
-- Serialize per profile to prevent parallel workers retaining >1000 samples.
CREATE OR REPLACE FUNCTION public.xita_record_gas_observation(
 p_profile TEXT,p_chain TEXT,p_tx CHAR(66),p_block BIGINT,
 p_hash CHAR(66),p_gas BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE n INTEGER; q BIGINT;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_profile,0));
 INSERT INTO public.xita_gas_observations
  (profile_key,chain_name,tx_hash,block_number,block_hash,gas_used)
 VALUES (p_profile,p_chain,p_tx,p_block,p_hash,p_gas)
 ON CONFLICT (profile_key,chain_name,tx_hash) DO UPDATE
 SET block_number=EXCLUDED.block_number,
     block_hash=EXCLUDED.block_hash,
     gas_used=EXCLUDED.gas_used;
 DELETE FROM public.xita_gas_observations o
 WHERE o.profile_key=p_profile AND (o.chain_name,o.tx_hash) IN (
  SELECT chain_name,tx_hash FROM public.xita_gas_observations
  WHERE profile_key=p_profile
  ORDER BY observed_at DESC,tx_hash DESC
  OFFSET 1000
 );
 SELECT COUNT(*)::integer,
  COALESCE(ceil(percentile_cont(0.95) WITHIN GROUP (ORDER BY gas_used))::bigint,1200000)
 INTO n,q FROM public.xita_gas_observations
 WHERE profile_key=p_profile;
 INSERT INTO public.xita_gas_profiles(profile_key,sample_count,p95_gas_units)
 VALUES (p_profile,n,q)
 ON CONFLICT(profile_key) DO UPDATE SET
  sample_count=EXCLUDED.sample_count,p95_gas_units=EXCLUDED.p95_gas_units,
  updated_at=NOW();
END $fn$;
-- A destination Mailbox cursor is independent of source Gateway cursors.
-- It observes finalized ProcessId receipts, for sponsored and non-sponsored transfers.
CREATE TABLE IF NOT EXISTS public.xita_gas_observation_cursors (
 chain_name TEXT NOT NULL CHECK (chain_name ~ '^[a-z][a-z0-9-]{1,39}$'),
 mailbox CHAR(42) NOT NULL CHECK (mailbox ~ '^0x[0-9a-f]{40}$'),
 scanned_to BIGINT NOT NULL CHECK (scanned_to >= 0),
 scanned_hash CHAR(66) CHECK (scanned_hash IS NULL OR scanned_hash ~ '^0x[0-9a-f]{64}$'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(chain_name,mailbox)
);
CREATE TABLE IF NOT EXISTS public.xita_gas_onward_cursors (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 indexed_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch'::timestamptz,
 source_tx_hash CHAR(66) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000000000000000000000000000'
);
REVOKE ALL ON public.xita_gas_observation_cursors,public.xita_gas_onward_cursors FROM PUBLIC;
REVOKE ALL ON FUNCTION public.xita_record_gas_observation(
 TEXT,TEXT,CHAR(66),BIGINT,CHAR(66),BIGINT) FROM PUBLIC;
DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON
   public.xita_gas_observations,public.xita_gas_observation_cursors,
   public.xita_gas_onward_cursors TO xita_transfer_worker;
  GRANT SELECT,INSERT,UPDATE ON public.xita_gas_profiles TO xita_transfer_worker;
  GRANT EXECUTE ON FUNCTION public.xita_record_gas_observation(
   TEXT,TEXT,CHAR(66),BIGINT,CHAR(66),BIGINT) TO xita_transfer_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_tax_quote_writer') THEN
  GRANT SELECT ON public.xita_gas_profiles TO xita_tax_quote_writer;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_indexer_reader') THEN
  GRANT SELECT ON public.xita_gas_profiles TO xita_indexer_reader;
 END IF;
END $grants$;
