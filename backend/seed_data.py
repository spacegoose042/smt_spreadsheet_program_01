"""
Script to seed the database with initial data (lines, sample work orders) - Fixed Status import
PRODUCTION FIX: Added missing Status import to prevent startup crashes
"""
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import SessionLocal, engine
from models import Base, SMTLine, User, UserRole, Shift, ShiftBreak, LineConfiguration, IssueType, ResolutionType
from passlib.context import CryptContext
from datetime import time

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed_shifts_and_config(db: Session):
    """Create default shifts and configurations for all lines (only if none exist)"""
    # Check if shifts already exist
    existing_shifts = db.query(Shift).count()
    if existing_shifts > 0:
        print(f"✓ Shifts already configured ({existing_shifts} shifts) - skipping seed")
        return
    
    lines = db.query(SMTLine).all()
    
    for line in lines:
        # Create line configuration
        existing_config = db.query(LineConfiguration).filter(LineConfiguration.line_id == line.id).first()
        if not existing_config:
            config = LineConfiguration(
                line_id=line.id,
                buffer_time_minutes=15.0,
                time_rounding_minutes=15,
                timezone="America/Chicago"
            )
            db.add(config)
        
        # Create default day shift (7:30 AM - 4:30 PM)
        existing_shift = db.query(Shift).filter(Shift.line_id == line.id).first()
        if not existing_shift:
            day_shift = Shift(
                line_id=line.id,
                name="Day Shift",
                shift_number=1,
                start_time=time(7, 30),
                end_time=time(16, 30),
                active_days="1,2,3,4,5",  # Mon-Fri
                is_active=True
            )
            db.add(day_shift)
            db.flush()
            
            # Add lunch break
            lunch = ShiftBreak(
                shift_id=day_shift.id,
                name="Lunch",
                start_time=time(11, 30),
                end_time=time(12, 30),
                is_paid=False
            )
            db.add(lunch)
    
    db.commit()
    print("✓ Seeded shifts and configurations")


def seed_lines(db: Session):
    """Create the 5 SMT lines"""
    lines = [
        SMTLine(
            name="1-EURO 264",
            description="General purpose SMT line 1",
            hours_per_day=8.0,
            hours_per_week=40.0,
            is_active=True,
            order_position=1
        ),
        SMTLine(
            name="2-EURO 127",
            description="General purpose SMT line 2",
            hours_per_day=8.0,
            hours_per_week=40.0,
            is_active=True,
            order_position=2
        ),
        SMTLine(
            name="3-EURO 588",
            description="General purpose SMT line 3",
            hours_per_day=8.0,
            hours_per_week=40.0,
            is_active=True,
            order_position=3
        ),
        SMTLine(
            name="4-EURO 586 MCI",
            description="MCI dedicated line",
            hours_per_day=8.0,
            hours_per_week=40.0,
            is_active=True,
            is_special_customer=True,
            special_customer_name="MCI",
            order_position=4
        ),
        SMTLine(
            name="Hand Build",
            description="Manual assembly for small jobs (no auto-scheduling)",
            hours_per_day=8.0,
            hours_per_week=40.0,
            is_active=True,
            is_manual_only=True,  # Never auto-schedule to this line
            order_position=5
        )
    ]
    
    for line in lines:
        existing = db.query(SMTLine).filter(SMTLine.name == line.name).first()
        if not existing:
            db.add(line)
        else:
            # Update existing lines with new properties
            if line.name == "Hand Build":
                existing.is_manual_only = True
                existing.description = line.description
    
    db.commit()
    print("✓ Seeded SMT lines")


