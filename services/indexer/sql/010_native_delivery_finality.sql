-- M-02: track the canonical native-safe destination observation for each operation.
-- Reversible delivery state; NULL evidence is unknown, never a confirmed delivery.
ALTER TABLE public.xita_transfer_operations
 ADD COLUMN IF NOT EXISTS destination_checked_block BIGINT,
 ADD COLUMN IF NOT EXISTS destination_checked_hash TEXT;
DO $
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='xita_destination_checked_hash_format') THEN
  ALTER TABLE public.xita_transfer_operations
   ADD CONSTRAINT xita_destination_checked_hash_format
   CHECK (destination_checked_hash IS NULL OR destination_checked_hash ~ '^0x[0-9a-f]{64}
-- Old sticky true values have no safe block/hash provenance and MUST be rechecked
-- before they authorize recovery suppression or journey success.
UPDATE public.xita_transfer_operations
 SET delivered=NULL, delivery_checked_at=NULL
 WHERE destination_checked_block IS NULL OR destination_checked_hash IS NULL;
) NOT VALID;
 END IF;
END $;
-- Old sticky true values have no safe block/hash provenance and MUST be rechecked
-- before they authorize recovery suppression or journey success.
UPDATE public.xita_transfer_operations
 SET delivered=NULL, delivery_checked_at=NULL
 WHERE destination_checked_block IS NULL OR destination_checked_hash IS NULL;
