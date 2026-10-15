-- XITA canonical message index. This is a DERIVED and REBUILDABLE read model,
-- never a source of authority for token custody, settlement, mint/unlock, or TVL.
-- A separate finality-aware, read-only RPC worker writes verified event facts.
-- Public HTTP API role gets SELECT only. Provision with an operator-controlled
-- PostgreSQL connection, not an end-user wallet or a signing credential.
CREATE TABLE IF NOT EXISTS xita_transfer_operations (
 source_chain TEXT NOT NULL CHECK (source_chain ~ '^[a-z0-9-]{1,40}$'),
 message_id CHAR(66) NOT NULL CHECK (message_id ~ '^0x[0-9a-f]{64}$'),
 source_tx_hash CHAR(66) NOT NULL CHECK (source_tx_hash ~ '^0x[0-9a-f]{64}$'),
 source_block_number BIGINT NOT NULL CHECK (source_block_number >= 0),
 source_block_hash CHAR(66) NOT NULL CHECK (source_block_hash ~ '^0x[0-9a-f]{64}$'),
 source_log_index INTEGER NOT NULL CHECK (source_log_index >= 0),
 account CHAR(42) NOT NULL CHECK (account ~ '^0x[0-9a-f]{40}$'),
 asset VARCHAR(48) NOT NULL CHECK (asset ~ '^[A-Za-z0-9_-]{1,48}$'),
 asset_id CHAR(66) NOT NULL CHECK (asset_id ~ '^0x[0-9a-f]{64}$'),
 route_name VARCHAR(72) NOT NULL CHECK (route_name ~ '^[a-z0-9_-]{1,72}$'),
 route_id CHAR(66) NOT NULL CHECK (route_id ~ '^0x[0-9a-f]{64}$'),
 gateway CHAR(42) NOT NULL CHECK (gateway ~ '^0x[0-9a-f]{40}$'),
 destination_chain TEXT NOT NULL CHECK (destination_chain ~ '^[a-z0-9-]{1,40}$'),
 destination_mailbox CHAR(42) NOT NULL CHECK (destination_mailbox ~ '^0x[0-9a-f]{40}$'),
 amount_raw NUMERIC(78,0),
 validator_fee_wei NUMERIC(78,0),
 delivered BOOLEAN,              -- NULL means UNKNOWN, never "failed".
 delivery_checked_at TIMESTAMPTZ,
 source_indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (source_chain,message_id),
 UNIQUE (source_chain,source_tx_hash,message_id),
 CHECK (amount_raw IS NULL OR amount_raw > 0),
 CHECK (validator_fee_wei IS NULL OR validator_fee_wei >= 0),
 CHECK (delivered IS NULL OR delivery_checked_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS xita_transfer_operations_wallet_idx
 ON xita_transfer_operations (account,source_block_number DESC);
CREATE INDEX IF NOT EXISTS xita_transfer_operations_pending_idx
 ON xita_transfer_operations (delivered,destination_chain)
 WHERE delivered IS DISTINCT FROM TRUE;

-- The scanned boundary belongs to EACH specific deployed Gateway/routeId;
-- rescan on a reorg or manifest change. No cursor is a custody proof.
CREATE TABLE IF NOT EXISTS xita_transfer_index_cursors (
 source_chain TEXT NOT NULL CHECK (source_chain ~ '^[a-z0-9-]{1,40}$'),
 route_name VARCHAR(72) NOT NULL CHECK (route_name ~ '^[a-z0-9_-]{1,72}$'),
 gateway CHAR(42) NOT NULL CHECK (gateway ~ '^0x[0-9a-f]{40}$'),
 route_id CHAR(66) NOT NULL CHECK (route_id ~ '^0x[0-9a-f]{64}$'),
 deployment_block BIGINT NOT NULL CHECK (deployment_block >= 0),
 scanned_to BIGINT NOT NULL,
 scanned_hash CHAR(66),
 finalized_head BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (source_chain,route_id),
 CHECK (scanned_to >= deployment_block-1),
 CHECK (scanned_hash IS NULL OR scanned_hash ~ '^0x[0-9a-f]{64}$')
);
-- Example: grant the HTTP reader SELECT only, the independent worker INSERT,
-- UPDATE and DELETE only on these TWO derived tables. Never grant those write
-- permissions on verified liquidity, publication policy or governance tables.
-- GRANT SELECT ON xita_transfer_operations,xita_transfer_index_cursors TO xita_indexer_reader;
-- GRANT SELECT,INSERT,UPDATE,DELETE ON xita_transfer_operations,xita_transfer_index_cursors TO xita_transfer_worker;
