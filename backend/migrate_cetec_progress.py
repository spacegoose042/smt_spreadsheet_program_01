#!/usr/bin/env python3
"""
Add Cetec progress tracking columns to work_orders table.
Run this SQL directly on your production database.
"""

# Add Cetec progress tracking columns
ALTER_TABLE_SQL = """
-- Add Cetec progress tracking columns to work_orders table
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cetec_original_qty INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cetec_balance_due INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cetec_shipped_qty INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cetec_invoiced_qty INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cetec_completed_qty INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cetec_remaining_qty INTEGER;

-- Create index for faster lookups by remaining quantity
CREATE INDEX IF NOT EXISTS idx_work_orders_cetec_remaining_qty ON work_orders(cetec_remaining_qty);

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'work_orders' 
AND column_name LIKE 'cetec_%'
ORDER BY column_name;
"""

if __name__ == "__main__":
    print("Cetec Progress Migration SQL:")
    print(ALTER_TABLE_SQL)
