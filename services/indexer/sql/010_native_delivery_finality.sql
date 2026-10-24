-- Audit M-02: destination delivery is only authoritative when read at
-- a canonical source-independent, chain-native finality block.
-- This migration is idempotent and preserves source operations and fee evidence.
ALTER TABLE public.xita_transfer_operations
 ADD COLUMN IF NOT EXISTS destination_checked_block BIGINT,
 ADD COLUMN IF NOT EXISTS destination_checked_hash CHAR(66);

DO $migration$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.xita_transfer_operations'::regclass
    AND conname='xita_destination_checked_provenance'
 ) THEN
  ALTER TABLE public.xita_transfer_operations
   ADD CONSTRAINT xita_destination_checked_provenance CHECK (
     (destination_checked_block IS NULL AND destination_checked_hash IS NULL)
     OR (destination_checked_block > 0 AND
       destination_checked_hash ~ '^0x[0-9a-f]{64}$')
   ) NOT VALID;
 END IF;
END $migration$;

-- Old sticky states were read from "latest" and have NO valid finality proof.
-- Retract ONLY their delivery conclusions, never an actual source operation,
-- signed fee evidence, token amount, child relationship, or source cursor.
-- On every later run this leaves already reconciled rows unchanged.
UPDATE public.xita_transfer_operations
 SET delivered=NULL,delivery_checked_at=NULL
 WHERE (destination_checked_block IS NULL OR destination_checked_hash IS NULL)
   AND delivered IS NOT NULL;
