"""
Manual migration script to add Cetec integration columns to work_orders table
Run this directly on production database to add the missing columns
"""
from sqlalchemy import create_engine, text
import os
import sys

def add_cetec_columns():
    """Add Cetec integration columns to work_orders table"""
    # Get database URL from environment or command line
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        print("❌ DATABASE_URL environment variable not set")
        print("Usage: DATABASE_URL='your_db_url' python migrate_cetec_columns.py")
        sys.exit(1)
    
    print(f"🔗 Connecting to database...")
    engine = create_engine(database_url)
    
    try:
        with engine.begin() as conn:
            print("\n📋 Checking for existing Cetec columns...")
            
            # Check if cetec_ordline_id exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='work_orders' AND column_name='cetec_ordline_id'
                )
            """))
            column_exists = result.scalar()
            
            if not column_exists:
                print("\n✨ Adding Cetec integration columns to work_orders...")
                
                # Add columns
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN cetec_ordline_id INTEGER"))
                print("   ✓ Added cetec_ordline_id")
                
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN current_location VARCHAR"))
                print("   ✓ Added current_location")
                
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN material_status VARCHAR"))
                print("   ✓ Added material_status")
                
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN last_cetec_sync TIMESTAMP"))
                print("   ✓ Added last_cetec_sync")
                
                # Add index on cetec_ordline_id for faster lookups
                conn.execute(text("CREATE INDEX idx_work_orders_cetec_ordline_id ON work_orders(cetec_ordline_id)"))
                print("   ✓ Created index on cetec_ordline_id")
                
                print("\n✅ Successfully added all Cetec integration columns!")
            else:
                print("\n✅ Cetec integration columns already exist!")
            
            # Verify columns were added
            print("\n🔍 Verifying columns...")
            result = conn.execute(text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'work_orders' 
                AND column_name IN ('cetec_ordline_id', 'current_location', 'material_status', 'last_cetec_sync')
                ORDER BY column_name
            """))
            
            columns = result.fetchall()
            if columns:
                print("\n✅ Confirmed columns in database:")
                for col in columns:
                    print(f"   • {col[0]} ({col[1]})")
            else:
                print("\n⚠️  Warning: Could not verify columns")
                
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
    
    print("\n🎉 Migration complete! Production database is ready.")
    print("\n💡 Next steps:")
    print("   1. Restart your Railway backend service")
    print("   2. Test the dashboard and Cetec import features")

if __name__ == "__main__":
    add_cetec_columns()

