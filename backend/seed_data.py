"""
Script to seed the database with initial data (lines, sample work orders)
"""
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, SMTLine, User, UserRole
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
    # Create tables
    Base.metadata.create_all(bind=engine)
    print("✓ Created database tables")
    
    # Seed data
    db = SessionLocal()
    try:
        seed_lines(db)
        seed_users(db)
        print("\n✅ Database seeded successfully!")
        print("\nDefault users:")
        print("  scheduler / password123")
        print("  operator / password123")
        print("  manager / password123")
    finally:
        db.close()


if __name__ == "__main__":
    main()

