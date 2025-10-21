from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, ForeignKey, Enum as SQLEnum, Time
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    SCHEDULER = "scheduler"
    OPERATOR = "operator"
    MANAGER = "manager"


# Legacy enum - keeping for migration compatibility
class WorkOrderStatus(str, enum.Enum):
    UNASSIGNED = "Unassigned"
    CLEAR_TO_BUILD = "Clear to Build"
    CLEAR_TO_BUILD_NEW = "Clear to Build *"
    RUNNING = "Running"
    SECOND_SIDE_RUNNING = "2nd Side Running"
    ON_HOLD = "On Hold"
    PROGRAM_STENCIL = "Program/Stencil"


class Status(Base):
    """
    Configurable work order statuses.
    Admins can add/edit/delete statuses as needed.
    """
    __tablename__ = "statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    color = Column(String, default="#6c757d")  # Badge color (hex)
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)  # For sorting in dropdowns
    is_system = Column(Boolean, default=False)  # System statuses can't be deleted
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    work_orders = relationship("WorkOrder", back_populates="status_obj")


class IssueType(Base):
    """
    Configurable issue types for work orders.
    Admins can add/edit/delete issue types as needed.
    """
    __tablename__ = "issue_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    color = Column(String, default="#dc3545")  # Badge color (hex)
    category = Column(String, nullable=True)  # Optional grouping (Packaging, Parts, etc.)
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    issues = relationship("Issue", back_populates="issue_type_obj")


class ResolutionType(Base):
    """
    Configurable resolution types for issues.
    Tracks how issues were resolved.
    """
    __tablename__ = "resolution_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    color = Column(String, default="#28a745")  # Badge color (hex)
    category = Column(String, nullable=True)  # Optional grouping
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    issues = relationship("Issue", back_populates="resolution_type_obj")


class IssueSeverity(str, enum.Enum):
    MINOR = "Minor"
    MAJOR = "Major"
    BLOCKER = "Blocker"


