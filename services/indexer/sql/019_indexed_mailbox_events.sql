BEGIN;
CREATE TABLE IF NOT EXISTS public.xita_indexed_mailbox_events (
  chain_name text NOT NULL,
  mailbox char(42) NOT NULL CHECK (mailbox ~ '^0x[0-9a-f]{40}$'),
  message_id char(66) NOT NULL CHECK (message_id ~ '^0x[0-9a-f]{64}$'),
  tx_hash char(66) NOT NULL CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
  block_number bigint NOT NULL CHECK (block_number > 0),
  block_hash char(66) NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  gas_due_at timestamptz DEFAULT now(),
  PRIMARY KEY (chain_name, mailbox, message_id)
);
CREATE INDEX IF NOT EXISTS xita_indexed_mailbox_events_gas_due_idx
 ON public.xita_indexed_mailbox_events (gas_due_at, chain_name, mailbox, message_id)
 WHERE gas_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS xita_transfer_operations_destination_message_idx
 ON public.xita_transfer_operations (destination_chain, destination_mailbox, message_id);
REVOKE ALL ON public.xita_indexed_mailbox_events FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='xita_transfer_worker') THEN
    GRANT SELECT, INSERT, UPDATE ON public.xita_indexed_mailbox_events TO xita_transfer_worker;
  END IF;
END $grants$;
COMMIT;