def seed_users(db: Session):
    """Create default users (only if no users exist)"""
    # Check if users already exist
    existing_users = db.query(User).count()
    if existing_users > 0:
        print(f"✓ Users already exist ({existing_users} users) - skipping seed")
        return
    
    users = [
        User(
            username="admin",
            email="admin@example.com",
            hashed_password=pwd_context.hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True
        ),
        User(
            username="scheduler",
            email="scheduler@example.com",
            hashed_password=pwd_context.hash("password123"),
            role=UserRole.SCHEDULER,
            is_active=True
        ),
        User(
            username="operator",
            email="operator@example.com",
            hashed_password=pwd_context.hash("password123"),
            role=UserRole.OPERATOR,
            is_active=True
        ),
        User(
            username="manager",
            email="manager@example.com",
            hashed_password=pwd_context.hash("password123"),
            role=UserRole.MANAGER,
            is_active=True
        )
    ]
    
    for user in users:
        db.add(user)
    
    db.commit()
    print("✓ Seeded users (default password: password123)")


def seed_issue_types(db: Session):
    """Create default issue types (only if none exist)"""
    # Check if issue types already exist
    existing = db.query(IssueType).count()
    if existing > 0:
        print(f"✓ Issue types already exist ({existing} types) - skipping seed")
        return
    
    default_issue_types = [
        {"name": "Packaging - Tape & Reel Needed", "color": "#f39c12", "category": "Packaging", "display_order": 1},
        {"name": "Missing Parts", "color": "#e74c3c", "category": "Parts", "display_order": 2},
        {"name": "Program Issue", "color": "#9b59b6", "category": "Program", "display_order": 3},
        {"name": "Stencil Issue", "color": "#3498db", "category": "Stencil", "display_order": 4},
        {"name": "Quality Issue", "color": "#e67e22", "category": "Quality", "display_order": 5},
        {"name": "Other", "color": "#95a5a6", "category": "Other", "display_order": 6},
    ]
    
    for it_data in default_issue_types:
        issue_type = IssueType(
            name=it_data["name"],
            color=it_data["color"],
            category=it_data["category"],
            display_order=it_data["display_order"],
            is_active=True,
            is_system=True  # Default types are system types
        )
        db.add(issue_type)
    
    db.commit()
    print("✓ Seeded default issue types")


def seed_statuses(db: Session):
    """Create default work order statuses (only if none exist)"""
    # Check if statuses already exist
    from models import Status
    existing = db.query(Status).count()
    if existing > 0:
        print(f"✓ Statuses already exist ({existing} statuses) - skipping seed")
        return
    
    default_statuses = [
        {"name": "Unassigned", "color": "#6c757d", "display_order": 1, "is_system": True},
        {"name": "Clear to Build", "color": "#28a745", "display_order": 2, "is_system": True},
        {"name": "Clear to Build *", "color": "#17a2b8", "display_order": 3, "is_system": True},
        {"name": "Running", "color": "#007bff", "display_order": 4, "is_system": True},
        {"name": "2nd Side Running", "color": "#0056b3", "display_order": 5, "is_system": True},
        {"name": "On Hold", "color": "#ffc107", "display_order": 6, "is_system": True},
        {"name": "Program/Stencil", "color": "#fd7e14", "display_order": 7, "is_system": True},
    ]
    
    for status_data in default_statuses:
        status = Status(
            name=status_data["name"],
            color=status_data["color"],
            display_order=status_data["display_order"],
            is_active=True,
            is_system=status_data["is_system"]
        )
        db.add(status)
    
    db.commit()
    print("✓ Seeded default statuses")


def seed_resolution_types(db: Session):
    """Create default resolution types (only if none exist)"""
    # Check if resolution types already exist
    existing = db.query(ResolutionType).count()
    if existing > 0:
        print(f"✓ Resolution types already exist ({existing} types) - skipping seed")
        return
    
    default_resolution_types = [
        {"name": "BOM Update Required", "color": "#e74c3c", "category": "Action Required", "display_order": 1},
        {"name": "Ordered Tape & Reel Packaging", "color": "#f39c12", "category": "Packaging", "display_order": 2},
        {"name": "Program Updated", "color": "#9b59b6", "category": "Program", "display_order": 3},
        {"name": "Stencil Modified", "color": "#3498db", "category": "Stencil", "display_order": 4},
        {"name": "Part Substitution Approved", "color": "#1abc9c", "category": "Parts", "display_order": 5},
        {"name": "Vendor Contacted", "color": "#f1c40f", "category": "External", "display_order": 6},
        {"name": "No Action Needed", "color": "#95a5a6", "category": "No Action", "display_order": 7},
        {"name": "Workaround Found", "color": "#16a085", "category": "Resolved", "display_order": 8},
        {"name": "Other", "color": "#7f8c8d", "category": "Other", "display_order": 9},
    ]
    
    for rt_data in default_resolution_types:
        resolution_type = ResolutionType(
            name=rt_data["name"],
            color=rt_data["color"],
            category=rt_data["category"],
            display_order=rt_data["display_order"],
            is_active=True,
            is_system=True  # Default types are system types
        )
        db.add(resolution_type)
    
    db.commit()
    print("✓ Seeded default resolution types")


