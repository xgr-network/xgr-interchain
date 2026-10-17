-- Derived XITA wallet index extension for fee-adapter journey evidence.
-- Backward compatible with existing 002_transfer_operations.sql.
ALTER TABLE xita_transfer_operations
 ADD COLUMN IF NOT EXISTS execution_adapter CHAR(42),
 ADD COLUMN IF NOT EXISTS interchain_fee_wei NUMERIC(78,0),
 ADD COLUMN IF NOT EXISTS final_destination_chain TEXT,
 ADD COLUMN IF NOT EXISTS final_recipient CHAR(42),
 ADD COLUMN IF NOT EXISTS onward_route_id CHAR(66),
 ADD COLUMN IF NOT EXISTS parent_message_id CHAR(66);
CREATE INDEX IF NOT EXISTS xita_transfer_operations_onward_idx
 ON xita_transfer_operations (account,source_indexed_at DESC)
 WHERE onward_route_id IS NOT NULL;

-- A cryptographic parent reference is included in the confirmed onward
-- adapter event. It is NOT a custody or source provenance proof without an
-- independently verified first-hop event and canonical Mailbox delivery.
CREATE INDEX IF NOT EXISTS xita_transfer_parent_reference_idx
 ON xita_transfer_operations (account,parent_message_id)
 WHERE parent_message_id IS NOT NULL;
