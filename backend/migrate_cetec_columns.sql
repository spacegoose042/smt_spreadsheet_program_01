-- Add Cetec integration columns to work_orders table
-- Run this SQL directly on your production database

-- Add cetec_ordline_id column (for linking to Cetec order lines)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cetec_ordline_id INTEGER;

-- Add current_location column (from Cetec work location status)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS current_location VARCHAR;

-- Add material_status column (Ready/Partial/Shortage)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS material_status VARCHAR;

-- Add last_cetec_sync column (timestamp of last sync from Cetec)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS last_cetec_sync TIMESTAMP;

-- Create index for faster lookups by Cetec order line ID
CREATE INDEX IF NOT EXISTS idx_work_orders_cetec_ordline_id ON work_orders(cetec_ordline_id);

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'work_orders' 
AND column_name IN ('cetec_ordline_id', 'current_location', 'material_status', 'last_cetec_sync')
ORDER BY column_name;

