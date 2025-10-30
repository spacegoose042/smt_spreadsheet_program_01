#!/usr/bin/env python3
"""
Add is_deleted and is_canceled columns to work_orders table.
Run this SQL directly on your production database.
"""

# Add deleted and canceled flag columns
ALTER_TABLE_SQL = """
-- Add deleted and canceled flag columns to work_orders table
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS is_canceled BOOLEAN DEFAULT FALSE;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_work_orders_is_deleted ON work_orders(is_deleted);
CREATE INDEX IF NOT EXISTS idx_work_orders_is_canceled ON work_orders(is_canceled);

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'work_orders' 
AND column_name IN ('is_deleted', 'is_canceled')
ORDER BY column_name;
"""

if __name__ == "__main__":
    print("Deleted/Canceled Migration SQL:")
    print(ALTER_TABLE_SQL)
