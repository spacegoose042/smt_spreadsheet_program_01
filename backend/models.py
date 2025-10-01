from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from database import Base


class UserRole(str, enum.Enum):
    SCHEDULER = "scheduler"
    OPERATOR = "operator"
    MANAGER = "manager"


class WorkOrderStatus(str, enum.Enum):
    CLEAR_TO_BUILD = "Clear to Build"
    CLEAR_TO_BUILD_NEW = "Clear to Build *"
    RUNNING = "Running"
    SECOND_SIDE_RUNNING = "2nd Side Running"
    ON_HOLD = "On Hold"
    PROGRAM_STENCIL = "Program/Stencil"


class Priority(str, enum.Enum):
    CRITICAL_MASS = "Critical Mass"
    OVERCLOCKED = "Overclocked"
    FACTORY_DEFAULT = "Factory Default"
    TRICKLE_CHARGE = "Trickle Charge"
    POWER_DOWN = "Power Down"


class SideType(str, enum.Enum):
    SINGLE = "Single"
    DOUBLE = "Double"


class THKitStatus(str, enum.Enum):
    CLEAR_TO_BUILD = "Clear to Build"
    MISSING = "Missing"
    SMT_ONLY = "SMT ONLY"
    NA = "N/A"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SMTLine(Base):
    __tablename__ = "smt_lines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # e.g., "1-EURO 264"
    description = Column(String)
    hours_per_day = Column(Float, default=8.0)
    hours_per_week = Column(Float, default=40.0)
    is_active = Column(Boolean, default=True)
    is_special_customer = Column(Boolean, default=False)  # For MCI line
    special_customer_name = Column(String)  # e.g., "MCI"
    order_position = Column(Integer)  # For display ordering
    
    work_orders = relationship("WorkOrder", back_populates="line")


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id = Column(Integer, primary_key=True, index=True)
    
    # Basic Info
    customer = Column(String, nullable=False)
    assembly = Column(String, nullable=False)
    revision = Column(String, nullable=False)
    wo_number = Column(String, unique=True, nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    
    # Status and Priority
    status = Column(SQLEnum(WorkOrderStatus), nullable=False)
    priority = Column(SQLEnum(Priority), default=Priority.FACTORY_DEFAULT)
    is_locked = Column(Boolean, default=False)  # "Locked if Highlighted"
    is_new_rev_assembly = Column(Boolean, default=False)  # Replaces asterisk
    is_complete = Column(Boolean, default=False)
    
    # Timing
    cetec_ship_date = Column(Date, nullable=False)
    actual_ship_date = Column(Date)  # Calculated
    wo_start_date = Column(Date)
    min_start_date = Column(Date)  # Calculated
    time_minutes = Column(Float, nullable=False)  # Build time in minutes
    setup_time_hours = Column(Float, default=0.0)  # Setup time based on trolleys
    
    # Resources
    trolley_count = Column(Integer, default=1)
    sides = Column(SQLEnum(SideType), default=SideType.SINGLE)
    
    # Line Assignment
    line_id = Column(Integer, ForeignKey("smt_lines.id"))
    line_position = Column(Integer)  # Position in the line queue (1, 2, 3...)
    
    # Through-Hole Info
    th_wo_number = Column(String)  # Through-hole work order number
    th_kit_status = Column(SQLEnum(THKitStatus), default=THKitStatus.NA)
    
    # Grouping
    run_together_group = Column(String)  # For "run together" assemblies
    
    # Notes
    notes = Column(String)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    line = relationship("SMTLine", back_populates="work_orders")
    completed_record = relationship("CompletedWorkOrder", back_populates="work_order", uselist=False)


class CompletedWorkOrder(Base):
    __tablename__ = "completed_work_orders"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), unique=True)
    
    # Actual completion data
    actual_start_date = Column(Date, nullable=False)
    actual_finish_date = Column(Date, nullable=False)
    actual_time_clocked_minutes = Column(Float, nullable=False)
    
    # Variance tracking
    estimated_time_minutes = Column(Float)  # Copied from WO
    time_variance_minutes = Column(Float)  # actual - estimated
    
    completed_at = Column(DateTime, default=datetime.utcnow)
    completed_by_user_id = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    work_order = relationship("WorkOrder", back_populates="completed_record")


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)
    value = Column(String, nullable=False)
    description = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

