-- Additive migration for read-only, indexer-backed gross escrow flow.
-- Run ONCE with an operator migration role before restarting the transfer worker.
-- Existing transfers have NULL timestamps: never attribute a backfill to NOW().
-- Timestamps describe independently verified canonical source blocks, or
-- the first observed confirmed destination delivery (not a historical estimate).
ALTER TABLE xita_transfer_operations
  ADD COLUMN IF NOT EXISTS source_block_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escrow_outflow_observed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS xita_transfer_flow_in_24h_idx
  ON xita_transfer_operations (asset,source_block_at)
  WHERE source_block_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS xita_transfer_flow_out_24h_idx
  ON xita_transfer_operations (asset,escrow_outflow_observed_at)
  WHERE escrow_outflow_observed_at IS NOT NULL;
-- Readers already have table-level SELECT and the verified-event writer has
-- table-level INSERT/UPDATE: no additional elevated application role required.
