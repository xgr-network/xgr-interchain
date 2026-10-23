-- Read-only unsigned proof preparation journal. Every key references one
-- independently finalized Gateway operation. Reorg removal cascades.
-- This is a derived, rebuildable JOB STATUS table, NEVER signing authority,
-- a durable private key, an attestation, or proof of Mailbox delivery.
CREATE TABLE IF NOT EXISTS xita_transfer_proof_observations (
 source_chain TEXT NOT NULL,
 message_id CHAR(66) NOT NULL,
 state VARCHAR(24) NOT NULL DEFAULT 'queued'
   CHECK (state IN ('queued','checking','ready','waiting','unavailable','delivery-observed')),
 reason VARCHAR(64),
 stage VARCHAR(64),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 lease_token VARCHAR(36),
 lease_until TIMESTAMPTZ,
 next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_checked_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (source_chain,message_id),
 FOREIGN KEY (source_chain,message_id)
  REFERENCES xita_transfer_operations (source_chain,message_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS xita_transfer_proof_due_idx
 ON xita_transfer_proof_observations (next_check_at,lease_until)
 WHERE state <> 'delivery-observed';
-- The HTTP reader needs SELECT only; the independent observer writes only
-- this rebuildable table and reads the finalized operation table.
-- GRANT SELECT ON xita_transfer_proof_observations TO xita_indexer_reader;
-- GRANT SELECT,INSERT,UPDATE,DELETE ON xita_transfer_proof_observations TO xita_transfer_worker;
