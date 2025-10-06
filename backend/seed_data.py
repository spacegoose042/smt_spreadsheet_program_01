"""
Script to seed the database with initial data (lines, sample work orders)
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
            description="Manual assembly for small jobs",
            hours_per_day=8.0,
            hours_per_week=40.0,
            is_active=True,
            order_position=5
        )
    ]
    
    for line in lines:
        existing = db.query(SMTLine).filter(SMTLine.name == line.name).first()
        if not existing:
            db.add(line)
    
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
                print("Adding Cetec integration columns to work_orders...")
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN cetec_ordline_id INTEGER"))
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN current_location VARCHAR"))
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN material_status VARCHAR"))
                conn.execute(text("ALTER TABLE work_orders ADD COLUMN last_cetec_sync TIMESTAMP"))
                print("✓ Added Cetec integration columns to work_orders")
            else:
                print("✓ Cetec integration columns already exist in work_orders")
    except Exception as e:
        print(f"Note: Cetec column check/add: {e}")
        print("Continuing with seed...")
    
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
    
    # Seed data
    db = SessionLocal()
    try:
        seed_lines(db)
        seed_users(db)
        seed_shifts_and_config(db)
        seed_issue_types(db)
        seed_resolution_types(db)
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

