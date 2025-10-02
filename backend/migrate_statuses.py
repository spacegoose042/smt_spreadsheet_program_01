"""
Simple migration script to add statuses table and migrate data
"""
from sqlalchemy import text
from database import engine

def run_migration():
    """Add statuses table and migrate existing data"""
    print("Starting status migration...")
    
    with engine.begin() as conn:
        # Check if statuses table exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'statuses'
            )
        """))
        table_exists = result.scalar()
        
        if table_exists:
            print("✓ Statuses table already exists")
        else:
            print("Creating statuses table...")
            # Create statuses table
            conn.execute(text("""
                CREATE TABLE statuses (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR UNIQUE NOT NULL,
                    color VARCHAR DEFAULT '#6c757d',
                    is_active BOOLEAN DEFAULT true,
                    display_order INTEGER DEFAULT 0,
                    is_system BOOLEAN DEFAULT false,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            # Create indexes
            conn.execute(text("CREATE INDEX ix_statuses_id ON statuses(id)"))
            conn.execute(text("CREATE INDEX ix_statuses_name ON statuses(name)"))
            
            # Insert default statuses
            conn.execute(text("""
                INSERT INTO statuses (name, color, is_active, display_order, is_system) VALUES
                ('Clear to Build', '#17a2b8', true, 1, true),
                ('Clear to Build *', '#17a2b8', true, 2, true),
                ('Running', '#28a745', true, 3, true),
                ('2nd Side Running', '#28a745', true, 4, true),
                ('On Hold', '#ffc107', true, 5, true),
                ('Program/Stencil', '#6f42c1', true, 6, true)
            """))
            
            print("✓ Created statuses table and default statuses")
        
        # Check if status_id column exists in work_orders
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'work_orders' AND column_name = 'status_id'
            )
        """))
        column_exists = result.scalar()
        
        if column_exists:
            print("✓ status_id column already exists in work_orders")
        else:
            print("Adding status_id column to work_orders...")
            conn.execute(text("ALTER TABLE work_orders ADD COLUMN status_id INTEGER"))
            conn.execute(text("ALTER TABLE work_orders ADD CONSTRAINT fk_work_orders_status FOREIGN KEY (status_id) REFERENCES statuses(id)"))
            
            # Migrate existing status enum values
            conn.execute(text("""
                UPDATE work_orders wo
                SET status_id = s.id
                FROM statuses s
                WHERE wo.status::text = s.name
            """))
            
            print("✓ Added status_id to work_orders and migrated data")
        
        # Do the same for completed_work_orders
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'completed_work_orders' AND column_name = 'status_id'
            )
        """))
        column_exists = result.scalar()
        
        if column_exists:
            print("✓ status_id column already exists in completed_work_orders")
        else:
            print("Adding status_id column to completed_work_orders...")
            conn.execute(text("ALTER TABLE completed_work_orders ADD COLUMN status_id INTEGER"))
            conn.execute(text("ALTER TABLE completed_work_orders ADD CONSTRAINT fk_completed_work_orders_status FOREIGN KEY (status_id) REFERENCES statuses(id)"))
            
            conn.execute(text("""
                UPDATE completed_work_orders cwo
                SET status_id = s.id
                FROM statuses s
                WHERE cwo.status::text = s.name
            """))
            
            print("✓ Added status_id to completed_work_orders")
    
    print("✅ Status migration complete!")


if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        raise