class IssueStatus(str, enum.Enum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"


class Issue(Base):
    """
    Issues logged against work orders.
    Tracks problems that need resolution.
    """
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=False, index=True)
    issue_type_id = Column(Integer, ForeignKey("issue_types.id"), nullable=False)
    severity = Column(SQLEnum(IssueSeverity), default=IssueSeverity.MINOR)
    status = Column(SQLEnum(IssueStatus), default=IssueStatus.OPEN)
    description = Column(String, nullable=False)
    
    # Tracking
    reported_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reported_at = Column(DateTime, default=datetime.utcnow)
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    
    # Resolution details
    resolution_type_id = Column(Integer, ForeignKey("resolution_types.id"), nullable=True)
    resolution_notes = Column(String, nullable=True)
    
    # Relationships
    work_order = relationship("WorkOrder", back_populates="issues")
    issue_type_obj = relationship("IssueType", back_populates="issues")
    resolution_type_obj = relationship("ResolutionType", back_populates="issues")
    reported_by = relationship("User", foreign_keys=[reported_by_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])


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
    role = Column(SQLEnum(UserRole, values_callable=lambda x: [e.value for e in x]), nullable=False)
    is_active = Column(Boolean, default=True)
    assigned_line_id = Column(Integer, ForeignKey("smt_lines.id"))  # For operators
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    assigned_line = relationship("SMTLine")


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
    is_manual_only = Column(Boolean, default=False)  # Hand-build line (no auto-scheduling)
    order_position = Column(Integer)  # For display ordering
    
    work_orders = relationship("WorkOrder", back_populates="line")
    shifts = relationship("Shift", back_populates="line", cascade="all, delete-orphan")
    configuration = relationship("LineConfiguration", back_populates="line", uselist=False, cascade="all, delete-orphan")


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
    status = Column(SQLEnum(WorkOrderStatus), nullable=True)  # Legacy - will be migrated
    status_id = Column(Integer, ForeignKey("statuses.id"), nullable=True)  # New FK to Status table
    priority = Column(SQLEnum(Priority), default=Priority.FACTORY_DEFAULT)
    is_locked = Column(Boolean, default=False)  # "Locked if Highlighted"
    is_manual_schedule = Column(Boolean, default=False)  # Exclude from auto-scheduler (hand-built schedules)
    is_new_rev_assembly = Column(Boolean, default=False)  # Replaces asterisk
    is_complete = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)  # Deleted flag from Cetec
    is_canceled = Column(Boolean, default=False)  # Canceled flag from Cetec
    
    # Timing (Dates)
    cetec_ship_date = Column(Date, nullable=False)  # Original customer promise from Cetec (NEVER CHANGE)
    actual_ship_date = Column(Date)  # Calculated (adjusted for SMT-only)
    min_start_date = Column(Date)  # Calculated (earliest we can start)
    earliest_completion_date = Column(Date, nullable=True)  # Calculated (earliest we can finish based on capacity)
    scheduled_start_date = Column(Date, nullable=True)  # Optimizer's planned start date
    scheduled_end_date = Column(Date, nullable=True)  # Optimizer's planned completion date
    promise_date_variance_days = Column(Integer, nullable=True)  # Days early/late vs cetec_ship_date (negative = early, positive = late)
    time_minutes = Column(Float, nullable=False)  # Build time in minutes
    setup_time_hours = Column(Float, default=0.0)  # Setup time based on trolleys
    
    # Timing (DateTimes - for time-of-day scheduling)
    calculated_start_datetime = Column(DateTime)  # When job will actually start
    calculated_end_datetime = Column(DateTime)    # When job will actually end
    wo_start_datetime = Column(DateTime)  # Manual override for start time
    
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
    
    # Cetec Integration
    cetec_ordline_id = Column(Integer, nullable=True, index=True)  # Cetec ordline_id for linking
    current_location = Column(String, nullable=True)  # Current work location from Cetec
    material_status = Column(String, nullable=True)  # "Ready", "Partial", "Shortage"
    last_cetec_sync = Column(DateTime, nullable=True)  # When last synced from Cetec
    
    # Cetec Progress Tracking
    cetec_original_qty = Column(Integer, nullable=True)  # oorderqty from Cetec
    cetec_balance_due = Column(Integer, nullable=True)   # balancedue from Cetec
    cetec_shipped_qty = Column(Integer, nullable=True)  # shipqty from Cetec
    cetec_invoiced_qty = Column(Integer, nullable=True) # invoice_qty from Cetec
    cetec_completed_qty = Column(Integer, nullable=True) # sum of pieces_completed from ordlinework
    cetec_remaining_qty = Column(Integer, nullable=True) # calculated: original - completed
    cetec_status_progress = Column(Text, nullable=True) # JSON string of status_id -> completed_qty mapping
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    line = relationship("SMTLine", back_populates="work_orders")
    status_obj = relationship("Status", back_populates="work_orders")
    completed_record = relationship("CompletedWorkOrder", back_populates="work_order", uselist=False)
    issues = relationship("Issue", back_populates="work_order", cascade="all, delete-orphan")
    
    # Helper Methods for Optimizer
    def calculate_promise_date_variance(self) -> int:
        """
        Calculate days early/late vs Cetec promise date.
        Returns:
            int: Days variance (negative = early, positive = late)
        """
        if not self.scheduled_end_date or not self.cetec_ship_date:
            return None
        delta = (self.scheduled_end_date - self.cetec_ship_date).days
        return delta
    
    def is_at_risk(self) -> bool:
        """
        Check if job might miss promise date based on earliest completion date.
        Returns:
            bool: True if earliest completion is after promise date
        """
        if not self.earliest_completion_date or not self.cetec_ship_date:
            return False
        return self.earliest_completion_date > self.cetec_ship_date
    
    def will_be_late(self) -> bool:
        """
        Check if currently scheduled job will be late.
        Returns:
            bool: True if scheduled end date is after promise date
        """
        if not self.scheduled_end_date or not self.cetec_ship_date:
            return False
        return self.scheduled_end_date > self.cetec_ship_date
    
    def get_priority_rank(self) -> int:
        """
        Numeric rank for sorting (lower = higher priority).
        Used by optimizer for job sequencing.
        Returns:
            int: Priority rank (1 = highest priority)
        """
        priority_map = {
            Priority.CRITICAL_MASS: 1,
            Priority.OVERCLOCKED: 2,
            Priority.FACTORY_DEFAULT: 3,
            Priority.TRICKLE_CHARGE: 4,
            Priority.POWER_DOWN: 5
        }
        return priority_map.get(self.priority, 999)
    
    def is_mci_job(self) -> bool:
        """
        Check if this is an MCI job (should go to Line 4).
        Matches: "Midcontinent Instruments", "MCI", "MIDCONTINENT", etc.
        Returns:
            bool: True if customer is MCI/Midcontinent
        """
        if not self.customer:
            return False
        customer_upper = self.customer.upper()
        return (
            "MIDCONTINENT" in customer_upper or 
            "MCI" in customer_upper or
            "MID CONTINENT" in customer_upper  # Handle space variation
        )


