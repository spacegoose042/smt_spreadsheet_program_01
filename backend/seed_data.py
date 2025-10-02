"""
Script to seed the database with initial data (lines, sample work orders)
"""
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, SMTLine, User, UserRole, Shift, ShiftBreak, LineConfiguration
from passlib.context import CryptContext
from datetime import time

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed_shifts_and_config(db: Session):
    """Create default shifts and configurations for all lines"""
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
    """Create default users"""
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
        existing = db.query(User).filter(User.username == user.username).first()
        if not existing:
            db.add(user)
    
    db.commit()
    print("✓ Seeded users (default password: password123)")


def main():
    """Run all seeding functions"""
    # Create tables (this will create new tables and columns)
    try:
        Base.metadata.create_all(bind=engine)
        print("✓ Created database tables")
    except Exception as e:
        print(f"Note: {e}")
        print("Continuing with seed...")
    
    # Add admin to userrole enum if it doesn't exist
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'admin'"))
            conn.commit()
        print("✓ Added admin role to enum")
    except Exception as e:
        print(f"Note: {e}")
    
    # Seed data
    db = SessionLocal()
    try:
        seed_lines(db)
        seed_users(db)
        seed_shifts_and_config(db)
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

