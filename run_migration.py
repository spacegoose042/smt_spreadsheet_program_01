#!/usr/bin/env python3
"""
Run the Cetec progress migration on the database.
This script will add the new columns to the work_orders table.
"""
import os
import psycopg2
from urllib.parse import urlparse

def run_migration():
    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL environment variable not found")
        return False
    
    try:
        # Parse the database URL
        parsed = urlparse(database_url)
        
        # Connect to database
        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port,
            database=parsed.path[1:],  # Remove leading slash
            user=parsed.username,
            password=parsed.password
        )
        
        cursor = conn.cursor()
        
        print("🔧 Running Cetec progress migration...")
        
        # Add columns
        columns = [
            "cetec_original_qty INTEGER",
            "cetec_balance_due INTEGER", 
            "cetec_shipped_qty INTEGER",
            "cetec_invoiced_qty INTEGER",
            "cetec_completed_qty INTEGER",
            "cetec_remaining_qty INTEGER"
        ]
        
        for column in columns:
            try:
                cursor.execute(f"ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS {column};")
                print(f"✅ Added column: {column.split()[0]}")
            except Exception as e:
                print(f"⚠️  Column {column.split()[0]} might already exist: {e}")
        
        # Create index
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_work_orders_cetec_remaining_qty ON work_orders(cetec_remaining_qty);")
            print("✅ Created index: idx_work_orders_cetec_remaining_qty")
        except Exception as e:
            print(f"⚠️  Index might already exist: {e}")
        
        # Commit changes
        conn.commit()
        
        # Verify columns were added
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'work_orders' 
            AND column_name LIKE 'cetec_%'
            ORDER BY column_name;
        """)
        
        columns = cursor.fetchall()
        print(f"\n📋 Added {len(columns)} columns:")
        for col_name, col_type in columns:
            print(f"   - {col_name}: {col_type}")
        
        cursor.close()
        conn.close()
        
        print("\n✅ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

if __name__ == "__main__":
    success = run_migration()
    exit(0 if success else 1)

