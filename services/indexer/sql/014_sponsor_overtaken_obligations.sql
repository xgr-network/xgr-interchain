-- F-19: durable, append-only evidence of a paid sponsorship stage that
-- was overtaken by completed delivery without a confirmed gas grant.
-- This never authorizes a late payout or settles financial obligations.
CREATE TABLE IF NOT EXISTS xita_sponsor_overtaken_obligations (
 grant_key TEXT PRIMARY KEY CHECK(length(grant_key)<=200),
 chain_name TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('first-delivery','hub-onward','final-delivery')),
 sponsor_address CHAR(42) NOT NULL CHECK(sponsor_address~'^0x[0-9a-f]{40}$'),
 promised_wei NUMERIC(78,0) NOT NULL CHECK(promised_wei>0),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS xita_sponsor_overtaken_by_operator
 ON xita_sponsor_overtaken_obligations(sponsor_address,recorded_at DESC);
REVOKE ALL ON xita_sponsor_overtaken_obligations FROM PUBLIC;
DO $migration$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_worker') THEN
  GRANT SELECT,INSERT ON xita_sponsor_overtaken_obligations TO xita_sponsor_worker;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
  GRANT SELECT,INSERT ON xita_sponsor_overtaken_obligations TO xita_transfer_worker;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_status_reader') THEN
  GRANT SELECT ON xita_sponsor_overtaken_obligations TO xita_sponsor_status_reader;
 END IF;
END $migration$;
