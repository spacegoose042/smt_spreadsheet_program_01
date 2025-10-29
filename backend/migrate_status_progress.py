#!/usr/bin/env python3
"""
Add cetec_status_progress column to work_orders table.
Run this SQL directly on your production database.
"""

# Add status progress tracking column
ALTER_TABLE_SQL = """
-- Add status progress tracking column to work_orders table
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cetec_status_progress TEXT;

-- Verify column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'work_orders' 
AND column_name = 'cetec_status_progress';
"""

if __name__ == "__main__":
    print("Status Progress Migration SQL:")
    print(ALTER_TABLE_SQL)
