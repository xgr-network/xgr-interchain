-- Native sponsor gas is usable after canonical inclusion (one mined receipt).
-- The existing status='confirmed' continues to require protocol-defined SAFE
-- finality, so pending-safe gifts can unlock UX without reclassifying safety.
-- Sponsor journal only; no TX1 / BLS / gateway state is changed.
ALTER TABLE public.xita_sponsor_grants
 ADD COLUMN IF NOT EXISTS spendable_at TIMESTAMPTZ;
