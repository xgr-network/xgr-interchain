-- F-19: append-only, operator-controlled disposition history of independently
-- recorded overtaken sponsorship promises. This ledger does NOT settle,
-- delete, waive or authorize a late payment of the financial obligation.
-- A separate, least-privileged database identity is needed for manual writes.
CREATE TABLE IF NOT EXISTS public.xita_sponsor_obligation_reviews (
 review_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 grant_key TEXT NOT NULL REFERENCES public.xita_sponsor_overtaken_obligations(grant_key),
 sponsor_address CHAR(42) NOT NULL CHECK(sponsor_address ~ '^0x[0-9a-f]{40}$'),
 outcome TEXT NOT NULL CHECK(outcome IN (
  'acknowledged','escalated','customer-contacted','evidence-requested')),
 evidence_sha256 CHAR(64) CHECK(evidence_sha256 IS NULL OR evidence_sha256 ~ '^[a-f0-9]{64}$'),
 reviewer TEXT NOT NULL DEFAULT current_user,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(length(reviewer) BETWEEN 3 AND 128)
);
CREATE INDEX IF NOT EXISTS xita_sponsor_reviews_grant_history
 ON public.xita_sponsor_obligation_reviews(grant_key,review_id DESC);
REVOKE ALL ON public.xita_sponsor_obligation_reviews FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.xita_sponsor_obligation_reviews_review_id_seq FROM PUBLIC;
DO $migration$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_reviewer') THEN
  GRANT SELECT,INSERT ON public.xita_sponsor_obligation_reviews TO xita_sponsor_reviewer;
  GRANT USAGE ON SEQUENCE public.xita_sponsor_obligation_reviews_review_id_seq TO xita_sponsor_reviewer;
  GRANT SELECT ON public.xita_sponsor_overtaken_obligations TO xita_sponsor_reviewer;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_status_reader') THEN
  GRANT SELECT ON public.xita_sponsor_obligation_reviews TO xita_sponsor_status_reader;
 END IF;
END $migration$;
