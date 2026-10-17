-- Durable UNTRUSTED source-TX hints. Not authority for collateral or delivery.
-- Canonical xita_transfer_operations require separately checked chain events.
CREATE TABLE IF NOT EXISTS xita_transfer_announcements (
 source_chain TEXT NOT NULL CHECK (source_chain ~ '^[a-z0-9-]{1,40}$'),
 source_tx_hash CHAR(66) NOT NULL CHECK (source_tx_hash ~ '^0x[0-9a-f]{64}$'),
 account CHAR(42) NOT NULL CHECK (account ~ '^0x[0-9a-f]{40}$'),
 state TEXT NOT NULL DEFAULT 'reported'
  CHECK (state IN ('reported','observed','indexed','rejected')),
 first_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 verified_block_number BIGINT CHECK (verified_block_number IS NULL OR verified_block_number >= 0),
 verified_block_hash CHAR(66) CHECK (verified_block_hash IS NULL OR verified_block_hash ~ '^0x[0-9a-f]{64}$'),
 verified_message_id CHAR(66) CHECK (verified_message_id IS NULL OR verified_message_id ~ '^0x[0-9a-f]{64}$'),
 last_attempt_at TIMESTAMPTZ,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 1000),
 PRIMARY KEY (source_chain,source_tx_hash,account)
);
CREATE INDEX IF NOT EXISTS xita_transfer_announcements_pending_idx
 ON xita_transfer_announcements(next_attempt_at,first_reported_at)
 WHERE state IN ('reported','observed');
CREATE INDEX IF NOT EXISTS xita_transfer_announcements_wallet_idx
 ON xita_transfer_announcements(account,first_reported_at DESC)
 WHERE state='observed';
-- Public intake DB role: INSERT only on xita_transfer_announcements.
-- HTTP reader DB role: SELECT only on this and existing derived tables.
-- Finalized worker DB role: SELECT, UPDATE, DELETE on this table,
-- and its existing scoped write permissions on canonical derived tables.
-- Grant privileges explicitly with the database operator. No keys or
-- privilege to write xita_transfer_operations belong in the intake process.
-- GRANT INSERT ON xita_transfer_announcements TO xita_transfer_intake;
-- GRANT SELECT ON xita_transfer_announcements TO xita_indexer_reader;
-- GRANT SELECT,UPDATE,DELETE ON xita_transfer_announcements TO xita_transfer_worker;
