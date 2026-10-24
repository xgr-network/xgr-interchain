-- XITA commercial service fee evidence. One taxable event per INITIAL
-- InterchainFeeCharged, independent of how many hops follow.
-- Apply after 002_transfer_operations.sql and 003_interchain_journey.sql.
-- Quote evidence is TRANSIENT: automatically prune unbooked quote rows
-- no later than 72 h after quote expiry while the index worker is healthy.
-- Tax accounting export uses ONLY successful canonical on-chain fee events.
ALTER TABLE xita_transfer_operations
 ADD COLUMN IF NOT EXISTS quote_nonce NUMERIC(78,0);

CREATE TABLE IF NOT EXISTS xita_tax_quote_evidence (
 source_chain TEXT NOT NULL,
 execution_adapter CHAR(42) NOT NULL,
 payer CHAR(42) NOT NULL,
 quote_nonce NUMERIC(78,0) NOT NULL,
 quoted_fee_wei NUMERIC(78,0) NOT NULL,
 client_ip INET NOT NULL,
 ip_country_code CHAR(2),
 ip_country_source TEXT NOT NULL,
 ip_country_db_revision TEXT,
 native_coin_id TEXT NOT NULL,
 native_eur_price NUMERIC(30,12),
 gross_fee_eur NUMERIC(30,8),
 eur_price_source TEXT,
 eur_price_at TIMESTAMPTZ,
 quote_issued_at TIMESTAMPTZ NOT NULL,
 quote_expires_at TIMESTAMPTZ NOT NULL,
 captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_chain,execution_adapter,payer,quote_nonce),
 CHECK(quote_nonce>0 AND quoted_fee_wei>0),
 CHECK(ip_country_code IS NULL OR ip_country_code ~ '^[A-Z]{2}$'),
 CHECK(quote_expires_at>quote_issued_at)
);

CREATE TABLE IF NOT EXISTS xita_tax_charged_fees (
 source_chain TEXT NOT NULL,
 message_id CHAR(66) NOT NULL,
 source_tx_hash CHAR(66) NOT NULL,
 source_block_number BIGINT NOT NULL,
 source_block_hash CHAR(66) NOT NULL,
 payer CHAR(42) NOT NULL,
 execution_adapter CHAR(42) NOT NULL,
 quote_nonce NUMERIC(78,0) NOT NULL,
 service_fee_wei NUMERIC(78,0) NOT NULL,
 client_ip INET,
 ip_country_code CHAR(2),
 ip_country_source TEXT,
 ip_country_db_revision TEXT,
 native_coin_id TEXT,
 native_eur_price NUMERIC(30,12),
 gross_fee_eur NUMERIC(30,8),
 eur_price_source TEXT,
 eur_price_at TIMESTAMPTZ,
 evidence_status TEXT NOT NULL CHECK(evidence_status IN ('matched','partial','missing_quote')),
 verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_chain,message_id),
 -- The contract consumes nonce once per payer+adapter. Never account twice.
 UNIQUE(source_chain,execution_adapter,payer,quote_nonce),
 CHECK(quote_nonce>0 AND service_fee_wei>0),
 CHECK ((evidence_status='matched' AND client_ip IS NOT NULL
          AND ip_country_code IS NOT NULL AND native_eur_price IS NOT NULL AND gross_fee_eur IS NOT NULL)
     OR (evidence_status='partial' AND client_ip IS NOT NULL
          AND (ip_country_code IS NULL OR native_eur_price IS NULL OR gross_fee_eur IS NULL))
     OR (evidence_status='missing_quote' AND client_ip IS NULL
          AND native_eur_price IS NULL AND gross_fee_eur IS NULL)),
 CHECK(ip_country_code IS NULL OR ip_country_code ~ '^[A-Z]{2}$')
);
-- Only currently canonical operations enter the accounting feed. If the
-- indexed source block is reorganized away, it disappears automatically.
CREATE OR REPLACE VIEW xita_tax_accounting_export AS
 SELECT p.source_chain,p.message_id,p.source_tx_hash,p.source_block_number,
  p.payer,p.execution_adapter,p.quote_nonce,p.service_fee_wei,p.native_coin_id,
  p.native_eur_price,p.gross_fee_eur,p.eur_price_source,p.eur_price_at,
  p.ip_country_code,p.ip_country_source,p.evidence_status
 FROM xita_tax_charged_fees p
 JOIN xita_transfer_operations o
   ON o.source_chain=p.source_chain AND o.message_id=p.message_id
  AND o.source_tx_hash=p.source_tx_hash
  AND o.source_block_hash=p.source_block_hash
  AND o.account=p.payer
  AND o.execution_adapter=p.execution_adapter
  AND o.interchain_fee_wei=p.service_fee_wei
  AND o.quote_nonce=p.quote_nonce;
REVOKE ALL ON xita_tax_quote_evidence,xita_tax_charged_fees FROM PUBLIC;
REVOKE ALL ON xita_tax_accounting_export FROM PUBLIC;
-- Provision a narrow INSERT-only quote signer, an event-indexing DB writer,
-- and an accounting reader with access ONLY to xita_tax_accounting_export.
-- The public wallet-index API must never SELECT client_ip.

-- Verified sponsor-grant status can be read by the existing managed fee
-- health/status read-only role. Do NOT expose the grant table to the public.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_status_reader') AND
    to_regclass('public.xita_sponsor_grants') IS NOT NULL THEN
  GRANT SELECT ON public.xita_transfer_operations,public.xita_sponsor_grants
   TO xita_sponsor_status_reader;
 END IF;
END $$;
