"""
Migration script to make status column nullable in production database
Run this once to fix the schema mismatch
"""
from database import SessionLocal, engine
from sqlalchemy import text

def migrate_status_column():
    """Make status column nullable to match the current model definition"""
    db = SessionLocal()
    try:
        print("🔧 Migrating status column to be nullable...")
        
        # Make status column nullable
        db.execute(text("ALTER TABLE work_orders ALTER COLUMN status DROP NOT NULL"))
        db.commit()
        
        print("✅ Migration complete! Status column is now nullable.")
        print("   This matches the model definition: status = Column(SQLEnum(WorkOrderStatus), nullable=True)")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    migrate_status_column()

