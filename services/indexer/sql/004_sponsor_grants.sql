-- Private, operator-controlled sponsorship budget and no-retry journal.
-- Apply with the existing xita_transfer_operations migration (003), but
-- GRANT no web role write access to these tables or fee wallet secrets.
CREATE TABLE IF NOT EXISTS xita_sponsor_grants (
 grant_key TEXT PRIMARY KEY CHECK(length(grant_key)<=200),
 chain_name TEXT NOT NULL CHECK(chain_name~'^[a-z0-9-]{1,40}$'),
 sponsor_address CHAR(42) NOT NULL CHECK(sponsor_address~'^0x[0-9a-f]{40}$'),
 recipient CHAR(42) NOT NULL CHECK(recipient~'^0x[0-9a-f]{40}$'),
 amount_wei NUMERIC(78,0) NOT NULL CHECK(amount_wei>0),
 wallet_nonce BIGINT NOT NULL CHECK(wallet_nonce>=0),
 status TEXT NOT NULL CHECK(status IN ('reserved','submitted','confirmed','needs-review')),
 tx_hash CHAR(66) CHECK(tx_hash IS NULL OR tx_hash~'^0x[0-9a-f]{64}$'),
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(chain_name,sponsor_address,wallet_nonce)
);
CREATE INDEX IF NOT EXISTS xita_sponsor_grants_daily_idx
 ON xita_sponsor_grants(chain_name,sponsor_address,created_at DESC);
CREATE INDEX IF NOT EXISTS xita_sponsor_grants_open_idx
 ON xita_sponsor_grants(status,updated_at)
 WHERE status IN ('reserved','submitted','needs-review');
CREATE TABLE IF NOT EXISTS xita_sponsor_monitor_state (
 chain_name TEXT PRIMARY KEY CHECK(chain_name~'^[a-z0-9-]{1,40}$'),
 sponsor_address CHAR(42) NOT NULL,
 gas_ready BOOLEAN NOT NULL DEFAULT FALSE,
 balance_wei NUMERIC(78,0) NOT NULL DEFAULT 0,
 checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- HTTP quote service: SELECT only on xita_sponsor_monitor_state.
-- Sponsor worker: SELECT on finalized canonical xita_transfer_operations,
-- INSERT/UPDATE on xita_sponsor_grants + xita_sponsor_monitor_state.
-- NEVER accept user-provided grant amounts, destinations or RPC URLs.
