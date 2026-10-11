-- Read-only XITA publication projection input (PostgreSQL).
-- Only a separate finalized-chain verifier may write this table.
-- Do NOT import historical escrow snapshots, wrapped supply, wallet donations
-- or arbitrary external token prices as verified collateral.
CREATE TABLE IF NOT EXISTS xita_verified_asset_liquidity (
  symbol VARCHAR(16) PRIMARY KEY CHECK (symbol ~ '^[A-Z][A-Z0-9]{0,15}$'),
  asset_id VARCHAR(66) NOT NULL UNIQUE CHECK (asset_id ~ '^0x[0-9a-f]{64}$'),
  locked_usd NUMERIC(36,8) NOT NULL CHECK (locked_usd >= 0),
  finalized_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  complete BOOLEAN NOT NULL DEFAULT FALSE,
  valuation_verified BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_digest VARCHAR(66) NOT NULL CHECK (evidence_digest ~ '^0x[0-9a-f]{64}$')
);
-- Provision a separate SELECT-only role for XITA_INDEXER_DATABASE_URL:
-- GRANT SELECT ON xita_verified_asset_liquidity TO xita_indexer_reader;
-- Insert/update grants belong EXCLUSIVELY to an audited finality verifier.
