-- F-40: migrate the existing reviewer authority without rewriting
-- historical rows or relaxing immutable paid sponsorship obligations.
-- This migration must be applied through the normal restricted migration
-- process; NO grant payment, write to gas journals or chain operation occurs.
CREATE OR REPLACE FUNCTION public.xita_bind_sponsor_review_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE owner_address CHAR(42);
BEGIN
 SELECT o.sponsor_address INTO owner_address
 FROM public.xita_sponsor_overtaken_obligations AS o
 WHERE o.grant_key=NEW.grant_key;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Sponsorship review requires a recorded obligation'
   USING ERRCODE='23503';
 END IF;
 -- Never trust client-provided metadata, even from the reviewer role.
 NEW.sponsor_address := owner_address;
 NEW.reviewer := current_user;
 NEW.recorded_at := clock_timestamp();
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.xita_bind_sponsor_review_provenance() FROM PUBLIC;
DROP TRIGGER IF EXISTS xita_sponsor_review_provenance
 ON public.xita_sponsor_obligation_reviews;
CREATE TRIGGER xita_sponsor_review_provenance
 BEFORE INSERT ON public.xita_sponsor_obligation_reviews
 FOR EACH ROW EXECUTE FUNCTION public.xita_bind_sponsor_review_provenance();
DO $migration$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_sponsor_reviewer') THEN
  REVOKE INSERT ON public.xita_sponsor_obligation_reviews FROM xita_sponsor_reviewer;
  GRANT INSERT(grant_key,outcome,evidence_sha256)
   ON public.xita_sponsor_obligation_reviews TO xita_sponsor_reviewer;
 END IF;
END $migration$;