class CetecSyncLog(Base):
    """
    Tracks changes from Cetec API imports for reporting.
    """
    __tablename__ = "cetec_sync_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    sync_date = Column(DateTime, default=datetime.utcnow, index=True)
    wo_number = Column(String, nullable=False, index=True)
    change_type = Column(String, nullable=False)  # "created", "date_changed", "qty_changed", "location_changed", "material_changed"
    field_name = Column(String, nullable=True)  # Which field changed
    old_value = Column(String, nullable=True)  # Previous value
    new_value = Column(String, nullable=True)  # New value
    cetec_ordline_id = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)


class CompletedWorkOrder(Base):
    __tablename__ = "completed_work_orders"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), unique=True)
    
    # Actual completion data
    actual_start_date = Column(Date, nullable=False)
    actual_finish_date = Column(Date, nullable=False)
    actual_time_clocked_minutes = Column(Float, nullable=False)
    quantity_completed = Column(Integer, nullable=False)
    
    # Variance tracking
    estimated_time_minutes = Column(Float)  # Copied from WO
    time_variance_minutes = Column(Float)  # actual - estimated
    estimated_quantity = Column(Integer)  # Copied from WO
    quantity_variance = Column(Integer)  # actual - estimated
    
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


class Shift(Base):
    """
    Defines a work shift for a production line.
    Lines can have multiple shifts per day.
    """
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    line_id = Column(Integer, ForeignKey("smt_lines.id"), nullable=False)
    
    # Shift identification
    name = Column(String, nullable=False)  # e.g., "Day Shift", "Evening Shift"
    shift_number = Column(Integer, default=1)  # 1, 2, 3 for ordering
    
    # Shift times (stored as time objects)
    start_time = Column(Time, nullable=False)  # e.g., 07:30:00
    end_time = Column(Time, nullable=False)    # e.g., 16:30:00
    
    # Days of week this shift runs (comma-separated: "1,2,3,4,5" for Mon-Fri)
    active_days = Column(String, default="1,2,3,4,5")  # 1=Mon, 7=Sun
    
    # Active status
    is_active = Column(Boolean, default=True)
    
    # Relationships
    line = relationship("SMTLine", back_populates="shifts")
    breaks = relationship("ShiftBreak", back_populates="shift", cascade="all, delete-orphan")


class ShiftBreak(Base):
    """
    Defines breaks during a shift (lunch, etc.)
    """
    __tablename__ = "shift_breaks"

    id = Column(Integer, primary_key=True, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=False)
    
    # Break details
    name = Column(String, nullable=False)  # e.g., "Lunch"
    start_time = Column(Time, nullable=False)  # e.g., 11:30:00
    end_time = Column(Time, nullable=False)    # e.g., 12:30:00
    is_paid = Column(Boolean, default=False)
    
    # Relationships
    shift = relationship("Shift", back_populates="breaks")


class LineConfiguration(Base):
    """
    Additional configuration for production lines
    """
    __tablename__ = "line_configurations"

    id = Column(Integer, primary_key=True, index=True)
    line_id = Column(Integer, ForeignKey("smt_lines.id"), unique=True, nullable=False)
    
    # Buffer time between jobs (in minutes)
    buffer_time_minutes = Column(Float, default=15.0)
    
    # Time rounding (in minutes) - rounds job times to nearest X minutes
    time_rounding_minutes = Column(Integer, default=15)  # Round to 15-min intervals
    
    # Timezone
    timezone = Column(String, default="America/Chicago")  # CST
    
    # Relationships
    line = relationship("SMTLine", back_populates="configuration")


class CapacityOverride(Base):
    """
    Override capacity for specific dates/date ranges.
    Allows flexible scheduling like overtime, short days, or different shifts.
    """
    __tablename__ = "capacity_overrides"

    id = Column(Integer, primary_key=True, index=True)
    line_id = Column(Integer, ForeignKey("smt_lines.id"), nullable=False)
    
    # Date range this override applies to
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)  # Same as start_date for single day
    
    # Override configuration
    total_hours = Column(Float, nullable=False)  # Total working hours for the day
    shift_config = Column(String)  # JSON string with shift details (start/end times, breaks)
    
    # Description
    reason = Column(String)  # e.g., "Overtime to finish Subsite order", "Half day"
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_user_id = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    line = relationship("SMTLine")
    created_by = relationship("User")

