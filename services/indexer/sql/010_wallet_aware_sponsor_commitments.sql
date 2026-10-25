-- Proposal-only additive migration; do not apply before signer/worker rollout.
-- The immutable commitment is made at quote time, activated only by a
-- FINALIZED matching InterchainFeeCharged event via xita_transfer_operations.
CREATE TABLE IF NOT EXISTS xita_sponsor_quote_commitments (
 source_chain TEXT NOT NULL,
 execution_adapter CHAR(42) NOT NULL,
 payer CHAR(42) NOT NULL,
 quote_nonce NUMERIC(78,0) NOT NULL,
 quote_fee_wei NUMERIC(78,0) NOT NULL,
 asset TEXT NOT NULL,
 amount_raw NUMERIC(78,0) NOT NULL,
 first_destination_chain TEXT NOT NULL,
 final_destination_chain TEXT NOT NULL,
 grant_chain TEXT NOT NULL,
 grant_stage TEXT NOT NULL CHECK(grant_stage IN
  ('first-delivery','hub-onward','onward-protocol-fee','final-delivery')),
 promised_wei NUMERIC(78,0) NOT NULL CHECK(promised_wei>0),
 quote_issued_at TIMESTAMPTZ NOT NULL,
 quote_expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_chain,execution_adapter,payer,quote_nonce,grant_stage),
 CHECK(quote_nonce>0 AND quote_fee_wei>0 AND amount_raw>0),
 CHECK(quote_expires_at>quote_issued_at),
 CHECK(execution_adapter ~ '^0x[0-9a-f]{40}$'),
 CHECK(payer ~ '^0x[0-9a-f]{40}$')
);
-- No UPDATE/DELETE privileges for any runtime signer or worker.
REVOKE ALL ON xita_sponsor_quote_commitments FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_tax_quote_writer') THEN
  GRANT INSERT ON xita_sponsor_quote_commitments TO xita_tax_quote_writer;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_worker') THEN
  GRANT SELECT ON xita_sponsor_quote_commitments TO xita_sponsor_worker;
 END IF;
END $$;
-- The worker MUST require a canonical operation with matching source_chain,
-- payer, execution_adapter, quote_nonce, and quote_fee_wei; neither an
-- unfinalized quote nor this table alone authorizes a grant.
