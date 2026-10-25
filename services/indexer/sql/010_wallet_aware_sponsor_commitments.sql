-- Wallet-aware gas quote commitments. Additive, opt-in migration.
-- A signed quote is persisted ATOMICALLY with its tax evidence BEFORE being
-- returned to the wallet. Only finalized, matching fee events activate grants.
-- Signing role: INSERT ONLY. Sponsor role: SELECT ONLY. Never UPDATE a quote.
CREATE TABLE IF NOT EXISTS xita_sponsor_quote_intents (
 source_chain TEXT NOT NULL,
 execution_adapter CHAR(42) NOT NULL,
 payer CHAR(42) NOT NULL,
 quote_nonce NUMERIC(78,0) NOT NULL CHECK(quote_nonce>0),
 quote_fee_wei NUMERIC(78,0) NOT NULL CHECK(quote_fee_wei>0),
 quote_digest CHAR(66) NOT NULL CHECK(quote_digest~'^0x[0-9a-f]{64}$'),
 asset TEXT NOT NULL,
 amount_raw NUMERIC(78,0) NOT NULL CHECK(amount_raw>0),
 gateway CHAR(42) NOT NULL CHECK(gateway~'^0x[0-9a-f]{40}$'),
 route_id CHAR(66) NOT NULL CHECK(route_id~'^0x[0-9a-f]{64}$'),
 first_destination_chain TEXT NOT NULL,
 final_destination_chain TEXT NOT NULL,
 final_recipient CHAR(42) NOT NULL CHECK(final_recipient~'^0x[0-9a-f]{40}$'),
 onward_route_id CHAR(66) NOT NULL,
 quote_issued_at TIMESTAMPTZ NOT NULL,
 quote_expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_chain,execution_adapter,payer,quote_nonce),
 CHECK(quote_expires_at>quote_issued_at),
 CHECK(execution_adapter~'^0x[0-9a-f]{40}$'),
 CHECK(payer~'^0x[0-9a-f]{40}$'),
 CHECK(onward_route_id~'^0x[0-9a-f]{64}$')
);
CREATE TABLE IF NOT EXISTS xita_sponsor_quote_commitments (
 source_chain TEXT NOT NULL,
 execution_adapter CHAR(42) NOT NULL,
 payer CHAR(42) NOT NULL,
 quote_nonce NUMERIC(78,0) NOT NULL,
 grant_chain TEXT NOT NULL,
 grant_stage TEXT NOT NULL CHECK(grant_stage IN
  ('first-delivery','hub-onward','final-delivery')),
 promised_wei NUMERIC(78,0) NOT NULL CHECK(promised_wei>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_chain,execution_adapter,payer,quote_nonce,grant_stage),
 FOREIGN KEY(source_chain,execution_adapter,payer,quote_nonce)
  REFERENCES xita_sponsor_quote_intents
  (source_chain,execution_adapter,payer,quote_nonce) ON DELETE RESTRICT,
 CHECK(grant_chain~'^[a-z][a-z0-9-]{1,39}$')
);
CREATE INDEX IF NOT EXISTS xita_sponsor_quote_intents_age
 ON xita_sponsor_quote_intents(created_at DESC);
REVOKE ALL ON xita_sponsor_quote_intents,xita_sponsor_quote_commitments FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_tax_quote_writer') THEN
  GRANT INSERT ON xita_sponsor_quote_intents,
   xita_sponsor_quote_commitments TO xita_tax_quote_writer;
  GRANT SELECT ON xita_sponsor_quote_commitments,
   public.xita_sponsor_grants TO xita_tax_quote_writer;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_worker') THEN
  GRANT SELECT ON xita_sponsor_quote_intents,
   xita_sponsor_quote_commitments TO xita_sponsor_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_status_reader') THEN
  GRANT SELECT ON xita_sponsor_quote_intents,
   xita_sponsor_quote_commitments TO xita_sponsor_status_reader;
 END IF;
END $$;
-- No trigger may authorize a payout: worker must recheck canonical source TX,
-- matched nonce/fee/route/recipient AND quote-time immutable intent separately.
