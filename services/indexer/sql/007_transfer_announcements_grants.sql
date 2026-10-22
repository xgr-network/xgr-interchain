-- Safe, additive grants for OPTIONAL SQL 005, executed only by a
-- local PostgreSQL schema administrator. No wallet/treasury credentials.
-- Existing API and worker roles keep least privilege on the new table.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_indexer_reader') THEN
   GRANT SELECT ON TABLE public.xita_transfer_announcements TO xita_indexer_reader;
 ELSE
   RAISE NOTICE 'xita_indexer_reader role not present: verify your custom reader role separately';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
   GRANT SELECT, UPDATE, DELETE ON TABLE public.xita_transfer_announcements TO xita_transfer_worker;
 ELSE
   RAISE NOTICE 'xita_transfer_worker role not present: verify your custom worker role separately';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_intake') THEN
   GRANT INSERT ON TABLE public.xita_transfer_announcements TO xita_transfer_intake;
 ELSE
   RAISE NOTICE 'Optional xita_transfer_intake role absent; intake service remains disabled';
 END IF;
END
$$;
