-- N-06: append-only, chain-finalized source nonce resolution.
-- The sponsor worker proves that a quote either executed, or expired unused.
-- A signed quote is NEVER released by a wall-clock-only TTL.
-- The quote signer may READ proofs; only the isolated worker may INSERT them.
CREATE TABLE IF NOT EXISTS xita_sponsor_quote_resolutions (
 source_chain TEXT NOT NULL,
 execution_adapter CHAR(42) NOT NULL,
 payer CHAR(42) NOT NULL,
 quote_nonce NUMERIC(78,0) NOT NULL,
 resolution TEXT NOT NULL CHECK(resolution IN ('used','expired-unused')),
 finalized_source_block BIGINT NOT NULL CHECK(finalized_source_block>0),
 finalized_source_hash CHAR(66) NOT NULL CHECK(finalized_source_hash~'^0x[0-9a-f]{64}$'),
 checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_chain,execution_adapter,payer,quote_nonce),
 FOREIGN KEY(source_chain,execution_adapter,payer,quote_nonce)
  REFERENCES xita_sponsor_quote_intents
  (source_chain,execution_adapter,payer,quote_nonce) ON DELETE RESTRICT
);
REVOKE ALL ON xita_sponsor_quote_resolutions FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_worker') THEN
  GRANT SELECT,INSERT ON xita_sponsor_quote_resolutions TO xita_sponsor_worker;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_tax_quote_writer') THEN
  GRANT SELECT ON xita_sponsor_quote_resolutions TO xita_tax_quote_writer;
 END IF;
END $$;
-- There is no DELETE, UPDATE or privileged TTL cleanup path.
