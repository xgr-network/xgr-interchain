-- Durable UNTRUSTED source-TX hints. No browser statement is accepted as
-- proof of a source lock, custody, transfer or destination delivery.
-- Canonical XITA operation rows are still written ONLY after RPC verification.
CREATE TABLE IF NOT EXISTS xita_transfer_announcements (
 source_chain TEXT NOT NULL CHECK (source_chain ~ '^[a-z0-9-]{1,40}$'),
 source_tx_hash CHAR(66) NOT NULL CHECK (source_tx_hash ~ '^0x[0-9a-f]{64}$'),
 account CHAR(42) NOT NULL CHECK (account ~ '^0x[0-9a-f]{40}$'),
 state TEXT NOT NULL DEFAULT 'reported'
  CHECK (state IN ('reported','observed','indexed','rejected')),
 asset VARCHAR(48),
 destination_chain TEXT,
 first_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_attempt_at TIMESTAMPTZ,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 1000),
 PRIMARY KEY (source_chain,source_tx_hash),
 CHECK (asset IS NULL OR asset ~ '^[A-Za-z0-9_-]{1,48}$'),
 CHECK (destination_chain IS NULL OR destination_chain ~ '^[a-z0-9-]{1,40}$')
);
CREATE INDEX IF NOT EXISTS xita_transfer_announcements_pending_idx
 ON xita_transfer_announcements(next_attempt_at,first_reported_at)
 WHERE state IN ('reported','observed');
CREATE INDEX IF NOT EXISTS xita_transfer_announcements_wallet_idx
 ON xita_transfer_announcements(account,first_reported_at DESC)
 WHERE state = 'observed';

-- Provision THREE distinct least-privilege DB roles.
-- Public intake: INSERT only on this table, no SELECT, UPDATE or DELETE.
-- Existing public index API: SELECT only on this and the canonical tables.
-- Finalized worker: SELECT/UPDATE/DELETE only on this staging table and
-- existing scoped privileges for the two derived canonical tables.
-- Example (use real operator-provisioned roles):
-- GRANT INSERT ON xita_transfer_announcements TO xita_transfer_intake;
-- GRANT SELECT ON xita_transfer_announcements TO xita_indexer_reader;
-- GRANT SELECT,UPDATE,DELETE ON xita_transfer_announcements TO xita_transfer_worker;
-- Do NOT grant the intake service access to xita_transfer_operations,
-- validator keys, fee-wallet keys, contracts or RPC write methods.