def main():
    """Run all seeding functions"""
    # Create tables (this will create new tables and columns)
    try:
        Base.metadata.create_all(bind=engine)
        print("✓ Created database tables")
    except Exception as e:
        print(f"Note: {e}")
        print("Continuing with seed...")
    
    # Add new columns to existing tables if they don't exist
    try:
        with engine.begin() as conn:
            # Check and add resolution_type_id to issues table
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'issues' AND column_name = 'resolution_type_id'
                )
            """))
            column_exists = result.scalar()
            
            if not column_exists:
                print("Adding resolution_type_id column to issues...")
                conn.execute(text("ALTER TABLE issues ADD COLUMN resolution_type_id INTEGER"))
                conn.execute(text("ALTER TABLE issues ADD CONSTRAINT fk_issues_resolution_type FOREIGN KEY (resolution_type_id) REFERENCES resolution_types(id)"))
                print("✓ Added resolution_type_id to issues")
            else:
                print("✓ resolution_type_id column already exists in issues")
            
            # Check and add resolution_notes to issues table
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'issues' AND column_name = 'resolution_notes'
                )
            """))
            column_exists = result.scalar()
            
            if not column_exists:
                print("Adding resolution_notes column to issues...")
                conn.execute(text("ALTER TABLE issues ADD COLUMN resolution_notes VARCHAR"))
                print("✓ Added resolution_notes to issues")
            else:
                print("✓ resolution_notes column already exists in issues")
    except Exception as e:
        print(f"Note: Column check/add: {e}")
        print("Continuing with seed...")
    
    # Add Cetec integration columns to work_orders table if they don't exist
    print("🔍 Checking for Cetec integration columns...")
    try:
        with engine.begin() as conn:
            # Check for cetec_ordline_id column
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='work_orders' AND column_name='cetec_ordline_id'
                )
            """))
            column_exists = result.scalar()
            
            if not column_exists:
                print("⚙️  Adding Cetec integration columns to work_orders...")
                try:
                    conn.execute(text("ALTER TABLE work_orders ADD COLUMN cetec_ordline_id INTEGER"))
                    print("   ✓ Added cetec_ordline_id")
                except Exception as e:
                    print(f"   ⚠️  cetec_ordline_id: {e}")
                
                try:
                    conn.execute(text("ALTER TABLE work_orders ADD COLUMN current_location VARCHAR"))
                    print("   ✓ Added current_location")
                except Exception as e:
                    print(f"   ⚠️  current_location: {e}")
                
                try:
                    conn.execute(text("ALTER TABLE work_orders ADD COLUMN material_status VARCHAR"))
                    print("   ✓ Added material_status")
                except Exception as e:
                    print(f"   ⚠️  material_status: {e}")
                
                try:
                    conn.execute(text("ALTER TABLE work_orders ADD COLUMN last_cetec_sync TIMESTAMP"))
                    print("   ✓ Added last_cetec_sync")
                except Exception as e:
                    print(f"   ⚠️  last_cetec_sync: {e}")
                
                print("✅ Cetec integration columns migration complete")
            else:
                print("✅ Cetec integration columns already exist in work_orders")
    except Exception as e:
        print(f"❌ ERROR during Cetec column migration: {e}")
        print(f"   This may cause issues with Cetec integration features.")
        print("   Continuing with seed...")
    
    # Add all role values to userrole enum if they don't exist
    try:
        with engine.begin() as conn:
            roles_to_add = ['admin', 'scheduler', 'operator', 'manager']
            
            for role in roles_to_add:
                # Check if role value exists
                result = conn.execute(text(
                    f"SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'userrole' AND e.enumlabel = '{role}')"
                ))
                role_exists = result.scalar()
                
                if not role_exists:
                    conn.execute(text(f"ALTER TYPE userrole ADD VALUE '{role}'"))
                    print(f"✓ Added '{role}' to userrole enum")
                else:
                    print(f"✓ '{role}' already exists in userrole enum")
    except Exception as e:
        print(f"Error adding enum values: {e}")
        raise
    
    # Add is_manual_only column to smt_lines table
    print("\n🔧 Adding is_manual_only column to smt_lines...")
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE smt_lines ADD COLUMN IF NOT EXISTS is_manual_only BOOLEAN DEFAULT FALSE"))
            conn.commit()
            print("   ✓ is_manual_only column added to smt_lines")
    except Exception as e:
        print(f"   Note: is_manual_only column migration: {str(e)}")
    
    # Add optimizer date columns for promise date management
    print("\n🔧 Adding optimizer date columns for promise date tracking...")
    try:
        with engine.connect() as conn:
            # Add new columns for optimizer (safe if already exist)
            new_columns = [
                "ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS earliest_completion_date DATE",
                "ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_start_date DATE",
                "ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_end_date DATE",
                "ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS promise_date_variance_days INTEGER",
                "ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS is_manual_schedule BOOLEAN DEFAULT FALSE"
            ]
            for sql in new_columns:
                try:
                    conn.execute(text(sql))
                except Exception as col_error:
                    print(f"   Note: {str(col_error)}")
            conn.commit()
            print("   ✓ Optimizer date columns added/verified")
    except Exception as e:
        print(f"   Note: Optimizer columns migration: {str(e)}")
    
    # Seed data
    db = SessionLocal()
    try:
        seed_lines(db)
        seed_users(db)
        seed_shifts_and_config(db)
        seed_statuses(db)
        seed_issue_types(db)
        seed_resolution_types(db)
        
        # Fix existing work orders with null status
        print("\n🔧 Checking for work orders with null status...")
        try:
            from models import WorkOrder, Status
            # Find "Unassigned" status in Status table
            unassigned_status = db.query(Status).filter(Status.name == "Unassigned").first()
            
            if unassigned_status:
                # Count WOs with both status and status_id as null
                null_status_count = db.query(WorkOrder).filter(
                    WorkOrder.status_id.is_(None)
                ).count()
                
                if null_status_count > 0:
                    print(f"   Found {null_status_count} work orders with null status")
                    print(f"   Setting them to UNASSIGNED (id={unassigned_status.id})...")
                    db.query(WorkOrder).filter(
                        WorkOrder.status_id.is_(None)
                    ).update(
                        {WorkOrder.status_id: unassigned_status.id},
                        synchronize_session=False
                    )
                    db.commit()
                    print(f"   ✓ Updated {null_status_count} work orders to UNASSIGNED")
                else:
                    print("   ✓ All work orders have a status assigned")
            else:
                print("   ⚠️  'Unassigned' status not found in Status table")
        except Exception as e:
            print(f"   Note: Status check: {e}")
        
        print("\n✅ Database seeded successfully!")
        print("\nDefault users:")
        print("  admin / admin123 (Admin - full system access)")
        print("  scheduler / password123 (Scheduler - full scheduling)")
        print("  operator / password123 (Operator - view & complete)")
        print("  manager / password123 (Manager - view only)")
        print("\nDefault shift: 7:30 AM - 4:30 PM (Mon-Fri)")
        print("Lunch break: 11:30 AM - 12:30 PM")
    finally:
        db.close()


if __name__ == "__main__":
    main()

