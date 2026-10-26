-- Operator-only idempotent least-privilege repair for the ACTUAL signer login.
-- Called after 009+010, using a role securely read from the root-owned
-- /etc/xita/interchain-fee.env. No password/URL is sent to psql or logged.
-- No new tables, contract changes, or privileges for PUBLIC.
-- PostgreSQL existing tax-evidence INSERT is used as an independent guard:
-- an unrelated or read-only service role cannot be promoted to quote writer.
BEGIN;
SELECT set_config('xita.quote_writer_role', :'writer_role', false);
DO $migration$
DECLARE
 writer text := current_setting('xita.quote_writer_role');
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname=writer AND rolcanlogin
   AND NOT rolsuper AND NOT rolreplication AND NOT rolbypassrls
 ) THEN
  RAISE EXCEPTION 'Configured XITA signer database login is absent or overprivileged';
 END IF;
 IF writer='xita_transfer_worker' THEN
  EXECUTE format('GRANT INSERT ON TABLE public.xita_tax_quote_evidence TO %I',writer);
 ELSIF NOT has_table_privilege(writer,'public.xita_tax_quote_evidence','INSERT') THEN
  RAISE EXCEPTION 'Configured XITA signer has no tax evidence INSERT grant';
 END IF;
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',writer);
 EXECUTE format('GRANT INSERT ON TABLE public.xita_sponsor_quote_intents, public.xita_sponsor_quote_commitments TO %I',writer);
 EXECUTE format('GRANT SELECT ON TABLE public.xita_sponsor_quote_commitments, public.xita_sponsor_grants, public.xita_sponsor_quote_resolutions TO %I',writer);
 IF NOT (
  has_schema_privilege(writer,'public','USAGE') AND
  has_table_privilege(writer,'public.xita_sponsor_quote_intents','INSERT') AND
  has_table_privilege(writer,'public.xita_sponsor_quote_commitments','INSERT') AND
  has_table_privilege(writer,'public.xita_sponsor_quote_commitments','SELECT') AND
  has_table_privilege(writer,'public.xita_sponsor_grants','SELECT')
 ) THEN
  RAISE EXCEPTION 'XITA signer quote role permission verification failed';
 END IF;
END $migration$;
COMMIT;
