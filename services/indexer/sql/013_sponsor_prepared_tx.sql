-- Durable signer-owned prepared native gas grants (F-07).
-- Raw signed transactions may be rebroadcast, but never returned by public endpoints.
CREATE TABLE IF NOT EXISTS xita_sponsor_prepared_tx (
 grant_key TEXT PRIMARY KEY REFERENCES xita_sponsor_grants(grant_key) ON DELETE RESTRICT,
 tx_hash CHAR(66) NOT NULL UNIQUE CHECK (tx_hash~'^0x[0-9a-f]{64}$'),
 raw_tx TEXT NOT NULL CHECK (raw_tx~'^0x[0-9a-f]+$' AND length(raw_tx)<=12000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON xita_sponsor_prepared_tx FROM PUBLIC;
DO $migration$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_worker') THEN
  GRANT SELECT,INSERT ON xita_sponsor_prepared_tx TO xita_sponsor_worker;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
  GRANT SELECT,INSERT ON xita_sponsor_prepared_tx TO xita_transfer_worker;
 END IF;
END $migration$;
-- The configured production sponsor worker login also requires SELECT/INSERT;
-- never grant this table to quote signer, web reader, or anonymous roles.
